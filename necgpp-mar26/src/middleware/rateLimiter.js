// src/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';
import logger    from '../utils/logger.js';

const buildHandler = (logType, message) => (req, res) => {
  logger.logSecurityEvent(logType, req);
  res.status(429).json({
    success:    false,
    message,
    retryAfter: res.getHeader('Retry-After'),
  });
};

// ─── General API Protection ───────────────────────────────────────────────────
// Window  : 15 minutes
// Max     : 100 requests
// Key     : IP only
// Counts successful requests : YES
// Applied : ALL /api/ routes globally
export const rateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('RATE_LIMIT_EXCEEDED', 'Too many requests. Please wait 15 minutes and try again.'),
});

// ─── Login Brute Force Protection ────────────────────────────────────────────
// Window  : 15 minutes
// Max     : 10 attempts
// Key     : IP + email  →  "auth:{ip}:{email}"
// Counts successful requests : NO — only failed logins counted
// Applied : /api/v1/auth routes
export const authLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    10,
  skipSuccessfulRequests: true,
  standardHeaders:        true,
  legacyHeaders:          false,
  keyGenerator: (req) => {
    const ip    = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const email = req.body?.email?.toLowerCase()?.trim() || 'unknown';
    return `auth:${ip}:${email}`;
  },
  validate: { default: false },
  handler: buildHandler('AUTH_RATE_LIMIT_EXCEEDED', 'Too many failed login attempts. Please wait 15 minutes.'),
});

// ─── OTP Request Protection ───────────────────────────────────────────────────
// Window  : 15 minutes
// Max     : 5 requests
// Key     : IP + email  →  "otp:{ip}:{email}"
// Counts successful requests : YES  (only 2xx responses consume quota)
// Counts failed requests     : NO   ← important: see comment below
// Applied : forgot-password / send-OTP route
//
// `skipFailedRequests: true` is the key fix for the OTP cooldown / rate-limit
// conflict. The flow used to be:
//
//   1. User clicks "Send OTP"  → bucket -1, OTP sent, 2-min cooldown set.
//   2. User clicks again during cooldown → bucket -1 (still increments!),
//      controller throws 429 "wait Ns".
//   3. User keeps clicking during cooldown → bucket drained.
//   4. After cooldown expires → otpLimiter itself rejects with 429
//      "wait 15 minutes". User is locked out even though they only ever
//      caused ONE successful send.
//
// With skipFailedRequests, the limiter listens for the response `finish`
// event and decrements the bucket back when statusCode >= 400. So
// cooldown-rejected attempts (429), validation rejections (400), etc. no
// longer eat quota — only actual successful OTP sends (200) do.
export const otpLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    5,
  skipFailedRequests:     true,
  standardHeaders:        true,
  legacyHeaders:          false,
  keyGenerator: (req) => {
    const ip    = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const email = req.body?.email?.toLowerCase()?.trim() || 'unknown';
    return `otp:${ip}:${email}`;
  },
  validate: { default: false },
  handler: buildHandler('OTP_RATE_LIMIT_EXCEEDED', 'Too many OTP requests. Please wait 15 minutes.'),
});

// ─── Change Password Protection ───────────────────────────────────────────────
// Window  : 1 hour
// Max     : 3 attempts
// Key     : IP only
// Counts successful requests : YES
// Applied : change-password route
export const passwordChangeLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('PASSWORD_CHANGE_RATE_LIMIT', 'Password change limit reached. Please wait 1 hour.'),
});

// ─── Excel Upload Protection ──────────────────────────────────────────────────
// Window  : 30 minutes
// Max     : 50 uploads
// Key     : IP only
// Counts successful requests : YES
// Applied : set creation / question upload routes
export const uploadLimiter = rateLimit({
  windowMs:        30 * 60 * 1000,
  max:             50,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('UPLOAD_RATE_LIMIT_EXCEEDED', 'Too many upload attempts. Please wait 1 hour.'),
});