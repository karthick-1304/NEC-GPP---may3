// src/validators/admin.validator.js
import Joi from 'joi';

// `batch_year` is stored as a string but must represent a positive integer
// (the start year of the batch, e.g. "2022"). This regex rejects "0",
// negatives, leading-zero values, and any non-numeric input.
const positiveIntStringPattern = /^[1-9]\d*$/;
const batchYearMessage = 'Batch year must be a positive number greater than 0.';

// ─── List users query ─────────────────────────────────────────────────────────
export const listUsersQuerySchema = Joi.object({
  role:       Joi.string().valid('Admin', 'Dept Head', 'Staff', 'Student').default('Student'),
  dept_code:  Joi.string().max(20).allow('', null),
  // Query filter — accepts empty (= "all batches"). When set, must be a
  // positive integer string so the SQL `WHERE s.batch_year = ?` predicate
  // never matches garbage.
  batch_year: Joi.string().max(10).pattern(positiveIntStringPattern).allow('', null)
    .messages({ 'string.pattern.base': batchYearMessage }),
  search:     Joi.string().max(100).trim().allow('', null),
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(100).default(20),
});

// ─── Single student creation ──────────────────────────────────────────────────
export const createSingleStudentSchema = Joi.object({
  full_name:    Joi.string().min(2).max(50).trim().required(),
  email:        Joi.string().email().max(50).lowercase().trim().required(),
  phone_number: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
  dept_code:    Joi.string().max(20).trim().required(),
  batch_year:   Joi.string().max(10).pattern(positiveIntStringPattern).required()
    .messages({ 'string.pattern.base': batchYearMessage }),
  reg_num:      Joi.string().alphanum().min(1).max(50).required(),
});

// ─── Single staff creation ────────────────────────────────────────────────────
export const createSingleStaffSchema = Joi.object({
  full_name:    Joi.string().min(2).max(50).trim().required(),
  email:        Joi.string().email().max(50).lowercase().trim().required(),
  phone_number: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
  dept_code:    Joi.string().max(20).trim().required(),
});

// ─── Single admin creation ────────────────────────────────────────────────────
export const createAdminSchema = Joi.object({
  full_name:    Joi.string().min(2).max(50).trim().required(),
  email:        Joi.string().email().max(50).lowercase().trim().required(),
  phone_number: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
});

// ─── Department creation ──────────────────────────────────────────────────────
export const createDeptSchema = Joi.object({
  dept_name: Joi.string().min(2).max(50).trim().required(),
  dept_code: Joi.string().min(2).max(20).trim().uppercase().required(),
  hod_phone: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
  hod_email: Joi.string().email().max(50).lowercase().trim().required(),
});

// ─── Edit student ─────────────────────────────────────────────────────────────
export const editStudentSchema = Joi.object({
  full_name:    Joi.string().min(2).max(50).trim(),
  email:        Joi.string().email().max(50).lowercase().trim(),
  phone_number: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
  batch_year:   Joi.string().max(10).pattern(positiveIntStringPattern)
    .messages({ 'string.pattern.base': batchYearMessage }),
  dept_code:    Joi.string().max(20).trim(),
  reg_num:      Joi.string().alphanum().min(1).max(50),
  remove_tutor: Joi.boolean(),
}).min(1).messages({ 'object.min': 'Provide at least one field to update.' });

// ─── Edit staff ───────────────────────────────────────────────────────────────
export const editStaffSchema = Joi.object({
  full_name:    Joi.string().min(2).max(50).trim(),
  email:        Joi.string().email().max(50).lowercase().trim(),
  phone_number: Joi.string().min(10).max(15).pattern(/^\d+$/).allow('', null),
  dept_code:    Joi.string().max(20).trim(),
}).min(1).messages({ 'object.min': 'Provide at least one field to update.' });

// ─── Delete single user by email ─────────────────────────────────────────────
export const deleteByEmailSchema = Joi.object({
  email: Joi.string().email().max(50).lowercase().trim().required(),
});

// ─── Bulk delete students ─────────────────────────────────────────────────────
export const bulkDeleteStudentsSchema = Joi.object({
  batch_year: Joi.string().max(10).pattern(positiveIntStringPattern).required()
    .messages({ 'string.pattern.base': batchYearMessage }),
  dept_code:  Joi.string().max(20).trim().required(),
});