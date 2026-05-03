// src/controllers/admin.controller.js
import bcrypt           from 'bcryptjs';
import XLSX             from 'xlsx';
import { executeQuery, withTransaction } from '../config/db.js';
import { AppError }        from '../utils/appError.js';
import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import * as emailService from '../services/email.service.js';
import logger              from '../utils/logger.js';

const BCRYPT_SALT_ROUNDS  = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const DEFAULT_PASSWORD     = process.env.NEW_ACCOUNT_DEFAULT_PASSWORD || 'NecGate@2025'; // students/staffs must change on first login

// ─── Shared: resolve dept_id from dept_code ───────────────────────────────────
const getDeptByCode = async (dept_code) => {
  const rows = await executeQuery(
    'SELECT dept_id, dept_name, dept_code FROM departments WHERE dept_code = ?',
    [dept_code.toUpperCase()]
  );
  if (!rows.length) throw new AppError(`Department with code '${dept_code}' not found.`, 404);
  return rows[0];
};


// ═══════════════════════════════════════════════════════════════════════════════
// USER LISTING
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LIST USERS ───────────────────────────────────────────────────────────────
// Role-aware listing with filters.
// Students: filter by batch_year and/or dept_code
// Staffs:   filter by dept_code
// Dept Heads / Admins: flat list, no filters

