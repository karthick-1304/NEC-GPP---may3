// src/controllers/progress.controller.js
import { executeQuery, withTransaction } from '../config/db.js';
import { cacheGet, cacheSet, cacheDel } from '../config/redis.js';
import { AppError }               from '../utils/appError.js';
import { catchAsync }             from '../utils/catchAsync.js';
import { successResponse }        from '../utils/successResponse.js';
import logger                     from '../utils/logger.js';

const LEADERBOARD_TTL = 25 * 3600; // slightly more than 24h

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates a specific leaderboard slice and caches it.
 * @param {string} type 'practice' | 'test'
 * @param {string} dimension 'all' | 'dept' | 'batch'
 * @param {string|number} value null for 'all', else the id/year
 */
const _calculateAndCacheSlice = async (type, dimension, value) => {
  const scoreField = type === 'test' ? 's.test_score' : 's.practice_score';

  // For dimension='all', value is meaningless — normalize to null so we never
  // poison the cache with keys like leaderboard:practice:all:42.
  const sliceValue = (dimension === 'all') ? null : value;

  let where = '';
  const params = [];

  if (dimension === 'dept') {
    where = 'WHERE s.dept_id = ?';
    params.push(sliceValue);
  } else if (dimension === 'batch') {
    where = 'WHERE s.batch_year = ?';
    params.push(sliceValue);
  }

  const query = `
    SELECT u.full_name, u.email, s.reg_num, s.batch_year, d.dept_name, d.dept_id,
           ${scoreField} AS score
    FROM students s
    JOIN users u ON s.student_id = u.user_id
    LEFT JOIN departments d ON s.dept_id = d.dept_id
    ${where}
    ORDER BY score DESC, u.full_name ASC
  `;

  const data = await executeQuery(query, params);

  // Assign Ranks
  const ranked = data.map((s, idx) => ({ ...s, rank: idx + 1 }));

  const cacheKey = `leaderboard:${type}:${dimension}${sliceValue ? `:${sliceValue}` : ''}`;
  await cacheSet(cacheKey, { data: ranked, last_updated: new Date() }, LEADERBOARD_TTL);

  return ranked;
};

/**
 * Rebuilds EVERYTHING.
 */
export const rebuildAllLeaderboards = async () => {
  // 1. Get all departments and all batches
  const [depts, batches] = await Promise.all([
    executeQuery('SELECT dept_id FROM departments'),
    executeQuery('SELECT DISTINCT batch_year FROM students WHERE batch_year IS NOT NULL')
  ]);

  const deptIds = depts.map(d => d.dept_id);
  const years   = batches.map(b => b.batch_year);

  const types = ['practice', 'test'];
  
  // Run all slice calculations
  for (const type of types) {
    // Global
    await _calculateAndCacheSlice(type, 'all', null);
    
    // Per Dept
    for (const dId of deptIds) {
      await _calculateAndCacheSlice(type, 'dept', dId);
    }
    
    // Per Batch
    for (const yr of years) {
      await _calculateAndCacheSlice(type, 'batch', yr);
    }
  }

  logger.info('Leaderboards fully rebuilt at ' + new Date().toISOString());
};

/**
 * Endpoint for Admin manual refresh
 */
export const rebuildLeaderboardManual = catchAsync(async (req, res) => {
  await rebuildAllLeaderboards();
  return successResponse(res, {}, 'All leaderboards refreshed successfully.');
});

/**
 * Public endpoint to fetch a leaderboard.
 * Query params: type=practice|test, dimension=all|dept|batch, value=id/year, search=string
 */
