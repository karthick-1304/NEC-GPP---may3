// src/middleware/subject.middleware.js
// Three middleware functions used across subject, topic, set, and practice routes.

import { executeQuery } from '../config/db.js';
import { AppError }     from '../utils/appError.js';
import { catchAsync }   from '../utils/catchAsync.js';

// ─── attachSubject ────────────────────────────────────────────────────────────
// Loads the subject row and attaches it to req.subject.
// Used on all routes that have :subjectId in the path.

export const attachSubject = catchAsync(async (req, _res, next) => {
  const subjectId = req.params.subjectId || req.params.id;

  const subjects = await executeQuery(
    `SELECT s.subject_id, s.subject_name, s.locked, s.creator,
            s.created_by, s.topics_count
     FROM subjects s
     WHERE s.subject_id = ?`,
    [subjectId]
  );

  if (!subjects.length) throw new AppError('Subject not found.', 404);

  req.subject = subjects[0];
  next();
});

// ─── checkSubjectAccess ───────────────────────────────────────────────────────

export const checkSubjectAccess = catchAsync(async (req, _res, next) => {
  const { role, userId, deptId } = req.user;
  const subject = req.subject;

  // Admin always has super access
  if (role === 'Admin') {
    req.hasAccess      = true;
    req.isCollaborator = true;
    req.isSuperAccess  = true;
    req.deptSubLock    = false;
    return next();
  }

  if (!deptId) throw new AppError('Your account has no department assigned.', 403);

  // Check if this dept is a collaborator
  const accessRows = await executeQuery(
    'SELECT dept_sub_lock FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, deptId]
  );

  const hasAccess    = accessRows.length > 0;
  const deptSubLock  = hasAccess ? accessRows[0].dept_sub_lock === 1 : false;

  req.hasAccess      = hasAccess;
  req.isCollaborator = role==='Dept Head' && hasAccess;
  req.deptSubLock    = deptSubLock;

  // Super access: Dept Head who created this subject
  let isSuperAccess = false;
  if (role === 'Dept Head' && hasAccess) {
    isSuperAccess = subject.created_by === userId;
  }
  req.isSuperAccess = isSuperAccess;

  // Students and Staff: dept must be a collaborator AND dept_sub_lock = 0
  if (role === 'Student' || role === 'Staff') {
    if (!hasAccess)   throw new AppError('Your department does not have access to this subject.', 403);
    if (deptSubLock)  throw new AppError('This subject is currently hidden for your department.', 403);
  }

  // Dept Head: must be a collaborator (super access implies collaborator)
  if (role === 'Dept Head' && !hasAccess) {
    throw new AppError('Your department is not a collaborator on this subject.', 403);
  }

  // Subject locked: only super access can proceed
  if (subject.locked && !req.isSuperAccess) {
    throw new AppError('This subject is currently locked. Only the Subject owner or Admin can access it.', 403);
  }

  next();
});

// ─── requireSuperAccess ───────────────────────────────────────────────────────
// Rejects the request if the user is not super access.
// Must run AFTER checkSubjectAccess.

export const requireSuperAccess = (req, _res, next) => {
  if (!req.isSuperAccess) {
    return next(new AppError('Only the Subject owner or Admin can perform this action.', 403));
  }
  next();
};

// ─── requireCollaborator ──────────────────────────────────────────────────────
// Rejects if the user is not at least a collaborator.
// Must run AFTER checkSubjectAccess.

export const requireCollaborator = (req, _res, next) => {
  if (!req.isCollaborator) {
    return next(new AppError('Only subject collaborators can perform this action.', 403));
  }
  next();
};