// src/controllers/common.controller.js
import { executeQuery }    from '../config/db.js';
import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';

// ─── GET ALL DEPARTMENTS ──────────────────────────────────────────────────────
// Returns distinct dept_id, dept_name, dept_code for all departments.
// Useful for dropdowns across Admin, Dept Head, Staff, and Student views.

export const getDepartments = catchAsync(async (req, res) => {
  const departments = await executeQuery(
    `SELECT dept_id, dept_name, dept_code
     FROM departments
     ORDER BY dept_name ASC`
  );

  return successResponse(res, { departments }, 'Departments fetched.');
});

// ─── GET DISTINCT BATCH YEARS ─────────────────────────────────────────────────
// Returns all distinct batch_year values present in the students table.
// Useful for batch year dropdowns across all role views.

export const getBatchYears = catchAsync(async (req, res) => {
  const rows = await executeQuery(
    `SELECT DISTINCT batch_year
     FROM students
     WHERE batch_year IS NOT NULL
     ORDER BY batch_year DESC`
  );

  return successResponse(res, { batch_years: rows.map(r => r.batch_year) }, 'Batch years fetched.');
});
