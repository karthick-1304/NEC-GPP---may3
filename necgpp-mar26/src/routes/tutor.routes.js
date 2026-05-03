// src/routes/tutor.routes.js
import { Router } from 'express';

import {
  getMyTutorward,
  getAvailableStudents,
  updateTutorBatchYear,
  addToTutorward,
  removeFromTutorward,
} from '../controllers/tutor.controller.js';

import { protect, restrictTo }              from '../middleware/auth.middleware.js';
import { validate, validateQuery }          from '../middleware/validate.js';
import {
  listTutorwardQuerySchema,
  availableStudentsQuerySchema,
  updateTutorBatchYearSchema,
  addToTutorwardSchema,
  removeFromTutorwardSchema,
} from '../validators/tutor.validator.js';

const router = Router();

// All tutorward routes — Staff role only.
// Tutorward management is a staff-side workflow; HODs and Admins use other
// routes for student oversight.
router.use(protect, restrictTo('Staff'));

// GET  /api/v1/tutor/my-students          → my tutorward list
router.get('/my-students',
  validateQuery(listTutorwardQuerySchema),
  getMyTutorward
);

// GET  /api/v1/tutor/available-students   → students not in any tutorward
router.get('/available-students',
  validateQuery(availableStudentsQuerySchema),
  getAvailableStudents
);

// PATCH /api/v1/tutor/batch-year          → update tutor_batch_year (blocked if has tutorward)
router.patch('/batch-year',
  validate(updateTutorBatchYearSchema),
  updateTutorBatchYear
);


// POST /api/v1/tutor/add                  → add student to tutorward
router.post('/add',
  validate(addToTutorwardSchema),
  addToTutorward
);

// DELETE /api/v1/tutor/remove             → remove student from tutorward
router.delete('/remove',
  validate(removeFromTutorwardSchema),
  removeFromTutorward
);

export default router;