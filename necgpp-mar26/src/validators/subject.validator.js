// src/validators/subject.validator.js
import Joi from 'joi';

// ─── Create subject ───────────────────────────────────────────────────────────
export const createSubjectSchema = Joi.object({
  subject_name: Joi.string().min(2).max(150).trim().required()
    .messages({ 'string.min': 'Subject name must be at least 2 characters.' }),

  // Array of dept_ids that become collaborators at creation time.
  // For Dept Head: their own dept is always added server-side regardless.
  // For Admin: can pick any combination including none.
  collaborator_dept_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .default([]),

  // Whether to send mail notification to all users about this subject
  notify: Joi.boolean().default(true),
});

// ─── Update subject name ──────────────────────────────────────────────────────
export const updateSubjectSchema = Joi.object({
  subject_name: Joi.string().min(2).max(150).trim().required()
    .messages({ 'string.min': 'Subject name must be at least 2 characters.' }),
});

// ─── Add / remove collaborator ────────────────────────────────────────────────
export const manageCollaboratorSchema = Joi.object({
  dept_id: Joi.number().integer().positive().required()
    .messages({ 'any.required': 'Department ID is required.' }),
});

// ─── Join request (dept head requests access to a subject) ───────────────────
export const joinRequestSchema = Joi.object({
  message: Joi.string().max(300).trim().allow('', null),
  // Optional message from the dept head to the super access holder
});

// ─── List subjects query params ───────────────────────────────────────────────
export const listSubjectsQuerySchema = Joi.object({
  search: Joi.string().max(100).trim().allow('', null),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(1000).default(6),
  // 6 per page as per the UI spec
});