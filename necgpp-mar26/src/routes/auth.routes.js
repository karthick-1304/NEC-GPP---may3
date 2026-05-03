// src/routes/auth.routes.js
import { Router } from 'express';

import {
  login,
  refresh,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword
} from '../controllers/auth.controller.js';

import { protect }                          from '../middleware/auth.middleware.js';
import { validate }                         from '../middleware/validate.js';
import { authLimiter, otpLimiter, passwordChangeLimiter } from '../middleware/rateLimiter.js';

import {
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

// ─── Public routes ────────────────────────────────────────────────────────────

router.post('/login', authLimiter,validate(loginSchema),login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);

// Forgot password — 3 step flow
router.post('/forgot-password', otpLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/verify-otp',                 validate(verifyOtpSchema),       verifyOtp);
router.post('/reset-password',             validate(resetPasswordSchema),    resetPassword);

// ─── Protected routes ─────────────────────────────────────────────────────────
router.patch('/change-password', protect, passwordChangeLimiter, validate(changePasswordSchema), changePassword);

export default router;