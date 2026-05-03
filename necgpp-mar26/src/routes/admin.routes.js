// src/routes/admin.routes.js
import { Router } from 'express';
import multer     from 'multer';
import Joi        from 'joi';

import {
  listUsers,
  createSingleStudent,
  bulkCreateStudents,
  createSingleStaff,
  bulkCreateStaffs,
  createAdmin,
  createDepartment,
  editStudent,
  editStaff,
  deleteStudentByEmail,
  deleteStaffByEmail,
  bulkDeleteStudents,
} from '../controllers/admin.controller.js';

import { protect, restrictTo }              from '../middleware/auth.middleware.js';
import { validate, validateQuery, validateParams } from '../middleware/validate.js';
import {
  listUsersQuerySchema,
  createSingleStudentSchema,
  createSingleStaffSchema,
  createAdminSchema,
  createDeptSchema,
  editStudentSchema,
  editStaffSchema,
  deleteByEmailSchema,
  bulkDeleteStudentsSchema,
} from '../validators/admin.validator.js';

// Multer for Excel uploads — in memory, max 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only Excel files allowed.'));
  },
});

const userIdSchema = Joi.object({ userId: Joi.number().integer().positive().required() });

const router = Router();

router.use(protect, restrictTo('Admin'));


// ─── Listing ──────────────────────────────────────────────────────────────────
router.get('/users',          validateQuery(listUsersQuerySchema), listUsers);

// ─── Creation ─────────────────────────────────────────────────────────────────
// Single student
router.post('/users/students/single',
  validate(createSingleStudentSchema),
  createSingleStudent
);

// Bulk students via Excel
router.post('/users/students/bulk',
  upload.single('file'),
  bulkCreateStudents
);

// Single staff
router.post('/users/staffs/single',
  validate(createSingleStaffSchema),
  createSingleStaff
);

// Bulk staffs via Excel
router.post('/users/staffs/bulk',
  upload.single('file'),
  bulkCreateStaffs
);

// New admin
router.post('/users/admin',
  validate(createAdminSchema),
  createAdmin
);

// Department + HOD
router.post('/departments',
  validate(createDeptSchema),
  createDepartment
);

// ─── Editing ──────────────────────────────────────────────────────────────────
router.patch('/users/students/:userId',
  validateParams(userIdSchema),
  validate(editStudentSchema),
  editStudent
);

router.patch('/users/staffs/:userId',
  validateParams(userIdSchema),
  validate(editStaffSchema),
  editStaff
);

// ─── Deletion ─────────────────────────────────────────────────────────────────
router.delete('/users/students/single',
  validate(deleteByEmailSchema),
  deleteStudentByEmail
);

router.delete('/users/staffs/single',
  validate(deleteByEmailSchema),
  deleteStaffByEmail
);

router.delete('/users/students/bulk',
  validate(bulkDeleteStudentsSchema),
  bulkDeleteStudents
);

export default router;