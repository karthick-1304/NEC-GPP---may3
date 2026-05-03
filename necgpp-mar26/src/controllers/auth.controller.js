// src/controllers/auth.controller.js
import jwt         from 'jsonwebtoken';
import bcrypt      from 'bcryptjs';
import crypto      from 'crypto';

import { executeQuery, withTransaction } from '../config/db.js';
import {
  redisSet, redisGet, redisDel,
  redisSetAdd, redisSetMembers, redisSetRemove,
  redisTTL,
} from '../config/redis.js';

import { AppError }        from '../utils/appError.js';
import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import * as emailService from '../services/email.service.js';
import logger              from '../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCESS_SECRET          = process.env.JWT_ACCESS_SECRET;
const ACCESS_EXPIRES_IN      = process.env.JWT_ACCESS_EXPIRES_IN      || '15m';
const REFRESH_EXPIRES_SECONDS= parseInt(process.env.JWT_REFRESH_EXPIRES_SECONDS) || 604800; // 7 days
const REFRESH_GRACE_SECONDS  = parseInt(process.env.JWT_REFRESH_GRACE_SECONDS)   || 30;     // brief window where the just-rotated old hash still works
const OTP_EXPIRY_SECONDS     = parseInt(process.env.OTP_EXPIRY_SECONDS)     || 600;  // 10 min
const OTP_COOLDOWN_SECONDS   = parseInt(process.env.OTP_COOLDOWN_SECONDS)   || 120;  // 2 min
const OTP_DIGITS             = parseInt(process.env.OTP_DIGITS)             || 6;
const BCRYPT_SALT_ROUNDS     = parseInt(process.env.BCRYPT_SALT_ROUNDS)     || 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const signAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex');

const generateOtp = () => {
  // Generates a cryptographically random N-digit OTP string
  const max = Math.pow(10, OTP_DIGITS);
  const min = Math.pow(10, OTP_DIGITS - 1);
  return String(crypto.randomInt(min, max));
};

// Sets the refresh token as an httpOnly session cookie.
// No maxAge / expires → session cookie → deleted when browser closes.
// This is intentional for the college shared-PC environment.
const setRefreshCookie = (res, rawToken) => {
  res.cookie('refreshToken', rawToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/',
    // No maxAge — session cookie, dies on browser close
  });
};

const clearRefreshCookie = (res) => {
  // path must match what was set, otherwise the browser keeps the cookie.
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/',
  });
};

// Stores refresh token in Redis + adds family to user's session Set
const storeRefreshToken = async (userId, family, tokenHash) => {
  const key  = `refresh:${family}`;
  const data = JSON.stringify({ userId, family, tokenHash });

  await redisSet(key, data, REFRESH_EXPIRES_SECONDS);

  // Track this family under the user — allows force-logout all sessions
  await redisSetAdd(
    `user:${userId}:sessions`,
    family,
    REFRESH_EXPIRES_SECONDS
  );
};

// Deletes one refresh family from Redis + removes from user session Set
const deleteRefreshToken = async (userId, family) => {
  await redisDel(`refresh:${family}`);
  await redisSetRemove(`user:${userId}:sessions`, family);
};