export const listUsers = catchAsync(async (req, res) => {
  const { role = 'Student', dept_code, batch_year, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let countQuery, dataQuery, params = [];

  if (role === 'Student') {
    const conditions = ["u.role = 'Student'"];

    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR s.reg_num LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (dept_code && dept_code !== 'All') {
      conditions.push('d.dept_code = ?');
      params.push(dept_code.toUpperCase());
    }
    if (batch_year && batch_year !== 'All') {
      conditions.push('s.batch_year = ?');
      params.push(batch_year);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    countQuery = `
      SELECT COUNT(*) AS total
      FROM users u
      JOIN students s ON u.user_id = s.student_id
      LEFT JOIN departments d ON s.dept_id = d.dept_id
      ${where}`;

    dataQuery = `
      SELECT u.user_id, u.full_name, u.email, u.phone_number, u.role, s.reg_num, 
             s.batch_year, d.dept_code, d.dept_name
      FROM users u
      JOIN students s ON u.user_id = s.student_id
      LEFT JOIN departments d ON s.dept_id = d.dept_id
      ${where}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`;

  } else if (role === 'Staff') {
    const conditions = ["u.role = 'Staff'"];

    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (dept_code && dept_code !== 'All') {
      conditions.push('d.dept_code = ?');
      params.push(dept_code.toUpperCase());
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    countQuery = `
      SELECT COUNT(*) AS total
      FROM users u
      JOIN staffs st ON u.user_id = st.staff_id
      LEFT JOIN departments d ON st.dept_id = d.dept_id
      ${where}`;

    dataQuery = `
      SELECT u.user_id, u.full_name, u.email, u.phone_number, u.role,
             d.dept_code, d.dept_name, st.is_tutor, st.tutor_batch_year
      FROM users u
      JOIN staffs st ON u.user_id = st.staff_id
      LEFT JOIN departments d ON st.dept_id = d.dept_id
      ${where}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`;

  } else if (role === 'Dept Head') {
    const conditions = ["u.role = 'Dept Head'"];

    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    countQuery = `
      SELECT COUNT(*) AS total
      FROM users u
      JOIN departments d ON u.user_id = d.head_user_id
      ${where}`;

    dataQuery = `
      SELECT u.user_id, u.full_name, u.email, u.phone_number, u.role,
             d.dept_code, d.dept_name
      FROM users u
      JOIN departments d ON u.user_id = d.head_user_id
      ${where}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`;

  } else {
    // Admin
    const conditions = ["u.role = 'Admin'"];
    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    countQuery = `SELECT COUNT(*) AS total FROM users u ${where}`;
    dataQuery  = `
      SELECT u.user_id, u.full_name, u.email, u.phone_number, u.role
      FROM users u ${where}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`;
  }

  const countResult = await executeQuery(countQuery, params);
  const total       = countResult[0].total;
  const users       = await executeQuery(dataQuery, [...params, parseInt(limit), offset]);

  res.set('X-Total-Count', total);
  return successResponse(res, {
    users, total, page: parseInt(page), limit: parseInt(limit)
  }, 'Users fetched.');
});


// ═══════════════════════════════════════════════════════════════════════════════
// USER CREATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CREATE SINGLE STUDENT ────────────────────────────────────────────────────
export const createSingleStudent = catchAsync(async (req, res) => {
  const { full_name, email, phone_number, dept_code, batch_year, reg_num } = req.body;

  const dept         = await getDeptByCode(dept_code);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  // Check reg_num unique
  const existingStu = await executeQuery(
    'SELECT student_id FROM students WHERE reg_num = ?', [reg_num]
  );
  if (existingStu.length) throw new AppError(`Registration number '${reg_num}' is already in use.`, 409);

  const existingStud = await executeQuery(
    'SELECT email FROM users WHERE email = ?', [email]
  );
  if (existingStud.length) throw new AppError(`Email '${email}' is already in use.`, 409);

  await withTransaction(async (conn) => { 
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role)
       VALUES (?, ?, ?, ?, 'Student')`,
      [full_name, email, passwordHash, phone_number || null]
    );
    await conn.execute(
      'INSERT INTO students (student_id, dept_id, batch_year, reg_num) VALUES (?, ?, ?, ?)',
      [result.insertId, dept.dept_id, batch_year, reg_num]
    );
  });

  emailService.sendWelcomeEmail({ full_name, email, role: 'Student' }, DEFAULT_PASSWORD);
  logger.info('Student created', { email, dept_code, batch_year, reg_num, by: req.user.userId });
  return successResponse(res, {}, 'Student created successfully.', 201);
});

// ─── BULK STUDENT CREATION (Excel) ───────────────────────────────────────────
// Excel columns: full_name, email, phone_number, dept_code, batch_year, reg_num
export const bulkCreateStudents = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No Excel file uploaded.', 400);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows     = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

  if (!rows.length) throw new AppError('Excel file is empty.', 400);

  const errors = [];
  const validRows = [];

  // Step 1: Pre-fetch all departments for validation
  const allDepts = await executeQuery('SELECT dept_id, dept_code FROM departments');
  const deptMap  = new Map(allDepts.map(d => [d.dept_code.toUpperCase(), d.dept_id]));

  // Step 2: Validate all rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const full_name    = String(row['full_name']    || row['Full Name']    || '').trim();
    const email        = String(row['email']         || row['Email']        || '').trim().toLowerCase();
    const phone_number = String(row['phone_number']  || row['Phone']        || '').trim() || null;
    const dept_code    = String(row['dept_code']     || row['Dept Code']    || '').trim().toUpperCase();
    const batch_year   = String(row['batch_year']    || row['Batch Year']   || '').trim();
    const reg_num      = String(row['reg_num']       || row['Reg Num']      || '').trim();

    if (!full_name || !email || !dept_code || !batch_year || !reg_num) {
      errors.push({ row: i + 2, reason: 'Missing required fields (Name, Email, Dept, Batch, or Reg Num).' });
      continue;
    }

    if (!deptMap.has(dept_code)) {
      errors.push({ row: i + 2, reason: `Dept code '${dept_code}' not found.` });
      continue;
    }

    validRows.push({ full_name, email, phone_number, dept_id: deptMap.get(dept_code), batch_year, reg_num, _excelRow: i + 2 });
  }

  // Step 3: Check for duplicate emails and reg_nums in the Excel itself
  const emailSet = new Set();
  const regSet   = new Set();
  validRows.forEach((r) => {
    if (emailSet.has(r.email)) {
       errors.push({ row: r._excelRow, email: r.email, reason: 'Duplicate email within this file.' });
    }
    emailSet.add(r.email);

    if (regSet.has(r.reg_num)) {
       errors.push({ row: r._excelRow, reg_num: r.reg_num, reason: 'Duplicate registration number within this file.' });
    }
    regSet.add(r.reg_num);
  });

  // Step 4: Check if any reg_nums already exist in the DB
  if (validRows.length > 0) {
    const regNums = validRows.map(r => r.reg_num);
    const ph = regNums.map(() => '?').join(',');
    const existing = await executeQuery(
      `SELECT reg_num FROM students WHERE reg_num IN (${ph})`,
      regNums
    );
    if (existing.length > 0) {
      existing.forEach(row => {
        errors.push({ reason: `Registration number '${row.reg_num}' already exists in database.` });
      });
    }
  }

  // Step 4: Check if any emails already exist in the DB
  if (validRows.length > 0) {
    const emails = validRows.map(r => r.email);
    const ph = emails.map(() => '?').join(',');
    const existingEmails = await executeQuery(
      `SELECT email FROM users WHERE email IN (${ph})`,
      emails
    );
    if (existingEmails.length > 0) {
      existingEmails.forEach(row => {
        errors.push({ reason: `Email '${row.email}' already exists in database.` });
      });
    }
  }

  // Step 5: If any errors found, stop and return them
  if (errors.length > 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Bulk creation aborted due to validation errors.',
      errors
    });
  }

  // Step 6: Creation (with Transaction)
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  await withTransaction(async (conn) => {
    for (const data of validRows) {
      const [result] = await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, phone_number, role)
         VALUES (?, ?, ?, ?, 'Student')`,
        [data.full_name, data.email, passwordHash, data.phone_number]
      );
      await conn.execute(
        'INSERT INTO students (student_id, dept_id, batch_year, reg_num) VALUES (?, ?, ?, ?)',
        [result.insertId, data.dept_id, data.batch_year, data.reg_num]
      );
      emailService.sendWelcomeEmailToUserOnly({ full_name: data.full_name, email: data.email, role: 'Student' }, DEFAULT_PASSWORD);
    }
  });

  // Build breakdown: batch_year → dept_code → count
  const breakdown = new Map(); // key: `${batch_year}|${dept_code}`
  // We need dept_code from dept_id — build reverse map
  const deptIdToCode = new Map(allDepts.map(d => [d.dept_id, d.dept_code]));
  for (const r of validRows) {
    const key = `${r.batch_year}||${deptIdToCode.get(r.dept_id) || r.dept_id}`;
    breakdown.set(key, (breakdown.get(key) || 0) + 1);
  }
  const breakdownLines = [...breakdown.entries()].map(
    ([key, cnt]) => {
      const [batch, dept] = key.split('||');
      return `Batch ${batch} | ${dept}: ${cnt} student${cnt > 1 ? 's' : ''}`;
    }
  );

  emailService.sendBulkCreationSummary('Student', validRows.length, breakdownLines)
    .catch(err => logger.error('Bulk creation admin summary failed', { err: err.message }));

  logger.info('Bulk student creation success', { count: validRows.length, by: req.user.userId });
  return successResponse(res, { created: validRows.length }, `Successfully created ${validRows.length} students.`, 201);
});

