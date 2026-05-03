// src/routes/user.routes.js
import { Router } from 'express';

import { getProfile, getActiveSessions, logoutOtherSessions } from '../controllers/user.controller.js';
import { protect }                   from '../middleware/auth.middleware.js';

const router = Router();

// All user routes require authentication
router.use(protect);

// GET  /api/v1/users/me       → own full profile (role-aware)
router.get  ('/me', getProfile);

router.get  ('/me/sessions',        getActiveSessions);
router.delete('/me/sessions/others', logoutOtherSessions);

export default router;