export const getLeaderboard = catchAsync(async (req, res) => {
  const { type = 'practice', dimension = 'all', value, search } = req.query;
  
  if (!['practice', 'test'].includes(type)) throw new AppError('Invalid leaderboard type.', 400);
  if (!['all', 'dept', 'batch'].includes(dimension)) throw new AppError('Invalid dimension.', 400);

  const sliceValue = (dimension === 'all') ? null : value;
  const cacheKey   = `leaderboard:${type}:${dimension}${sliceValue ? `:${sliceValue}` : ''}`;
  let cached = await cacheGet(cacheKey);

  let data;
  if (!cached) {
    // Cache miss - calculate this specific slice on the fly
    data = await _calculateAndCacheSlice(type, dimension, sliceValue);
  } else {
    data = cached.data;
  }

  // Handle Search in-memory (since leaderboard is usually a few thousand rows max)
  if (search) {
    const s = search.toLowerCase();
    data = data.filter(item => 
      item.full_name.toLowerCase().includes(s) || 
      item.email.toLowerCase().includes(s) ||
      item.reg_num.toLowerCase().includes(s)
    );
  }

  return successResponse(res, { 
    leaderboard: data, 
    last_updated: cached?.last_updated || new Date() 
  }, 'Leaderboard fetched.');
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generic Student list with basic info.
 * Access Control: Admin (All + optional dept/batch filter)
 *                 Dept Head (Own dept, optional batch filter)
 *                 Staff (Tutorward only)
 */
export const getProgressList = catchAsync(async (req, res) => {
  const { role, userId, deptId: userDeptId } = req.user;
  const { dept_id, batch_year, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions = [];
  const params     = [];

  // Role Filtering
  if (role === 'Staff') {
    conditions.push('s.tutor_id = ?');
    params.push(userId);
  } else if (role === 'Dept Head') {
    // Always scoped to their own dept
    conditions.push('s.dept_id = ?');
    params.push(userDeptId);
  }
  // Admin sees all by default

  // Search filter
  if (search) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR s.reg_num LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // dept_id filter: Admin only (Dept Head is already scoped to their dept)
  if (dept_id && role === 'Admin') {
    conditions.push('s.dept_id = ?');
    params.push(dept_id);
  }

  // batch_year filter: Admin and Dept Head can both narrow by batch
  if (batch_year && (role === 'Admin' || role === 'Dept Head')) {
    conditions.push('s.batch_year = ?');
    params.push(batch_year);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [countResult, students] = await Promise.all([
    executeQuery(`SELECT COUNT(*) as total FROM students s JOIN users u ON s.student_id = u.user_id ${where}`, params),
    executeQuery(`
      SELECT s.student_id AS user_id, s.reg_num, u.full_name, u.email,
             d.dept_name, d.dept_code, s.batch_year,
             s.practice_score, s.test_score, s.lev_1_completed, s.lev_2_completed, s.topics_completed
      FROM students s
      JOIN users u ON s.student_id = u.user_id
      LEFT JOIN departments d ON s.dept_id = d.dept_id
      ${where}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset])
  ]);

  const total = countResult[0].total;
  res.set('X-Total-Count', total);

  return successResponse(res, { 
    students, total, page: parseInt(page), limit: parseInt(limit) 
  }, 'Progress list fetched.');
});


/**
 * Detailed Student Progress data (Eye Button logic)
 */
export const getStudentDetail = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const { role, userId, deptId: userDeptId } = req.user;

  // 1. Basic Auth/Access Check (reuse some logic but verify)
  const [studentAccess] = await executeQuery('SELECT dept_id, tutor_id FROM students WHERE student_id = ?', [studentId]);
  if (!studentAccess) throw new AppError('Student not found.', 404);

  if (role === 'Student' && studentId != userId) throw new AppError('Access denied.', 403);
  if (role === 'Staff' && studentAccess.tutor_id != userId) throw new AppError('Access denied. Not your tutorward.', 403);
  if (role === 'Dept Head' && studentAccess.dept_id != userDeptId) throw new AppError('Access denied. Not your department.', 403);

  // 2. Fetch General Info
  const [generalInfo] = await executeQuery(`
    SELECT u.full_name, s.reg_num, u.email, d.dept_code, s.batch_year,
           s.practice_score, s.test_score, s.lev_1_completed, s.lev_2_completed, s.topics_completed,
           tu.full_name AS tutor_name, td.dept_code AS tutor_dept
    FROM students s
    JOIN users u ON s.student_id = u.user_id
    LEFT JOIN departments d ON s.dept_id = d.dept_id
    LEFT JOIN users tu ON s.tutor_id = tu.user_id
    LEFT JOIN staffs st ON tu.user_id = st.staff_id
    LEFT JOIN departments td ON st.dept_id = td.dept_id
    WHERE s.student_id = ?
  `, [studentId]);

  // 3. Top 5 Practice Subjects (Last 2 Months)
  const topSubjects = await executeQuery(`
    SELECT DISTINCT sub.subject_id, sub.subject_name
    FROM practice_attempts pa
    JOIN practice_sets ps ON pa.set_id = ps.set_id
    JOIN topics t ON ps.topic_id = t.topic_id
    JOIN subjects sub ON t.subject_id = sub.subject_id
    WHERE pa.student_id = ?
      AND pa.attempt_at >= DATE_SUB(NOW(), INTERVAL 2 MONTH)
    LIMIT 5
  `, [studentId]);

  // 4. Top 10 Practice History
  const history = await executeQuery(`
    SELECT sub.subject_name, t.topic_name, ps.level, ps.display_order as set_name,
           pa.score, 
           CASE WHEN (pa.score / ps.total_marks * 100) >= ps.threshold_percentage THEN 'Passed' ELSE 'Failed' END as status,
           pa.attempt_at as date
    FROM practice_attempts pa
    JOIN practice_sets ps ON pa.set_id = ps.set_id
    JOIN topics t ON ps.topic_id = t.topic_id
    JOIN subjects sub ON t.subject_id = sub.subject_id
    WHERE pa.student_id = ?
    ORDER BY pa.attempt_at DESC
    LIMIT 10
  `, [studentId]);

  return successResponse(res, {
    general: generalInfo,
    top_subjects: topSubjects,
    history
  }, 'Student detail progress fetched.');
});