// src/routes/system.routes.js
import { Router } from 'express';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { getEmailStatus, setEmailStatus } from '../controllers/system.controller.js';

const router = Router();

// Mounted at /api/v1/admin/system — admin only.
router.use(protect, restrictTo('Admin'));

router.get('/email-status',  getEmailStatus);
router.post('/email-status', setEmailStatus);

export default router;
