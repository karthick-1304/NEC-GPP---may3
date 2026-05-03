// src/routes/set.routes.js
import { Router } from 'express';
import multer     from 'multer';
import Joi        from 'joi';

import {
  getSets, createSet, updateSet, reorderSets,
  exportSet, deleteSet, parseExcelQuestions,
  getSetForAdmin
} from '../controllers/set.controller.js';


import practiceRoutes from './practice.routes.js';

import {  requireSuperAccess, requireCollaborator }   from '../middleware/subject.middleware.js';
import { validate, validateQuery, validateParams }   from '../middleware/validate.js';
import {
  createSetSchema, updateSetSchema,
  reorderSetsSchema, listSetsQuerySchema,
} from '../validators/set.validator.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { restrictTo } from '../middleware/auth.middleware.js';
import { attachSet, checkSetAccess } from '../middleware/set.middleware.js';

// Multer — in-memory storage for Excel parse (no disk write)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only Excel files (.xlsx, .xls) are allowed.'));
  },
});

const router = Router({ mergeParams: true });

const setParamSchema = Joi.object({
  setId:     Joi.number().integer().positive().required()
});

// GET  /api/v1/subjects/:subjectId/topics/:topicId/sets?level=1|2
router.get('/', validateQuery(listSetsQuerySchema), getSets);

// POST /api/v1/subjects/:subjectId/topics/:topicId/sets
router.post('/',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(createSetSchema),
  createSet
);

// POST /api/v1/subjects/:subjectId/topics/:topicId/sets/parse-excel
router.post('/parse-excel',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  uploadLimiter,
  upload.single('file'),
  parseExcelQuestions
);

// PATCH /api/v1/subjects/:subjectId/topics/:topicId/sets/reorder
router.patch('/reorder',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(reorderSetsSchema),
  reorderSets
);

router.use('/:setId',
  validateParams(setParamSchema),
  attachSet,
  checkSetAccess
);

// GET /api/v1/subjects/:subjectId/topics/:topicId/sets/:setId/admin
router.get('/:setId/admin',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  getSetForAdmin
);

// PATCH /api/v1/subjects/:subjectId/topics/:topicId/sets/:setId
router.patch('/:setId',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(updateSetSchema),
  updateSet
);

// GET /api/v1/subjects/:subjectId/topics/:topicId/sets/:setId/export
router.get('/:setId/export',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  exportSet
);

// DELETE /api/v1/subjects/:subjectId/topics/:topicId/sets/:setId
router.delete('/:setId',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  deleteSet
);

router.use('/:setId/practice', practiceRoutes);
export default router;