// ─── CREATE SINGLE STAFF ──────────────────────────────────────────────────────
export const createSingleStaff = catchAsync(async (req, res) => {
  const { full_name, email, phone_number, dept_code } = req.body;

  const dept         = await getDeptByCode(dept_code);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role)
       VALUES (?, ?, ?, ?, 'Staff')`,
      [full_name, email, passwordHash, phone_number || null]
    );
    await conn.execute(
      'INSERT INTO staffs (staff_id, dept_id, is_tutor) VALUES (?, ?, 0)',
      [result.insertId, dept.dept_id]
    );
  });

  emailService.sendWelcomeEmail({ full_name, email, role: 'Staff' }, DEFAULT_PASSWORD);
  logger.info('Staff created', { email, dept_code, by: req.user.userId });
  return successResponse(res, {}, 'Staff created successfully.', 201);
});

// ─── BULK STAFF CREATION (Excel) ─────────────────────────────────────────────
// Excel columns: full_name, email, phone_number, dept_code
export const bulkCreateStaffs = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No Excel file uploaded.', 400);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows     = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

  if (!rows.length) throw new AppError('Excel file is empty.', 400);

  const errors = [];
  const validRows = [];

  const allDepts = await executeQuery('SELECT dept_id, dept_code FROM departments');
  const deptMap  = new Map(allDepts.map(d => [d.dept_code.toUpperCase(), d.dept_id]));

  // Step 1: Validation
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const full_name    = String(row['full_name']   || row['Full Name'] || '').trim();
    const email        = String(row['email']        || row['Email']     || '').trim().toLowerCase();
    const phone_number = String(row['phone_number'] || row['Phone']     || '').trim() || null;
    const dept_code    = String(row['dept_code']    || row['Dept Code'] || '').trim().toUpperCase();

    if (!full_name || !email || !dept_code) {
      errors.push({ row: i + 2, reason: 'Missing required fields (Name, Email, or Dept).' });
      continue;
    }

    if (!deptMap.has(dept_code)) {
      errors.push({ row: i + 2, reason: `Dept code '${dept_code}' not found.` });
      continue;
    }

    validRows.push({ full_name, email, phone_number, dept_id: deptMap.get(dept_code), _excelRow: i + 2 });
  }

  // Duplicate email check
  const emailSet = new Set();
  validRows.forEach((r) => {
    if (emailSet.has(r.email)) {
       errors.push({ row: r._excelRow, email: r.email, reason: 'Duplicate email within this file.' });
    }
    emailSet.add(r.email);
  });

  // Check database for existing emails
  if (validRows.length > 0) {
    const emails = validRows.map(r => r.email);
    const ph = emails.map(() => '?').join(',');
    const existingEmails = await executeQuery(
      `SELECT email FROM users WHERE email IN (${ph})`,
      emails
    );
    if (existingEmails.length > 0) {
      existingEmails.forEach(row => {
        errors.push({ reason: `Email '${row.email}' already exists in database.` });
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Bulk creation aborted due to validation errors.',
      errors
    });
  }

  // Step 2: Creation
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  await withTransaction(async (conn) => {
    for (const data of validRows) {
      const [result] = await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, phone_number, role)
         VALUES (?, ?, ?, ?, 'Staff')`,
        [data.full_name, data.email, passwordHash, data.phone_number]
      );
      await conn.execute(
        'INSERT INTO staffs (staff_id, dept_id, is_tutor) VALUES (?, ?, 0)',
        [result.insertId, data.dept_id]
      );
      emailService.sendWelcomeEmailToUserOnly({ full_name: data.full_name, email: data.email, role: 'Staff' }, DEFAULT_PASSWORD);
    }
  });

  // Build breakdown: dept_code → count
  // deptMap already has dept_code → dept_id; build reverse
  const deptIdToCodeStaff = new Map(allDepts.map(d => [d.dept_id, d.dept_code]));
  const staffBreakdown = new Map();
  for (const r of validRows) {
    const code = deptIdToCodeStaff.get(r.dept_id) || String(r.dept_id);
    staffBreakdown.set(code, (staffBreakdown.get(code) || 0) + 1);
  }
  const staffBreakdownLines = [...staffBreakdown.entries()].map(
    ([dept, cnt]) => `${dept}: ${cnt} staff${cnt > 1 ? 's' : ''}`
  );

  emailService.sendBulkCreationSummary('Staff', validRows.length, staffBreakdownLines)
    .catch(err => logger.error('Bulk staff creation admin summary failed', { err: err.message }));

  logger.info('Bulk staff creation success', { count: validRows.length, by: req.user.userId });
  return successResponse(res, { created: validRows.length }, `Successfully created ${validRows.length} staffs.`, 201);
});

