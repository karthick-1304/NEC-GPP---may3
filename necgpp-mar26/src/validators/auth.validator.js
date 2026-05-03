// src/validators/auth.validator.js
import Joi from 'joi';

const email    = Joi.string().email().max(50).lowercase().trim().required()
  .messages({ 'string.email': 'Please provide a valid email address.' });

const password = Joi.string().min(8).max(64).required()
  .messages({
    'string.min': 'Password must be at least 8 characters.',
    'string.max': 'Password must not exceed 64 characters.',
  });

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = Joi.object({
  email,
  password: Joi.string().required().messages({ 'any.required': 'Password is required.' })
  // No min/max on login password — just check it exists.
  // Validation of strength only on registration/reset, not login.
});

// ─── Forgot password — send OTP ───────────────────────────────────────────────
export const forgotPasswordSchema = Joi.object({ email });

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export const verifyOtpSchema = Joi.object({
  email,
  otp: Joi.string()
    .length(parseInt(process.env.OTP_DIGITS) || 6)
    .pattern(/^\d+$/)
    .required()
    .messages({
      'string.length':  'OTP must be exactly 6 digits.',
      'string.pattern.base': 'OTP must contain digits only.',
    })
});

// ─── Reset password ───────────────────────────────────────────────────────────
export const resetPasswordSchema = Joi.object({
  email,
  otp: Joi.string()
    .length(parseInt(process.env.OTP_DIGITS) || 6)
    .pattern(/^\d+$/)
    .required(),
  newPassword: password,
  // confirmPassword is a frontend-only UX field — controller never reads it
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).optional()
    .messages({ 'any.only': 'Passwords do not match.' })
});

// ─── Change password (logged in) ──────────────────────────────────────────────
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required()
    .messages({ 'any.required': 'Current password is required.' }),
  newPassword: password,
  // confirmPassword is a frontend-only UX field — controller never reads it
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).optional()
    .messages({ 'any.only': 'Passwords do not match.' })
});