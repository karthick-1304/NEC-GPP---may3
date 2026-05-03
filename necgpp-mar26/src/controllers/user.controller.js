// src/controllers/user.controller.js
import { executeQuery }    from '../config/db.js';
import { AppError }        from '../utils/appError.js';
import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';

import { redisSetMembers , redisDel, redisSetRemove} from '../config/redis.js';


// ─── GET PROFILE ──────────────────────────────────────────────────────────────
// Returns full role-aware profile for the logged-in user.
// Used by the View Profile page.

export const getProfile = catchAsync(async (req, res) => {
  const { userId, role } = req.user;

  // Base user data — common for all roles
  const users = await executeQuery(
    `SELECT user_id, full_name, email, phone_number, role, last_login
     FROM users WHERE user_id = ?`,
    [userId]
  );
  if (!users.length) throw new AppError('User not found.', 404);

  const user    = users[0];
  let   profile = { ...user };

  const families       = await redisSetMembers(`user:${userId}:sessions`);
  profile.active_sessions = families.length;

  // ── Student ───────────────────────────────────────────────────────────────
  if (role === 'Student') {
    const rows = await executeQuery(
      `SELECT
         s.reg_num, 
         s.batch_year,
         s.practice_score,
         s.test_score,
         s.lev_1_completed,
         s.lev_2_completed,
         s.topics_completed,
         d.dept_name,
         d.dept_code,
         tu.full_name  AS tutor_name,
         td.dept_code  AS tutor_dept_code
       FROM   students s
       LEFT JOIN departments d  ON s.dept_id  = d.dept_id
       LEFT JOIN users       tu ON s.tutor_id = tu.user_id
       LEFT JOIN staffs       ts ON tu.user_id = ts.staff_id
       LEFT JOIN departments td ON ts.dept_id = td.dept_id
       WHERE  s.student_id = ?`,
      [userId]
    );
    profile = { ...profile, ...(rows[0] ?? {}) };
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  else if (role === 'Staff') {
    // Subquery for tutorward_count avoids the GROUP BY that breaks under
    // ONLY_FULL_GROUP_BY (MySQL 8 default).
    const rows = await executeQuery(
      `SELECT
         st.is_tutor,
         st.tutor_batch_year,
         d.dept_name,
         d.dept_code,
         (SELECT COUNT(*) FROM students WHERE tutor_id = st.staff_id) AS tutorward_count
       FROM   staffs st
       LEFT JOIN departments d ON st.dept_id = d.dept_id
       WHERE  st.staff_id = ?`,
      [userId]
    );
    const staffData = rows[0] ?? {};

    // If not a tutor, override count with clear message flag
    profile = {
      ...profile,
      ...staffData,
      is_active_tutor:     staffData.is_tutor === 1,
      tutor_batch_year:    staffData.tutor_batch_year ?? null,
      tutorward_count:     staffData.is_tutor === 1 ? (staffData.tutorward_count ?? 0) : null
    };
  }

  // ── Dept Head ─────────────────────────────────────────────────────────────
  else if (role === 'Dept Head') {
    // `dept_id` MUST be selected here. The frontend's Create Subject dialog
    // pins the Dept Head's own department as a non-removable collaborator
    // by reading `user.dept_id` from /users/me — without it, the chip never
    // pre-fills and the head can accidentally publish a subject without
    // their own dept on it.
    const rows = await executeQuery(
      `SELECT
         d.dept_id,
         d.dept_name,
         d.dept_code,
         (SELECT COUNT(*) FROM students WHERE dept_id = d.dept_id)                   AS student_count,
         (SELECT COUNT(*) FROM staffs    WHERE dept_id = d.dept_id)                   AS staff_count,
         (SELECT COUNT(*) FROM staffs    WHERE dept_id = d.dept_id AND is_tutor = 1)  AS active_tutor_count
       FROM   departments d
       WHERE  d.head_user_id = ?`,
      [userId]
    );
    profile = { ...profile, ...(rows[0] ?? {}) };
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  // No extra data — base user object is sufficient

  return successResponse(res, { profile }, 'Profile fetched successfully.');
});


// ─── GET ACTIVE SESSIONS ─────────────────────────────────────────────────────
export const getActiveSessions = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const families   = await redisSetMembers(`user:${userId}:sessions`);
  return successResponse(res, { active_sessions: families.length }, 'Active sessions fetched.');
});

// Logout all other devices except current one by deleting all other refresh tokens for this user.
export const logoutOtherSessions = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const cookie     = req.cookies.refreshToken;
  const currentFamily = cookie ? cookie.substring(0, cookie.indexOf(':')) : null;

  const families = await redisSetMembers(`user:${userId}:sessions`);
  for (const family of families) {
    if (family !== currentFamily) {
      await redisDel(`refresh:${family}`);
      await redisSetRemove(`user:${userId}:sessions`, family);
    }
  }

  return successResponse(res, {}, 'All other sessions logged out.');
});