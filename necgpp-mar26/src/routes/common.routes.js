// src/routes/common.routes.js
import { Router } from 'express';

import { getDepartments, getBatchYears } from '../controllers/common.controller.js';
import { protect }                       from '../middleware/auth.middleware.js';

const router = Router();

// All routes require login — no role restriction (any authenticated user can use these)
router.use(protect);

// GET /api/v1/common/departments  → all dept_id, dept_name, dept_code
router.get('/departments', getDepartments);

// GET /api/v1/common/batch-years  → distinct batch_years from students
router.get('/batch-years', getBatchYears);

export default router;
