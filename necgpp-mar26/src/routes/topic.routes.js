// src/routes/topic.routes.js
import { Router } from 'express';
import Joi        from 'joi';

import {
  getTopics, getLevels, createTopic, updateTopic,
  reorderTopics, exportTopic, deleteTopic,
} from '../controllers/topic.controller.js';

import setRoutes from './set.routes.js';

import { restrictTo }                from '../middleware/auth.middleware.js';
import { requireSuperAccess, requireCollaborator } from '../middleware/subject.middleware.js';
import { validate, validateQuery, validateParams } from '../middleware/validate.js';
import {
  createTopicSchema, updateTopicSchema,
  reorderTopicsSchema, listTopicsQuerySchema,
} from '../validators/topic.validator.js';

const router  = Router({ mergeParams: true });
// mergeParams: true — inherits :subjectId from parent subject router

const topicParamSchema = Joi.object({
  topicId:   Joi.number().integer().positive().required()
});




// GET  /api/v1/subjects/:subjectId/topics
router.get('/', validateQuery(listTopicsQuerySchema), getTopics);

// POST /api/v1/subjects/:subjectId/topics
router.post('/',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(createTopicSchema),
  createTopic
);

// PATCH /api/v1/subjects/:subjectId/topics/reorder
router.patch('/reorder',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(reorderTopicsSchema),
  reorderTopics
);


router.use('/:topicId',
  validateParams(topicParamSchema)
);

// GET /api/v1/subjects/:subjectId/topics/:topicId/levels
router.get('/:topicId/levels',
  getLevels
);

// PATCH /api/v1/subjects/:subjectId/topics/:topicId
router.patch('/:topicId',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  validate(updateTopicSchema),
  updateTopic
);

// GET /api/v1/subjects/:subjectId/topics/:topicId/export
router.get('/:topicId/export',
  restrictTo('Dept Head', 'Admin'),
  requireCollaborator,
  exportTopic
);

// DELETE /api/v1/subjects/:subjectId/topics/:topicId
router.delete('/:topicId',
  restrictTo('Dept Head', 'Admin'),
  requireSuperAccess,
  deleteTopic
);


router.use('/:topicId/sets', setRoutes);


export default router;