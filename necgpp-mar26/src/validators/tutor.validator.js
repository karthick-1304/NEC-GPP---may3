// src/validators/tutor.validator.js
import Joi from 'joi';

// ─── List tutorward students query ────────────────────────────────────────────
export const listTutorwardQuerySchema = Joi.object({
  search: Joi.string().max(100).trim().allow('', null),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(20),
});

// ─── List available students to add query ────────────────────────────────────
// batch_year and dept are auto-derived from the staff's own record
export const availableStudentsQuerySchema = Joi.object({
  search: Joi.string().max(100).trim().allow('', null),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(20),
});

// ─── Update tutor batch year ──────────────────────────────────────────────
// Accepts either a non-empty year string OR an explicit null to clear the
// year ("No tutoring batch year"). Cleared state means the staff is not
// currently mentoring any cohort.
export const updateTutorBatchYearSchema = Joi.object({
  tutor_batch_year: Joi.string().max(10).allow(null).required()
    .messages({ 'any.required': 'Tutor batch year is required.' }),
});


// ─── Add student to tutorward ─────────────────────────────────────────────────
export const addToTutorwardSchema = Joi.object({
  student_id: Joi.number().integer().positive().required(),
});

// ─── Remove student from tutorward ───────────────────────────────────────────
export const removeFromTutorwardSchema = Joi.object({
  student_id: Joi.number().integer().positive().required(),
});