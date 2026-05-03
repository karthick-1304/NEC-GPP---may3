// src/routes/practice.routes.js
import { Router } from 'express';
import Joi from 'joi';

import {
  getQuestions,
  submitAttempt,
  getPracticeHistory,
} from '../controllers/practice.controller.js';

import { restrictTo } from '../middleware/auth.middleware.js';

import { validate } from '../middleware/validate.js';
import { submitAttemptSchema } from '../validators/set.validator.js';

const router = Router({ mergeParams: true });


// GET  /api/v1/practice/:setId/questions — fetch questions (no correct answers)
router.get('/questions', getQuestions);

// POST /api/v1/practice/:setId/submit — submit answers, get scored result
router.post('/submit', validate(submitAttemptSchema), submitAttempt);

// GET  /api/v1/practice/:setId/history — student's past attempts on this set
router.get('/history', restrictTo('Student'), getPracticeHistory);

export default router;