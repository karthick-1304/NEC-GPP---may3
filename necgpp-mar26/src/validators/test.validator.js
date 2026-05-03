// src/validators/test.validator.js
import Joi from 'joi';
import { questionSchema } from './set.validator.js';

// ─── Create / Update test ─────────────────────────────────────────────────────
export const createTestSchema = Joi.object({
  test_name: Joi.string().min(2).max(50).trim().required()
    .messages({ 'string.min': 'Test name must be at least 2 characters.' }),

  // Strict: start_time must be strictly greater than the request-time `now`.
  // Joi accepts the literal string 'now' here and re-evaluates it on every
  // validation pass — unlike `Date.now()` which would freeze at module-load
  // and turn the rule into a no-op for long-running servers.
  start_time: Joi.date().iso().greater('now').required()
    .messages({
      'date.greater': 'Start time must be greater than the current time.',
      'date.base':    'Start time must be a valid date.',
    }),

  end_time: Joi.date().iso().greater(Joi.ref('start_time')).required()
    .messages({ 'date.greater': 'End time must be after start time.' }),

  duration_minutes: Joi.number().integer().min(5).max(500).required()
    .messages({ 'number.min': 'Duration must be at least 5 minutes.' }),

  negative_marking: Joi.boolean().default(true),

  // Which dept+batch combos this test is assigned to
  assignments: Joi.array().items(
    Joi.object({
      dept_id:       Joi.number().integer().positive().required(),
      academic_year: Joi.string().max(10).required(),
    })
  ).min(1).required()
    .messages({ 'array.min': 'At least one dept + batch assignment is required.' }),

  // ── Make questions mode ──────────────────────────────────────────────────
  // questions provided directly (strictly validated via shared schema)
  questions: Joi.array().items(questionSchema)
    .when('intelli_pick', { is: true, then: Joi.forbidden(), otherwise: Joi.required() })
    .messages({ 'any.required': 'Questions are required for make-questions mode.' }),

  // ── Intelli-pick mode ────────────────────────────────────────────────────
  intelli_pick: Joi.boolean().default(false),

  intelli_config: Joi.when('intelli_pick', {
    is:   true,
    then: Joi.object({
      subject_id: Joi.number().integer().positive().required(),
      level:      Joi.string().valid('1', '2').required()
        .messages({ 'any.only': 'Level must be 1 (Intermediate) or 2 (Advanced).' }),
      topics: Joi.array().items(
        Joi.object({
          topic_id: Joi.number().integer().positive().required(),
          count:    Joi.number().integer().min(1).max(50).default(3),
        })
      ).min(1).required(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),
});

// ─── Update test settings ─────────────────────────────────────────────────────
export const updateTestSchema = Joi.object({
  test_name:        Joi.string().min(2).max(50).trim(),
  // Same future-only rule applies to updates: the controller only accepts
  // a new start_time when the test hasn't started yet, so the value must
  // still be in the future at the moment of the PATCH.
  start_time:       Joi.date().iso().greater('now')
    .messages({ 'date.greater': 'Start time must be greater than the current time.' }),
  end_time:         Joi.date().iso(),
  duration_minutes: Joi.number().integer().min(5).max(500),
  negative_marking: Joi.boolean(),
  // Assignments: add-only in controller (INSERT IGNORE). Pass at least 1 if provided.
  assignments: Joi.array().items(
    Joi.object({
      dept_id:       Joi.number().integer().positive().required(),
      academic_year: Joi.string().max(10).required(),
    })
  ).min(1),
  // Questions editable only for make-questions mode — controller enforces this
  questions: Joi.array().items(questionSchema),
}).min(1);

// ─── Intelli-pick fetch ────────────────────────────────────────────────────────
export const intelliPickSchema = Joi.object({
  subject_id: Joi.number().integer().positive().required(),
  level:      Joi.string().valid('1', '2').required(),
  topics: Joi.array().items(
    Joi.object({
      topic_id: Joi.number().integer().positive().required(),
      count:    Joi.number().integer().min(1).max(50).default(3),
    })
  ).min(1).required(),
});

// ─── Save progress ────────────────────────────────────────────────────────────
export const saveProgressSchema = Joi.object({
  answers: Joi.array().items(
    Joi.object({
      question_id: Joi.number().integer().positive().required(),
      answer:      Joi.string().max(300).allow('', null),
    })
  ).required(),
});

// ─── Submit test attempt ──────────────────────────────────────────────────────
export const submitTestSchema = Joi.object({
  answers: Joi.array().items(
    Joi.object({
      question_id: Joi.number().integer().positive().required(),
      answer:      Joi.string().max(300).allow('', null),
    })
  ).required(),
});