// ─── CREATE ADMIN ─────────────────────────────────────────────────────────────
export const createAdmin = catchAsync(async (req, res) => {
  const { full_name, email, phone_number } = req.body;
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  await executeQuery(
    `INSERT INTO users (full_name, email, password_hash, phone_number, role)
     VALUES (?, ?, ?, ?, 'Admin')`,
    [full_name, email, passwordHash, phone_number || null]
  );

  emailService.sendWelcomeEmail({ full_name, email, role: 'Admin' }, DEFAULT_PASSWORD);
  logger.info('Admin created', { email, by: req.user.userId });
  return successResponse(res, {}, 'Admin created successfully.', 201);
});

// ─── CREATE DEPARTMENT ────────────────────────────────────────────────────────
// Step 1: Create HOD user in users table (role = 'Dept Head')
// Step 2: Create department, mapping head_user_id to the new HOD
// HOD full_name auto-generated as HOD_{dept_code}
// HOD email is provided by the admin (validated as required)
// Note: HODs are NOT inserted into the staffs table — that's for Staff role only.

export const createDepartment = catchAsync(async (req, res) => {
  const { dept_name, dept_code, hod_phone, hod_email } = req.body;

  const upperCode  = dept_code.toUpperCase();
  const hodName    = `HOD_${upperCode}`;
  const hodEmail   = hod_email;
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  // Check dept_code and dept_name uniqueness
  const existing = await executeQuery(
    'SELECT dept_id FROM departments WHERE dept_code = ? OR dept_name = ?',
    [upperCode, dept_name]
  );
  if (existing.length) {
    throw new AppError('Department code or name already exists.', 409);
  }

  let newDeptId;

  await withTransaction(async (conn) => {
    // Step 1: Create HOD user
    const [hodResult] = await conn.execute(
      `INSERT INTO users (full_name, email, password_hash, phone_number, role)
       VALUES (?, ?, ?, ?, 'Dept Head')`,
      [hodName, hodEmail, passwordHash, hod_phone || null]
    );
    const hodUserId = hodResult.insertId;

    // Step 2: Create dept and map HOD
    const [deptResult] = await conn.execute(
      'INSERT INTO departments (dept_name, dept_code, head_user_id) VALUES (?, ?, ?)',
      [dept_name, upperCode, hodUserId]
    );
    newDeptId = deptResult.insertId;

  });

  emailService.sendWelcomeEmail({ full_name: hodName, email: hodEmail, role: 'Dept Head' }, DEFAULT_PASSWORD);
  logger.info('Department created', { dept_name, upperCode, by: req.user.userId });
  return successResponse(res, { dept_id: newDeptId }, 'Department and HOD created successfully.', 201);
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER EDITING
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EDIT STUDENT ─────────────────────────────────────────────────────────────
export const editStudent = catchAsync(async (req, res) => {
  const { userId }                                                   = req.params;
  const { full_name, email, phone_number, batch_year, dept_code, reg_num, remove_tutor } = req.body;

  // Verify user is a student
  const users = await executeQuery(
    "SELECT user_id FROM users WHERE user_id = ? AND role = 'Student'", [userId]
  );
  if (!users.length) throw new AppError('Student not found.', 404);

  if (reg_num !== undefined) {
    const existing = await executeQuery(
      'SELECT student_id FROM students WHERE reg_num = ? AND student_id != ?',
      [reg_num, userId]
    );
    if (existing.length) throw new AppError(`Registration number '${reg_num}' is already in use.`, 409);
  }

  if (email !== undefined) {
    const existing = await executeQuery(
      'SELECT email FROM users WHERE email = ? AND user_id != ?',
      [email, userId]
    );
    if (existing.length) throw new AppError(`Email '${email}' is already in use.`, 409);
  }
  if(dept_code !== undefined){
    const existing = await executeQuery(
      'SELECT dept_id FROM departments WHERE dept_code = ?',
      [dept_code.toUpperCase()]
    );
    if (!existing.length) throw new AppError(`Dept code '${dept_code}' not found.`, 404);
  }

  await withTransaction(async (conn) => {
    // Update users table
    const userUpdates = [];
    const userParams  = [];
    if (full_name    !== undefined) { userUpdates.push('full_name = ?');    userParams.push(full_name); }
    if (email        !== undefined) { userUpdates.push('email = ?');        userParams.push(email.toLowerCase()); }
    if (phone_number !== undefined) { userUpdates.push('phone_number = ?'); userParams.push(phone_number || null); }

    if (userUpdates.length) {
      userParams.push(userId);
      await conn.execute(`UPDATE users SET ${userUpdates.join(', ')} WHERE user_id = ?`, userParams);
    }

    // Update students table
    const stuUpdates = [];
    const stuParams  = [];
    if (reg_num    !== undefined) { stuUpdates.push('reg_num = ?');    stuParams.push(reg_num); }
    if (batch_year !== undefined) { stuUpdates.push('batch_year = ?'); stuParams.push(batch_year); }
    if (dept_code  !== undefined) {
      const deptRows = await executeQuery(
        'SELECT dept_id FROM departments WHERE dept_code = ?', [dept_code.toUpperCase()]
      );
      if (!deptRows.length) throw new AppError(`Dept code '${dept_code}' not found.`, 404);
      stuUpdates.push('dept_id = ?');
      stuParams.push(deptRows[0].dept_id);
    }
    // Reset tutor assignment if admin explicitly requests it
    if (remove_tutor === true) {
      stuUpdates.push('tutor_id = NULL');
    }

    if (stuUpdates.length) {
      stuParams.push(userId);
      await conn.execute(`UPDATE students SET ${stuUpdates.join(', ')} WHERE student_id = ?`, stuParams);
    }
  });

  // Notify user and admins
  const updatedUsers = await executeQuery('SELECT full_name, email, role FROM users WHERE user_id = ?', [userId]);
  if (updatedUsers.length) {
    emailService.sendUserEditedNotice(updatedUsers[0], req.user.userId)
      .catch(err => logger.error('User edit notification failed', { err: err.message }));
  }

  return successResponse(res, {}, 'Student updated.');
});

// ─── EDIT STAFF ───────────────────────────────────────────────────────────────
export const editStaff = catchAsync(async (req, res) => {
  const { userId }                               = req.params;
  const { full_name, email, phone_number, dept_code } = req.body;

  const users = await executeQuery(
    "SELECT user_id FROM users WHERE user_id = ? AND role = 'Staff'", [userId]
  );
  if (!users.length) throw new AppError('Staff not found.', 404);

  if (email !== undefined) {
    const existing = await executeQuery(
      'SELECT email FROM users WHERE email = ? AND user_id != ?',
      [email, userId]
    );
    if (existing.length) throw new AppError(`Email '${email}' is already in use.`, 409);
  }
  if(dept_code !== undefined){
    const existing = await executeQuery(
      'SELECT dept_id FROM departments WHERE dept_code = ?',
      [dept_code.toUpperCase()]
    );
    if (!existing.length) throw new AppError(`Dept code '${dept_code}' not found.`, 404);
  }
  
  await withTransaction(async (conn) => {
    const userUpdates = [];
    const userParams  = [];
    if (full_name    !== undefined) { userUpdates.push('full_name = ?');    userParams.push(full_name); }
    if (email        !== undefined) { userUpdates.push('email = ?');        userParams.push(email.toLowerCase()); }
    if (phone_number !== undefined) { userUpdates.push('phone_number = ?'); userParams.push(phone_number || null); }

    if (userUpdates.length) {
      userParams.push(userId);
      await conn.execute(`UPDATE users SET ${userUpdates.join(', ')} WHERE user_id = ?`, userParams);
    }

    if (dept_code !== undefined) {
      const deptRows = await executeQuery(
        'SELECT dept_id FROM departments WHERE dept_code = ?', [dept_code.toUpperCase()]
      );
      if (!deptRows.length) throw new AppError(`Dept code '${dept_code}' not found.`, 404);
      await conn.execute(
        'UPDATE staffs SET dept_id = ? WHERE staff_id = ?',
        [deptRows[0].dept_id, userId]
      );
    }
  });

  // Notify user and admins
  const updatedUsers = await executeQuery('SELECT full_name, email, role FROM users WHERE user_id = ?', [userId]);
  if (updatedUsers.length) {
    emailService.sendUserEditedNotice(updatedUsers[0], req.user.userId)
      .catch(err => logger.error('User edit notification failed', { err: err.message }));
  }

  return successResponse(res, {}, 'Staff updated.');
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER DELETION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── DELETE SINGLE STUDENT BY EMAIL ──────────────────────────────────────────
export const deleteStudentByEmail = catchAsync(async (req, res) => {
  const { email } = req.body;

  const users = await executeQuery(
    "SELECT user_id, full_name FROM users WHERE email = ? AND role = 'Student'",
    [email.toLowerCase()]
  );
  if (!users.length) throw new AppError('Student not found with that email.', 404);

  const user = users[0];
  // CASCADE in DB handles students table cleanup
  await executeQuery('DELETE FROM users WHERE user_id = ?', [user.user_id]);

  emailService.sendUserDeletedNotice(user.full_name, user.email, 'Student', req.user.userId)
    .catch(err => logger.error('User deletion admin notification failed', { err: err.message }));

  logger.info('Student deleted', { email, deletedBy: req.user.userId });
  return successResponse(res, {}, 'Student deleted successfully.');
});

// ─── DELETE SINGLE STAFF BY EMAIL ────────────────────────────────────────────
export const deleteStaffByEmail = catchAsync(async (req, res) => {
  const { email } = req.body;

  const users = await executeQuery(
    "SELECT user_id, full_name, email FROM users WHERE email = ? AND role = 'Staff'",
    [email.toLowerCase()]
  );
  if (!users.length) throw new AppError('Staff not found with that email.', 404);

  const user = users[0];

  // students_ibfk_2 (tutor_id) has ON DELETE SET NULL, so the FK takes care
  // of clearing tutorward assignments when the staff user is deleted.
  await executeQuery('DELETE FROM users WHERE user_id = ?', [user.user_id]);

  emailService.sendUserDeletedNotice(user.full_name, user.email, 'Staff', req.user.userId)
    .catch(err => logger.error('User deletion admin notification failed', { err: err.message }));

  logger.info('Staff deleted', { email, deletedBy: req.user.userId });
  return successResponse(res, {}, 'Staff deleted successfully.');
});

// ─── BULK DELETE STUDENTS BY BATCH_YEAR + DEPT_CODE ──────────────────────────
export const bulkDeleteStudents = catchAsync(async (req, res) => {
  const { batch_year, dept_code } = req.body;

  const dept = await getDeptByCode(dept_code);

  // Find all students in this batch + dept
  const students = await executeQuery(
    `SELECT u.user_id FROM users u
     JOIN students s ON u.user_id = s.student_id
     WHERE s.batch_year = ? AND s.dept_id = ?`,
    [batch_year, dept.dept_id]
  );

  if (!students.length) {
    throw new AppError(`No students found for batch '${batch_year}' in dept '${dept_code}'.`, 404);
  }

  const ids = students.map(s => s.user_id);
  const ph  = ids.map(() => '?').join(',');

  await executeQuery(`DELETE FROM users WHERE user_id IN (${ph})`, ids);

  // Notify admins of bulk deletion
  emailService.sendBulkDeletionSummary(ids.length, `Batch: ${batch_year}, Dept Code: ${dept_code}`, req.user.userId)
    .catch(err => logger.error('Bulk deletion admin notification failed', { err: err.message }));

  logger.info('Bulk student deletion', {
    batch_year, dept_code, count: ids.length, deletedBy: req.user.userId
  });
  return successResponse(res, { deleted_count: ids.length },
    `${ids.length} students deleted from batch '${batch_year}', dept '${dept_code}'.`
  );
});