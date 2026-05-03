// src/routes/subject.routes.js
import { Router } from 'express';
import Joi        from 'joi';

import {
  getMySubjects,
  getOtherSubjects,
  getSubject,
  createSubject,
  updateSubject,
  lockSubject,
  lockDeptView,
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  leaveSubject,
  sendJoinRequest,
  exportSubject,
  deleteSubject,
} from '../controllers/subject.controller.js';

import topicRoutes from './topic.routes.js';

import { protect, restrictTo }                       from '../middleware/auth.middleware.js';
import { attachSubject, checkSubjectAccess,
         requireSuperAccess, requireCollaborator }   from '../middleware/subject.middleware.js';
import { validate, validateQuery, validateParams }   from '../middleware/validate.js';

import {
  createSubjectSchema,
  updateSubjectSchema,
  manageCollaboratorSchema,
  joinRequestSchema,
  listSubjectsQuerySchema,
} from '../validators/subject.validator.js';

const router = Router();


router.use(protect);

// ─── Subject list routes ──────────────────────────────────────────────────────
// GET /api/v1/subjects            → my subjects (role-aware)
// GET /api/v1/subjects/other      → other subjects (Dept Head only)

router.get('/',
  validateQuery(listSubjectsQuerySchema),
  getMySubjects
);

router.get('/other',
  restrictTo('Dept Head'),
  validateQuery(listSubjectsQuerySchema),
  getOtherSubjects
);

// ─── Create subject ───────────────────────────────────────────────────────────
router.post('/',
  restrictTo('Admin', 'Dept Head'),
  validate(createSubjectSchema),
  createSubject
);

// ─── Routes that need subject loaded ─────────────────────────────────────────
// All routes below use attachSubject first, then checkSubjectAccess
// Exception: sendJoinRequest — dept head doesn't have access yet, so no checkSubjectAccess

const subjectIdSchema = Joi.object({ subjectId: Joi.number().integer().positive().required() });
// Both params present in DELETE /subjects/:subjectId/collaborators/:deptId
const deptIdSchema    = Joi.object({ subjectId: Joi.number().integer().positive().required(), deptId: Joi.number().integer().positive().required() });

// GET /api/v1/subjects/:subjectId

router.use('/:subjectId',
  validateParams(subjectIdSchema),
  attachSubject
);

// POST /api/v1/subjects/:subjectId/join-request — dept head requests to join
// Note: no checkSubjectAccess here — they don't have access yet
router.post('/:subjectId/join-request',
  restrictTo('Dept Head'),
  validate(joinRequestSchema),
  sendJoinRequest
);

router.use('/:subjectId',
  checkSubjectAccess
);

router.get('/:subjectId',
  getSubject
);

// PATCH /api/v1/subjects/:subjectId — edit name (super access)
router.patch('/:subjectId',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  validate(updateSubjectSchema),
  updateSubject
);

// PATCH /api/v1/subjects/:subjectId/lock — toggle lock (super access)
router.patch('/:subjectId/lock',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  lockSubject
);

// PATCH /api/v1/subjects/:subjectId/dept-lock — toggle dept view lock (collaborator)
router.patch('/:subjectId/dept-lock',
  restrictTo('Dept Head'),
  requireCollaborator,
  lockDeptView
);

// GET /api/v1/subjects/:subjectId/collaborators
router.get('/:subjectId/collaborators',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  getCollaborators
);

// POST /api/v1/subjects/:subjectId/collaborators — add (super access)
router.post('/:subjectId/collaborators',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  validate(manageCollaboratorSchema),
  addCollaborator
);

// DELETE /api/v1/subjects/:subjectId/collaborators/:deptId — remove (super access)
router.delete('/:subjectId/collaborators/:deptId',
  restrictTo('Dept Head', 'Admin'),
  validateParams(deptIdSchema),   
  requireSuperAccess,
  removeCollaborator
);

// POST /api/v1/subjects/:subjectId/leave — collaborator leaves (not creator)
router.post('/:subjectId/leave',
  restrictTo('Dept Head'),
  requireCollaborator,
  leaveSubject
);


// GET /api/v1/subjects/:subjectId/export?type=core|attempts
router.get('/:subjectId/export',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  exportSubject
);

// DELETE /api/v1/subjects/:subjectId — export + delete (super access)
router.delete('/:subjectId',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  deleteSubject
);

router.use('/:subjectId/topics', topicRoutes);

export default router;