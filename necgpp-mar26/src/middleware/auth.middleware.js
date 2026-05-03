// src/middleware/auth.middleware.js
import jwt          from 'jsonwebtoken';
import { AppError } from '../utils/appError.js';
import { catchAsync } from '../utils/catchAsync.js';

// ─── protect ─────────────────────────────────────────────────────────────────
// Verifies the JWT access token on every protected route.
// Attaches decoded payload to req.user so controllers know who is calling.
// Token must be sent as: Authorization: Bearer <token>

export const protect = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new AppError('You are not logged in. Please log in to get access.', 401);
  }

  const token = header.split(' ')[1];

  // jwt.verify throws JsonWebTokenError (invalid) or TokenExpiredError (expired)
  // Both are caught by globalErrorHandler and converted to clean 401 responses.
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

  // Attach to req — controllers read req.user.userId, req.user.role, req.user.deptId
  req.user = {
    userId: decoded.userId,
    role:   decoded.role,
    deptId: decoded.deptId ?? null,
  };

  next();
});

// ─── restrictTo ───────────────────────────────────────────────────────────────
// Role-based access control factory.
// Usage in routes: restrictTo('Admin', 'Dept Head')
// Always used AFTER protect — req.user is guaranteed to exist here.

export const restrictTo = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};