// src/routes/progress.routes.js
import { Router } from 'express';
import Joi        from 'joi';

import {
  getProgressList,
  getStudentDetail,
  getLeaderboard,
  rebuildLeaderboardManual
} from '../controllers/progress.controller.js';

import { protect, restrictTo }           from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validate.js';

const router = Router();
router.use(protect);

const studentIdSchema = Joi.object({
  studentId: Joi.number().integer().positive().required(),
});

const leaderboardQuerySchema = Joi.object({
  type:       Joi.string().valid('practice', 'test').default('practice'),
  dimension:  Joi.string().valid('all', 'dept', 'batch').default('all'),
  value:      Joi.string().allow('', null), // dept_id or batch_year
  search:     Joi.string().max(100).allow('', null),
});

const progressQuerySchema = Joi.object({
  dept_id:    Joi.number().integer().positive().allow('', null),
  batch_year: Joi.string().max(10).allow('', null),
  search:     Joi.string().max(100).allow('', null),
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(100).default(20),
});

// ─── Progress Tracking ────────────────────────────────────────────────────────
// LIST: Admin/HOD/Staff see their respective permissions. Student sees only self.
router.get('/students',
  restrictTo('Admin', 'Dept Head', 'Staff'),
  validateQuery(progressQuerySchema),
  getProgressList
);

// DETAIL: Full info on single student (eye button)
router.get('/students/:studentId',
  validateParams(studentIdSchema),
  getStudentDetail
);

// ─── Leaderboard ──────────────────────────────────────────────────────────────
router.get('/leaderboard',
  validateQuery(leaderboardQuerySchema),
  getLeaderboard
);

// ─── Admin: manual cache rebuild ─────────────────────────────────────────────
router.post('/leaderboard/rebuild',
  restrictTo('Admin'),
  rebuildLeaderboardManual
);

export default router;