const buildUserPayload = (user, roleData = {}) => ({
  user_id:          user.user_id,
  full_name:        user.full_name,
  email:            user.email,
  role:             user.role,
  last_login:       user.last_login,
  // dept info (null for Admin)
  dept_id:          roleData.dept_id   ?? null,
  dept_name:        roleData.dept_name ?? null,
  dept_code:        roleData.dept_code ?? null,
  // student-specific (null for other roles)
  reg_num:          roleData.reg_num          ?? null,
  practice_score:   roleData.practice_score   ?? null,
  test_score:       roleData.test_score       ?? null,
  lev_1_completed:  roleData.lev_1_completed  ?? null,
  lev_2_completed:  roleData.lev_2_completed  ?? null,
  topics_completed: roleData.topics_completed ?? null,
  batch_year:       roleData.batch_year       ?? null,
  // staff-specific (null for other roles)
  is_tutor:         roleData.is_tutor          ?? null,
  tutor_batch_year: roleData.tutor_batch_year  ?? null,
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // 1. Find user by email
  const users = await executeQuery(
    `SELECT user_id, full_name, email, password_hash, role, last_login
     FROM users WHERE email = ?`,
    [email]
  );

  if (!users.length) {
    throw new AppError('Invalid email or password.', 401);
    // Deliberately vague — never tell attacker which field is wrong
  }

  const user = users[0];

  // 2. Verify password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid email or password.', 401);
  }

  // 3. Fetch role-specific data in parallel
  let roleData = {};

  if (user.role === 'Student') {
    const rows = await executeQuery(
      `SELECT s.reg_num, s.dept_id, s.batch_year, s.practice_score, s.test_score,
              s.lev_1_completed, s.lev_2_completed, s.topics_completed,
              d.dept_name, d.dept_code
       FROM   students s
       LEFT JOIN departments d ON s.dept_id = d.dept_id
       WHERE  s.student_id = ?`,
      [user.user_id]
    );
    roleData = rows[0] ?? {};

  } else if (user.role === 'Staff') {
    const rows = await executeQuery(
      `SELECT st.dept_id, d.dept_name, d.dept_code, st.is_tutor, st.tutor_batch_year 
       FROM   staffs st
       LEFT JOIN departments d ON st.dept_id = d.dept_id
       WHERE  st.staff_id = ?`,
      [user.user_id]
    );
    roleData = rows[0] ?? {};

  } else if (user.role === 'Dept Head') {
    const rows = await executeQuery(
      `SELECT dept_id, dept_name, dept_code FROM departments Where head_user_id=?`,
      [user.user_id]
    );
    roleData = rows[0] ?? {};
  }
  // Admin has no roleData — deptId/deptCode will be null

  // 4. Issue tokens
  const family      = crypto.randomUUID();
  const rawRefresh  = crypto.randomUUID();
  const tokenHash   = hashToken(rawRefresh);

  const accessToken = signAccessToken({
    userId: user.user_id,
    role:   user.role,
    deptId: roleData.dept_id ?? null,
  });

  await storeRefreshToken(user.user_id, family, tokenHash);

  // 5. Update last_login timestamp
  await executeQuery(
    'UPDATE users SET last_login = NOW() WHERE user_id = ?',
    [user.user_id]
  );

  // 6. Set cookie + respond
  setRefreshCookie(res, `${family}:${rawRefresh}`);
  // Cookie value is "family:rawToken" so we can extract family on refresh
  // without a second DB/Redis lookup

  logger.info('User logged in', { userId: user.user_id, role: user.role });

  return successResponse(
    res,
    { accessToken, user: buildUserPayload(user, roleData) },
    'Login successful'
  );
});

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
export const refresh = catchAsync(async (req, res) => {
  const cookie = req.cookies.refreshToken;
  if (!cookie) throw new AppError('No refresh token. Please log in again.', 401);

  // Cookie format: "family:rawToken"
  const colonIdx   = cookie.indexOf(':');
  const family     = cookie.substring(0, colonIdx);
  const rawToken   = cookie.substring(colonIdx + 1);

  if (!family || !rawToken) {
    throw new AppError('Malformed refresh token. Please log in again.', 401);
  }

  // Look up stored token data from Redis
  const stored = await redisGet(`refresh:${family}`);

  if (!stored) {
    // Token not found — expired naturally
    clearRefreshCookie(res);
    throw new AppError('Refresh token expired or invalid. Please log in again.', 401);
  }

  const { userId, tokenHash: storedHash, prevHash, prevHashExpires } = JSON.parse(stored);

  // Verify the raw token matches what we stored.
  // We accept the immediately-previous hash for a short grace window to handle
  // benign concurrent /refresh calls from the same browser. Anything older or
  // outside the window is treated as theft.
  const incomingHash    = hashToken(rawToken);
  const matchesCurrent  = incomingHash === storedHash;
  const matchesPrev     = prevHash &&
                          incomingHash === prevHash &&
                          prevHashExpires &&
                          prevHashExpires > Math.floor(Date.now() / 1000);

  if (!matchesCurrent && !matchesPrev) {
    // Hash mismatch — family exists but wrong token presented.
    // This is the theft detection case — nuke the entire family.
    await deleteRefreshToken(userId, family);
    clearRefreshCookie(res);
    logger.warn('Refresh token reuse detected — family nuked', { userId, family });
    throw new AppError('Security alert detected. Please log in again.', 401);
  }

  // Fetch user for fresh payload (role/dept may have changed)
  const users = await executeQuery(
    'SELECT user_id, role FROM users WHERE user_id = ?',
    [userId]
  );
  if (!users.length) throw new AppError('User no longer exists.', 401);

  const user = users[0];

  // Fetch deptId for non-admin roles
  let deptId = null;
  if (user.role === 'Student' || user.role === 'Staff') {
    const table = user.role === 'Student' ? 'students' : 'staffs';
    const col   = user.role === 'Student' ? 'student_id' : 'staff_id';
    const rows  = await executeQuery(
      `SELECT dept_id FROM ${table} WHERE ${col} = ?`,
      [userId]
    );
    deptId = rows[0]?.dept_id ?? null;
  }
  else if (user.role === 'Dept Head') {
    const rows = await executeQuery(
      `SELECT dept_id FROM departments WHERE head_user_id = ?`,
      [userId]
    );
    deptId = rows[0]?.dept_id ?? null;
  }


  // ── Rotate token ─────────────────────────────────────────────────────────
  const newRawRefresh = crypto.randomUUID();
  const newTokenHash  = hashToken(newRawRefresh);

  //  Replace the old token with the new one in Redis. Keep the previous hash
  //  alive for a short grace window so concurrent /refresh calls don't get
  //  flagged as theft and nuke the family.
  const newPrevHashExpires = Math.floor(Date.now() / 1000) + REFRESH_GRACE_SECONDS;
  await redisSet(
    `refresh:${family}`,
    JSON.stringify({
      userId, family,
      tokenHash:       newTokenHash,
      prevHash:        storedHash,
      prevHashExpires: newPrevHashExpires,
    }),
    REFRESH_EXPIRES_SECONDS
  );
  // Session Set keeps the same family entry — no change needed

  const accessToken = signAccessToken({ userId, role: user.role, deptId });

  setRefreshCookie(res, `${family}:${newRawRefresh}`);

  return successResponse(res, { accessToken }, 'Token refreshed');
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = catchAsync(async (req, res) => {
  const cookie = req.cookies.refreshToken;

  if (cookie) {
    const colonIdx = cookie.indexOf(':');
    const family   = cookie.substring(0, colonIdx);

    // Best-effort — if Redis is down this still clears the cookie
    if (family) {
      const stored = await redisGet(`refresh:${family}`);
      if (stored) {
        const { userId } = JSON.parse(stored);
        await deleteRefreshToken(userId, family);
      }
    }
  }

  clearRefreshCookie(res);
  return successResponse(res, {}, 'Logged out successfully');
});

// ─── FORGOT PASSWORD — send OTP ───────────────────────────────────────────────
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  // Always respond with the same message whether user exists or not.
  // Prevents email enumeration attacks.
  const SAFE_RESPONSE = 'If that email is registered with us, an OTP has been sent.';

  const users = await executeQuery(
    'SELECT user_id, full_name, email FROM users WHERE email = ?',
    [email]
  );

  if (!users.length) {
    // Don't reveal that the email doesn't exist
    return successResponse(res, {}, SAFE_RESPONSE);
  }

  const user = users[0];

  // ── Cooldown check ────────────────────────────────────────────────────────
  // Prevent OTP spam — check if a recent OTP was already sent
  const cooldownKey = `otp:cooldown:${email}`;
  const onCooldown  = await redisGet(cooldownKey);
  if (onCooldown) {
    // Get the EXACT seconds remaining from Redis instead of using the constant.
    // This tells the user precisely how long to wait (e.g. 47s, not always 120s).
    const secsLeft = await redisTTL(cooldownKey);
    const waitMsg  = secsLeft > 0
      ? `Please wait ${secsLeft} second${secsLeft === 1 ? '' : 's'} before requesting another OTP.`
      : 'Please wait a moment before requesting another OTP.';
    throw new AppError(waitMsg, 429);
  }

  // ── Generate and store OTP ────────────────────────────────────────────────
  const otp     = generateOtp();
  const otpHash = hashToken(otp);

  // Store hash in Redis — auto-expires, no cleanup needed
  await redisSet(`otp:${email}`, otpHash, OTP_EXPIRY_SECONDS);

  // Set cooldown so they can't spam OTP requests
  await redisSet(cooldownKey, '1', OTP_COOLDOWN_SECONDS);

  // ── Send email ────────────────────────────────────────────────────────────
  emailService.sendForgotPasswordEmail(user, otp, OTP_EXPIRY_SECONDS / 60)
    .catch(err => logger.error('Forgot password mail failed', { err: err.message }));

  logger.info('OTP sent for password reset', { userId: user.user_id, email });
  return successResponse(res, {}, SAFE_RESPONSE);
});

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────
// Separate step — client submits email + OTP to verify before showing reset form.
// On success, we issue a short-lived "verified" token so the reset step
// doesn't need to re-verify the OTP.

