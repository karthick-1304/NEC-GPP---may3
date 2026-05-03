// src/controllers/tutor.controller.js
import { executeQuery }    from '../config/db.js';
import { AppError }        from '../utils/appError.js';
import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import logger              from '../utils/logger.js';

// ─── GET MY TUTORWARD STUDENTS ────────────────────────────────────────────────
// Returns all students assigned to this staff as tutorward.
// Any staff can have tutorward students — is_tutor is just an indicator.

export const getMyTutorward = catchAsync(async (req, res) => {
  const { userId }                 = req.user;
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const conditions = ['s.tutor_id = ?'];
  const params     = [userId];

  if (search) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR s.reg_num LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total
     FROM students s
     JOIN users u ON s.student_id = u.user_id
     ${where}`,
    params
  );
  const total = countResult[0].total;

  const students = await executeQuery(
    `SELECT u.user_id, u.full_name, u.email, s.reg_num,
            s.batch_year, d.dept_name, d.dept_code
     FROM students s
     JOIN users       u ON s.student_id = u.user_id
     LEFT JOIN departments d ON s.dept_id = d.dept_id
     ${where}
     ORDER BY u.full_name ASC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  res.set('X-Total-Count', total);
  return successResponse(res, {
    students, total, page: parseInt(page), limit: parseInt(limit)
  }, 'Tutorward students fetched.');
});

// ─── GET AVAILABLE STUDENTS TO ADD ───────────────────────────────────────────
// No query params needed — the system auto-uses the staff's own dept_id and
// tutor_batch_year from the staffs table.

export const getAvailableStudents = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Fetch staff's own dept_id and tutor_batch_year
  const staffRows = await executeQuery(
    'SELECT dept_id, tutor_batch_year FROM staffs WHERE staff_id = ?',
    [userId]
  );
  if (!staffRows.length) throw new AppError('Staff record not found.', 404);

  const { dept_id, tutor_batch_year } = staffRows[0];
  if (!dept_id)        throw new AppError('You are not assigned to any department.', 400);
  if (!tutor_batch_year) throw new AppError('You have no tutor batch year set. Please update it first.', 400);

  const conditions = [
    's.tutor_id IS NULL',
    's.batch_year = ?',
    's.dept_id = ?',
  ];
  const params = [tutor_batch_year, dept_id];

  if (search) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR s.reg_num LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total
     FROM students s
     JOIN users u ON s.student_id = u.user_id
     ${where}`,
    params
  );
  const total = countResult[0].total;

  const students = await executeQuery(
    `SELECT u.user_id, u.full_name, u.email, s.reg_num,
            s.batch_year, d.dept_name, d.dept_code
     FROM students s
     JOIN users       u ON s.student_id = u.user_id
     LEFT JOIN departments d ON s.dept_id = d.dept_id
     ${where}
     ORDER BY u.full_name ASC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  res.set('X-Total-Count', total);
  return successResponse(res, {
    tutor_batch_year,
    students, total, page: parseInt(page), limit: parseInt(limit)
  }, 'Available students fetched.');
});

// ─── UPDATE TUTOR BATCH YEAR ──────────────────────────────────────────────────
// A staff/tutor can only change their tutor_batch_year if they have NO
// tutorward students currently assigned to them.

export const updateTutorBatchYear = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const { tutor_batch_year } = req.body;

  // Block if this staff already has tutorward students
  const tutorward = await executeQuery(
    'SELECT COUNT(*) AS cnt FROM students WHERE tutor_id = ?',
    [userId]
  );
  if (tutorward[0].cnt > 0) {
    throw new AppError(
      'Cannot change tutor batch year while you have students in your tutorward. Remove all students from your tutorward first.',
      409
    );
  }

  await executeQuery(
    'UPDATE staffs SET tutor_batch_year = ? WHERE staff_id = ?',
    [tutor_batch_year, userId]
  );

  logger.info('Tutor batch year updated', { tutorId: userId, tutor_batch_year });
  return successResponse(res, { tutor_batch_year }, 'Tutor batch year updated.');
});

// ─── ADD STUDENT TO TUTORWARD ─────────────────────────────────────────────────
export const addToTutorward = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const { student_id } = req.body;

  // Fetch staff's dept_id and tutor_batch_year
  const staffRows = await executeQuery(
    'SELECT dept_id, tutor_batch_year FROM staffs WHERE staff_id = ?',
    [userId]
  );

  if (!staffRows.length) throw new AppError('Staff record not found.', 404);
  const { dept_id: staffDept, tutor_batch_year } = staffRows[0];
  if (!staffDept)        throw new AppError('You are not assigned to any department.', 400);
  if (!tutor_batch_year) throw new AppError('You have no tutor batch year set. Please update it first.', 400);

  // Verify student exists and is not already assigned
  const students = await executeQuery(
    'SELECT student_id, tutor_id, dept_id, batch_year FROM students WHERE student_id = ?',
    [student_id]
  );
  if (!students.length) throw new AppError('Student not found.', 404);

  const student = students[0];
  if (student.tutor_id !== null) {
    throw new AppError('This student is already assigned to a tutor.', 409);
  }

  // Enforce same dept and same batch year
  if (student.dept_id !== staffDept) {
    throw new AppError('Student does not belong to your department.', 400);
  }
  if (student.batch_year !== tutor_batch_year) {
    throw new AppError(`Student batch year (${student.batch_year}) does not match your tutor batch year (${tutor_batch_year}).`, 400);
  }

  await executeQuery(
    'UPDATE students SET tutor_id = ? WHERE student_id = ?',
    [userId, student_id]
  );

  // Mark staff as active tutor
  await executeQuery(
    'UPDATE staffs SET is_tutor = 1 WHERE staff_id = ?',
    [userId]
  );

  logger.info('Student added to tutorward', { studentId: student_id, tutorId: userId });
  return successResponse(res, {}, 'Student added to your tutorward.');
});


// ─── REMOVE STUDENT FROM TUTORWARD ───────────────────────────────────────────
export const removeFromTutorward = catchAsync(async (req, res) => {
  const { userId }     = req.user;
  const { student_id } = req.body;

  // Verify student belongs to this tutor
  const students = await executeQuery(
    'SELECT student_id FROM students WHERE student_id = ? AND tutor_id = ?',
    [student_id, userId]
  );
  if (!students.length) {
    throw new AppError('Student not found in your tutorward.', 404);
  }

  await executeQuery(
    'UPDATE students SET tutor_id = NULL WHERE student_id = ?',
    [student_id]
  );

  // Check if this staff still has any tutorward students
  // If not — reset is_tutor flag to 0
  const remaining = await executeQuery(
    'SELECT COUNT(*) AS cnt FROM students WHERE tutor_id = ?',
    [userId]
  );
  if (remaining[0].cnt === 0) {
    await executeQuery('UPDATE staffs SET is_tutor = 0 WHERE staff_id = ?', [userId]);
  }

  logger.info('Student removed from tutorward', { studentId: student_id, tutorId: userId });
  return successResponse(res, {}, 'Student removed from your tutorward.');
});