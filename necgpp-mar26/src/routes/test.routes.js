// src/routes/test.routes.js
import { Router } from 'express';
import Joi        from 'joi';
import multer     from 'multer';

import {
  listTests,
  getTestParticipation,
  createTest,
  updateTest,
  deleteTest,
  startAttempt,
  saveProgress,
  submitTestAttempt,
  getTestForAdmin,
  parseExcelQuestionsForTest,
} from '../controllers/test.controller.js';

import { protect, restrictTo }              from '../middleware/auth.middleware.js';
import { validate, validateParams }         from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import {
  createTestSchema,
  updateTestSchema,
  saveProgressSchema,
  submitTestSchema,
} from '../validators/test.validator.js';

// Multer — in-memory for Excel parse (no disk write)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only Excel files (.xlsx, .xls) are allowed.'));
  },
});

const router = Router();
const testIdSchema = Joi.object({ testId: Joi.number().integer().positive().required() });

router.use(protect);

// ─── Test listing ─────────────────────────────────────────────────────────────
router.get('/', listTests);
router.get('/:testId/participation', validateParams(testIdSchema), getTestParticipation);

// ─── Test management (Dept Head / Admin) ──────────────────────────────────────
router.post('/',
  restrictTo('Admin', 'Dept Head'),
  validate(createTestSchema),
  createTest
);

// Excel parse for Make-Questions test creation. Returns the parsed questions
// for client-side preview/edit before submitting the test.
router.post('/parse-excel',
  restrictTo('Admin', 'Dept Head'),
  uploadLimiter,
  upload.single('file'),
  parseExcelQuestionsForTest
);


router.get('/:testId/admin',
  restrictTo('Admin', 'Dept Head'),
  validateParams(testIdSchema),
  getTestForAdmin
);

router.patch('/:testId',
  restrictTo('Admin', 'Dept Head'),
  validateParams(testIdSchema),
  validate(updateTestSchema),
  updateTest
);

router.delete('/:testId',
  restrictTo('Admin', 'Dept Head'),
  validateParams(testIdSchema),
  deleteTest
);

// ─── Test attempting (Students only) ─────────────────────────────────────────
router.post('/:testId/start',
  restrictTo('Student'),
  validateParams(testIdSchema),
  startAttempt
);

router.post('/:testId/save',
  restrictTo('Student'),
  validateParams(testIdSchema),
  validate(saveProgressSchema),
  saveProgress
);

router.post('/:testId/submit',
  restrictTo('Student'),
  validateParams(testIdSchema),
  validate(submitTestSchema),
  submitTestAttempt
);


export default router;