export const verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const storedHash = await redisGet(`otp:${email}`);
  if (!storedHash) {
    throw new AppError('OTP has expired or was never issued. Please request a new OTP.', 400);
  }

  const incomingHash = hashToken(otp);
  if (incomingHash !== storedHash) {
    throw new AppError('Invalid OTP. Please check and try again.', 400);
  }

  // OTP is correct — mark as verified in Redis so reset step can proceed
  // Keep original OTP hash alive (same TTL window) but add a verified flag
  // The reset step checks for this verified flag
  await redisSet(`otp:verified:${email}`, '1', OTP_EXPIRY_SECONDS);

  return successResponse(res, {}, 'OTP verified successfully.');
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
export const resetPassword = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Double-check OTP is still valid
  const storedHash = await redisGet(`otp:${email}`);
  if (!storedHash) {
    throw new AppError('Reset password failed. Please request a new OTP.', 400);
  }

  const incomingHash = hashToken(otp);
  if (incomingHash !== storedHash) {
    throw new AppError('Reset password failed. Please request a new OTP.', 400);
  }

  // Check the verified flag exists (user went through verifyOtp step)
  const isVerified = await redisGet(`otp:verified:${email}`);
  if (!isVerified) {
    throw new AppError('Reset password failed. Please request a new OTP.', 400);
  }

  // Find the user
  const users = await executeQuery(
    'SELECT user_id, full_name, email FROM users WHERE email = ?',
    [email]
  );
  if (!users.length) throw new AppError('User not found.', 404);

  const user = users[0];

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await withTransaction(async (conn) => {
    // Update password
    await conn.execute(
      'UPDATE users SET password_hash = ? WHERE user_id = ?',
      [passwordHash, user.user_id]
    );

    // Invalidate ALL active sessions — force re-login on all devices
    // Security: if attacker reset the password, their sessions die too
    const families = await redisSetMembers(`user:${user.user_id}:sessions`);
    for (const family of families) {
      await redisDel(`refresh:${family}`);
    }
    await redisDel(`user:${user.user_id}:sessions`);
  });

  // Clean up OTP keys from Redis
  await redisDel(`otp:${email}`, `otp:verified:${email}`, `otp:cooldown:${email}`);

  // Send confirmation email
  emailService.sendPasswordChangedEmail(user)
    .catch(err => logger.error('Password reset confirmation mail failed', { err: err.message }));

  logger.info('Password reset successfully', { userId: user.user_id });
  return successResponse(res, {}, 'Password reset successfully. Please log in with your new password.');
});
  
