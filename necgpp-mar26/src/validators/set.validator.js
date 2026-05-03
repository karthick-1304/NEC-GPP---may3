// src/validators/set.validator.js
import Joi from 'joi';

// ─── GATE question rules ──────────────────────────────────────────────────────
// MCQ : correct_answer = single lowercase letter a/b/c/d
// MSQ : correct_answer = combination like "ab", "bcd", "ad" (sorted, unique)
// NAT : correct_answer = numeric string, up to 4 decimal places
// Marks are FIXED by GATE rules — not user-input:
//   MCQ: 1 or 2 marks only
//   MSQ: 2 marks only
//   NAT: 1 or 2 marks only

const mcqAnswerPattern = /^[a-d]$/;
// Strictly unique, alphabetically sorted, 1–4 letters from a–d.
// Lookahead requires at least one letter. Matches: a, ab, abcd, bd, cd.
// Rejects: empty, aa, ba, bbcc, dabc.
const msqAnswerPattern = /^(?=.)a?b?c?d?$/;
const natAnswerPattern = /^-?\d+(\.\d{1,4})?$/;

// ─── Question Schema (Manual / DB Writes) ─────────────────────────────────────
export const questionSchema = Joi.object({
  question_type: Joi.string().valid('MCQ', 'MSQ', 'NAT').required()
    .messages({ 'any.only': 'Type must be MCQ, MSQ, or NAT.' }),

  question_text: Joi.string().min(1).max(5000).required()
    .messages({ 'string.min': 'Question text is mandatory.' }),

  // Options logic for MCQ/MSQ
  option_a: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Option A text is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_a.' }),
  }),

  option_b: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Option B text is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_b.' }),
  }),

  option_c: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Option C text is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_c.' }),
  }),

  option_d: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Option D text is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_d.' }),
  }),

  correct_answer: Joi.when('question_type', {
    switch: [
      {
        is: 'MCQ',
        then: Joi.string().lowercase().pattern(mcqAnswerPattern).required()
          .messages({ 'string.pattern.base': 'MCQ answer must be a single letter: a, b, c, or d.' }),
      },
      {
        is: 'MSQ',
        then: Joi.string().lowercase().pattern(msqAnswerPattern).required()
          .messages({ 'string.pattern.base': 'MSQ answer must be unique sorted letters from a-d (e.g. "a", "bc", "abcd").' }),
      },
      {
        is: 'NAT',
        then: Joi.string().pattern(natAnswerPattern).required()
          .messages({ 'string.pattern.base': 'NAT answer must be a numeric value (up to 4 decimals).' }),
      },
    ],
  }),

  marks: Joi.number().valid(1, 2).required()
    .messages({ 'any.only': 'Marks must be 1 or 2 as per GATE format.' }),

  question_image_url:        Joi.string().max(500).allow('', null),
  question_image_thumb_url:  Joi.string().max(500).allow('', null),
  question_image_delete_url: Joi.string().max(500).allow('', null),
});

// ─── Excel Question Schema (Parsing Only) ──────────────────────────────────────
// Strips all image-related fields to enforce "Text Only" in Excel.
export const excelQuestionSchema = Joi.object({
  question_type: Joi.string().valid('MCQ', 'MSQ', 'NAT').required()
    .messages({ 'any.only': 'Type must be MCQ, MSQ, or NAT.' }),

  question_text: Joi.string().min(1).max(5000).required()
    .messages({ 'string.min': 'Excel: Question text is mandatory.' }),

  option_a: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Excel: Option A is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_a. Remove it from the row.' }),
  }),

  option_b: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Excel: Option B is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_b. Remove it from the row.' }),
  }),

  option_c: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Excel: Option C is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_c. Remove it from the row.' }),
  }),

  option_d: Joi.when('question_type', {
    is:        Joi.valid('MCQ', 'MSQ'),
    then:      Joi.string().min(1).max(2000).required()
                 .messages({ 'any.required': 'Excel: Option D is mandatory for MCQ/MSQ.' }),
    otherwise: Joi.any().forbidden()
                 .messages({ 'any.unknown': 'NAT questions must not have option_d. Remove it from the row.' }),
  }),

  correct_answer: Joi.when('question_type', {
    switch: [
      {
        is: 'MCQ',
        then: Joi.string().lowercase().pattern(mcqAnswerPattern).required(),
      },
      {
        is: 'MSQ',
        then: Joi.string().lowercase().pattern(msqAnswerPattern).required(),
      },
      {
        is: 'NAT',
        then: Joi.string().pattern(natAnswerPattern).required(),
      },
    ],
  }),

  marks: Joi.number().valid(1, 2).required()
    .messages({ 'any.only': 'Excel: Marks must be 1 or 2.' }),

  // Explicitly reject image URL — Excel import is text-only
  question_image_url: Joi.any().forbidden()
    .messages({ 'any.unknown': 'question_image_url is not supported in Excel. Use the UI to upload images.' }),
});

// ─── Set Schemas ──────────────────────────────────────────────────────────────
export const createSetSchema = Joi.object({
  level: Joi.string().valid('1', '2').required(),
  negative_marking: Joi.boolean().required(),
  threshold_percentage: Joi.number().integer().min(1).max(100).required(),
  questions: Joi.array().items(questionSchema).min(1).required(),
});

export const updateSetSchema = Joi.object({
  negative_marking: Joi.boolean(),
  threshold_percentage: Joi.number().integer().min(1).max(100),
  questions: Joi.array().items(questionSchema).min(1),
}).min(1);

export const reorderSetsSchema = Joi.object({
  order: Joi.array().items(
    Joi.object({
      set_id: Joi.number().integer().positive().required(),
      display_order: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
});

export const submitAttemptSchema = Joi.object({
  answers: Joi.array().items(
    Joi.object({
      question_id: Joi.number().integer().positive().required(),
      answer: Joi.string().max(300).allow('', null),
    })
  ).min(1).required(),
});

export const listSetsQuerySchema = Joi.object({
  level: Joi.string().valid('1', '2').required(),
});