// ─── CHANGE PASSWORD (logged in) ──────────────────────────────────────────────
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

  // Fetch current password hash
  const users = await executeQuery(
    'SELECT user_id, full_name, email, password_hash FROM users WHERE user_id = ?',
    [userId]
  );
  if (!users.length) throw new AppError('User not found.', 404);

  const user = users[0];

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) {
    throw new AppError('Current password is incorrect.', 400);
  }

  // Prevent setting the same password
  const isSame = await bcrypt.compare(newPassword, user.password_hash);
  if (isSame) {
    throw new AppError('New password must be different from your current password.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await executeQuery(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [passwordHash, userId]
  );

  // After updating password in changePassword:
  const families = await redisSetMembers(`user:${userId}:sessions`);
  const cookie   = req.cookies.refreshToken;
  const currentFamily = cookie ? cookie.substring(0, cookie.indexOf(':')) : null;

  for (const family of families) {
    if (family !== currentFamily) {        // keep current session alive
      await redisDel(`refresh:${family}`);
      await redisSetRemove(`user:${userId}:sessions`, family);
    }
  }

  // Send notification email
  emailService.sendPasswordChangedEmail(user)
    .catch(err => logger.error('Change password notification mail failed', { err: err.message }));

  logger.info('Password changed', { userId });
  return successResponse(res, {}, 'Password changed successfully.');
});

