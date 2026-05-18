// src/controllers/subject.controller.js
import { deleteImgBBImages } from '../utils/imgbb.js';

import { executeQuery, withTransaction } from '../config/db.js';
import { cacheGet, cacheSet, cacheDel }  from '../config/redis.js';
import { AppError }                      from '../utils/appError.js';
import { catchAsync }                    from '../utils/catchAsync.js';
import { successResponse }               from '../utils/successResponse.js';
import {
  buildSubjectCoreExport,
  buildSubjectAttemptsExport,
} from '../services/export.service.js';
import {
  sendSubjectCreatedMails,
  sendSubjectUpdatedMail,
  sendSubjectLockMail,
  sendDeptViewLockMail,
  sendCollaboratorAddedMail,
  sendCollaboratorRemovedMail,
  sendCollaboratorLeftMail,
  sendSubjectDeletedMail,
  sendJoinRequestMail,
} from '../services/email.service.js';
import logger from '../utils/logger.js';

const SUBJECT_CACHE_TTL = 3600;
const OTHER_SUBJECTS_CACHE_TTL = 3600;


// Invalidates caches for all depts + admin
export const invalidateSubjectCacheForAll = async () => {
  const depts = await executeQuery('SELECT dept_id FROM departments');
  for (const { dept_id } of depts) {
    await cacheDel(
      `subjects:dept:${dept_id}:my`,
      `subjects:dept:${dept_id}:other`
    );
  }
  await cacheDel('subjects:admin');
};

// Invalidates cache for a single dept + admin
const invalidateSubjectCacheForDept = async (deptId) => {
  await cacheDel(
    `subjects:dept:${deptId}:my`,
    `subjects:dept:${deptId}:other`
  );
};

// ─── GET MY SUBJECTS ──────────────────────────────────────────────────────────
export const getMySubjects = catchAsync(async (req, res) => {
  const { role, deptId } = req.user;
  const { search, page = 1, limit = 6 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const cacheKey = role === 'Admin'
    ? 'subjects:admin'
    : `subjects:dept:${deptId}:my`;
  // ONE cache key per dept — same data for Dept Head, Staff, Student
  // Frontend shows lock status; backend enforces access on actual subject open

  if (!search) {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const total     = cached.length;
      let paginated = cached.slice(offset, offset + parseInt(limit));
      
      paginated = paginated.map(sub => {
        let superAccess = false;
        if (role === 'Admin') {
          superAccess = true;
        } else if (role === 'Dept Head' && sub.created_by === req.user.userId) {
          superAccess = true;
        }
        return { ...sub, superAccess };
      });

      res.set('X-Total-Count', total);
      return successResponse(res, { subjects: paginated, total, page: parseInt(page), limit: parseInt(limit) }, 'Subjects fetched.');
    }
  }

  const conditions = [];
  const params     = [];

  if (search) {
    conditions.push('(s.subject_name LIKE ? OR s.subject_id = ?)');
    params.push(`%${search}%`, parseInt(search) || 0);
  }

  let dataQuery;
  let queryParams;

  if (role === 'Admin') {
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    dataQuery = `
      SELECT s.subject_id, s.subject_name, s.locked, s.creator, s.created_by, s.topics_count, s.created_at
      FROM subjects s
      ${whereClause}
      ORDER BY s.subject_name`;
    queryParams = [...params];

  } else {
    // Dept Head + Staff + Student — same query, same cache key per dept
    // All see every subject their dept collaborates on, with lock status included
    // dept_sub_lock=1 cards shown to all — but checkSubjectAccess blocks entry for Staff/Student
    conditions.push('sad.dept_id = ?');
    params.push(deptId);
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    dataQuery = `
      SELECT s.subject_id, s.subject_name, s.locked, s.creator, s.created_by,
             s.topics_count, s.created_at, sad.dept_sub_lock
      FROM subjects s
      JOIN subject_access_dept sad ON s.subject_id = sad.subject_id
      ${whereClause}
      ORDER BY s.subject_name`;
    queryParams = [...params];
  }

  let allSubjects = await executeQuery(dataQuery, queryParams);

  if (!search) {
    await cacheSet(cacheKey, allSubjects, SUBJECT_CACHE_TTL);
  }

  const total = allSubjects.length;
  let subjects = allSubjects.slice(offset, offset + parseInt(limit));

  subjects = subjects.map(sub => {
    let superAccess = false;
    let collaboratorAccess = false;
    if (role === 'Admin') {
      superAccess = true;
      collaboratorAccess = true;
    } else if (role === 'Dept Head' && sub.created_by === req.user.userId) {
      superAccess = true;
    }
    if(role==='Dept Head'){
      collaboratorAccess = true;
    }
    return { ...sub, superAccess, collaboratorAccess };
  });

  res.set('X-Total-Count', total);
  return successResponse(res, { subjects, total, page: parseInt(page), limit: parseInt(limit) }, 'Subjects fetched.');
});


// ─── GET OTHER SUBJECTS (Dept Head only) ─────────────────────────────────────

export const getOtherSubjects = catchAsync(async (req, res) => {
  const { deptId } = req.user;
  const { search, page = 1, limit = 6 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const cacheKey = `subjects:dept:${deptId}:other`;

  // Serve from cache — only for non-search
  if (!search) {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const total     = cached.length;
      const paginated = cached.slice(offset, offset + parseInt(limit));
      res.set('X-Total-Count', total);
      return successResponse(res, { subjects: paginated, total, page: parseInt(page), limit: parseInt(limit) }, 'Other subjects fetched.');
    }
  }

  const searchCondition = search
    ? 'AND (s.subject_name LIKE ? OR s.subject_id = ?)'
    : '';
  const searchParams = search
    ? [`%${search}%`, parseInt(search) || 0]
    : [];

  const otherSubjects = await executeQuery(
    `SELECT s.subject_id, s.subject_name, s.topics_count, s.creator
     FROM subjects s
     LEFT JOIN subject_access_dept sad
       ON s.subject_id = sad.subject_id AND sad.dept_id = ?
     WHERE sad.dept_id IS NULL ${searchCondition}
     ORDER BY s.subject_name`,
    [deptId, ...searchParams]
  );

  if (!search) {
    await cacheSet(cacheKey, otherSubjects, OTHER_SUBJECTS_CACHE_TTL);
  }

  const total     = otherSubjects.length;
  const subjects  = otherSubjects.slice(offset, offset + parseInt(limit));

  res.set('X-Total-Count', total);
  return successResponse(res, { subjects, total, page: parseInt(page), limit: parseInt(limit) }, 'Other subjects fetched.');
});


// ─── GET SINGLE SUBJECT ───────────────────────────────────────────────────────
export const getSubject = catchAsync(async (req, res) => {
  return successResponse(res, { subject: req.subject }, 'Subject fetched.');
});

// ─── CREATE SUBJECT ───────────────────────────────────────────────────────────
export const createSubject = catchAsync(async (req, res) => {
  const { subject_name, collaborator_dept_ids = [], notify = true } = req.body;
  const { role, userId, deptId } = req.user;

  let creator       = 'Admin';
  let creatorDeptId = null;

  if (role === 'Dept Head') {
    const deptRows = await executeQuery(
      'SELECT dept_code, dept_id FROM departments WHERE dept_id = ?',
      [deptId]
    );
    if (!deptRows.length) throw new AppError('Your department was not found.', 400);
    creator       = deptRows[0].dept_code;
    creatorDeptId = deptRows[0].dept_id;
  }

  const finalCollabDeptIds = [...new Set([
    ...(creatorDeptId ? [creatorDeptId] : []),
    ...collaborator_dept_ids,
  ])];

  if (finalCollabDeptIds.length) {
    const ph    = finalCollabDeptIds.map(() => '?').join(',');
    const depts = await executeQuery(
      `SELECT dept_id FROM departments WHERE dept_id IN (${ph})`,
      finalCollabDeptIds
    );
    if (depts.length !== finalCollabDeptIds.length) {
      throw new AppError('One or more department IDs are invalid.', 400);
    }
  }

  // Check for duplicate subject name (subjects.subject_name is UNIQUE)
  const existingSubject = await executeQuery(
    'SELECT subject_id FROM subjects WHERE subject_name = ?',
    [subject_name]
  );
  if (existingSubject.length) {
    throw new AppError(`A subject named '${subject_name}' already exists.`, 409);
  }

  let newSubjectId;

  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO subjects (subject_name, creator, created_by, locked) VALUES (?, ?, ?, 0)`,
      [subject_name, creator, userId]
    );
    newSubjectId = result.insertId;

    if (finalCollabDeptIds.length) {
      const placeholders = finalCollabDeptIds.map(() => '(?, ?, 0)').join(',');
      const values       = finalCollabDeptIds.flatMap(id => [newSubjectId, id]);
      await conn.execute(
        `INSERT INTO subject_access_dept (subject_id, dept_id, dept_sub_lock) VALUES ${placeholders}`,
        values
      );
    }
  });

  await invalidateSubjectCacheForAll();
  
  
    const allDepts   = await executeQuery('SELECT dept_id FROM departments');
    const allDeptIds = allDepts.map(d => d.dept_id);
    sendSubjectCreatedMails({ subject_name }, finalCollabDeptIds, allDeptIds, notify)
      .catch(err => logger.error('Subject creation mail failed', { err: err.message }));
  

  logger.info('Subject created', { subjectId: newSubjectId, creator, userId });
  return successResponse(res, { subject_id: newSubjectId }, 'Subject created successfully.', 201);
});

// ─── UPDATE SUBJECT NAME ──────────────────────────────────────────────────────
export const updateSubject = catchAsync(async (req, res) => {
  const { subject_name } = req.body;
  const subject          = req.subject;

  const existing = await executeQuery(
    'SELECT subject_id FROM subjects WHERE subject_name = ? AND subject_id != ?',
    [subject_name, subject.subject_id]
  );
  
  if (existing.length) {
    throw new AppError(`A subject named '${subject_name}' already exists.`, 409);
  }

  await executeQuery(
    'UPDATE subjects SET subject_name = ?, updated_by = ? WHERE subject_id = ?',
    [subject_name, req.user.userId, subject.subject_id]
  );

  // Invalidate ALL collaborating depts — name changed for everyone
  await invalidateSubjectCacheForAll();

  sendSubjectUpdatedMail(subject.subject_id, subject.subject_name, subject_name)
    .catch(err => logger.error('Subject update mail failed', { err: err.message }));

  return successResponse(res, {}, 'Subject updated.');
});

// ─── LOCK / UNLOCK SUBJECT ────────────────────────────────────────────────────
export const lockSubject = catchAsync(async (req, res) => {
  const subject   = req.subject;
  const newLocked = subject.locked ? 0 : 1;

  await executeQuery(
    'UPDATE subjects SET locked = ?, updated_by = ? WHERE subject_id = ?',
    [newLocked, req.user.userId, subject.subject_id]
  );

  // Locked state visible to all collaborators — invalidate all
  await invalidateSubjectCacheForAll();

  sendSubjectLockMail(subject.subject_id, subject.subject_name, newLocked === 1)
    .catch(err => logger.error('Subject lock mail failed', { err: err.message }));

  return successResponse(res, { locked: newLocked === 1 }, `Subject ${newLocked ? 'locked' : 'unlocked'}.`);
});

// ─── LOCK / UNLOCK DEPT VIEW ──────────────────────────────────────────────────
export const lockDeptView = catchAsync(async (req, res) => {
  const { deptId } = req.user;
  const subject    = req.subject;

  const rows = await executeQuery(
    'SELECT dept_sub_lock FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, deptId]
  );
  if (!rows.length) throw new AppError('Your department is not a collaborator on this subject.', 403);

  const newLock = rows[0].dept_sub_lock ? 0 : 1;

  await executeQuery(
    'UPDATE subject_access_dept SET dept_sub_lock = ? WHERE subject_id = ? AND dept_id = ?',
    [newLock, subject.subject_id, deptId]
  );

  // Only this dept's cache is affected — students/staff of this dept see the change
  await cacheDel(`subjects:dept:${deptId}:my`);

  sendDeptViewLockMail(deptId, subject.subject_name, newLock === 1)
    .catch(err => logger.error('Dept view lock mail failed', { err: err.message }));

  return successResponse(res, { dept_sub_lock: newLock === 1 }, `Subject ${newLock ? 'hidden from' : 'shown to'} your department.`);
});

// ─── GET COLLABORATORS ────────────────────────────────────────────────────────
export const getCollaborators = catchAsync(async (req, res) => {
  const subject = req.subject;

  const collaborators = await executeQuery(
    `SELECT d.dept_id, d.dept_name, d.dept_code, sad.dept_sub_lock
     FROM subject_access_dept sad
     JOIN departments d ON sad.dept_id = d.dept_id
     WHERE sad.subject_id = ?
     ORDER BY d.dept_name`,
    [subject.subject_id]
  );

  let nonCollaborators = [];

  if (req.isSuperAccess) {
    const collabIds = collaborators.map(c => c.dept_id);
    const ph        = collabIds.length
      ? `AND d.dept_id NOT IN (${collabIds.map(() => '?').join(',')})`
      : '';
    nonCollaborators = await executeQuery(
      `SELECT d.dept_id, d.dept_name, d.dept_code
       FROM departments d
       WHERE 1=1 ${ph}
       ORDER BY d.dept_name`,
      collabIds
    );
  }

  return successResponse(res, { collaborators, nonCollaborators }, 'Collaborators fetched.');
});


// ─── ADD COLLABORATOR ─────────────────────────────────────────────────────────
export const addCollaborator = catchAsync(async (req, res) => {
  const { dept_id } = req.body;
  const subject     = req.subject;

  const depts = await executeQuery(
    'SELECT dept_id, dept_name FROM departments WHERE dept_id = ?',
    [dept_id]
  );
  if (!depts.length) throw new AppError('Department not found.', 404);

  const existing = await executeQuery(
    'SELECT dept_id FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, dept_id]
  );
  if (existing.length) throw new AppError('This department is already a collaborator.', 409);

  await executeQuery(
    'INSERT INTO subject_access_dept (subject_id, dept_id, dept_sub_lock) VALUES (?, ?, 0)',
    [subject.subject_id, dept_id]
  );

  // New dept can now see it in "my" — remove from "other" too
  await invalidateSubjectCacheForDept(dept_id);

  sendCollaboratorAddedMail(subject.subject_id, subject.subject_name, depts[0].dept_name)
    .catch(err => logger.error('Collaborator added mail failed', { err: err.message }));

  return successResponse(res, {}, 'Department added as collaborator.');
});

// ─── REMOVE COLLABORATOR ──────────────────────────────────────────────────────
export const removeCollaborator = catchAsync(async (req, res) => {
  const { deptId: removeDeptId } = req.params;
  const subject                  = req.subject;

  const deptRows = await executeQuery(
    'SELECT dept_code, dept_name FROM departments WHERE dept_id = ?',
    [removeDeptId]
  );
  if (!deptRows.length) throw new AppError('Department not found.', 404);

  if (deptRows[0].dept_code === subject.creator) {
    throw new AppError("Cannot remove the subject creator's department from collaborators.", 400);
  }

  const existing = await executeQuery(
    'SELECT dept_id FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, removeDeptId]
  );
  if (!existing.length) throw new AppError('This department is not a collaborator.', 404);

  await executeQuery(
    'DELETE FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, removeDeptId]
  );

  // Removed dept: clear "my" (no longer a collaborator) + "other" (now appears there) + admin
  await invalidateSubjectCacheForDept(removeDeptId);

  sendCollaboratorRemovedMail(subject.subject_id, subject.subject_name, removeDeptId, deptRows[0].dept_name)
    .catch(err => logger.error('Collaborator removed mail failed', { err: err.message }));

  return successResponse(res, {}, 'Department removed from collaborators.');
});

// ─── LEAVE SUBJECT ────────────────────────────────────────────────────────────
export const leaveSubject = catchAsync(async (req, res) => {
  const { deptId } = req.user;
  const subject    = req.subject;

  const deptRows = await executeQuery(
    'SELECT dept_code, dept_name FROM departments WHERE dept_id = ?',
    [deptId]
  );
  if (!deptRows.length) throw new AppError('Department not found.', 404);

  if (deptRows[0].dept_code === subject.creator) {
    throw new AppError('The subject creator cannot leave.', 400);
  }
  const existing = await executeQuery(
    'SELECT dept_id FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, deptId]
  );
  if (!existing.length) throw new AppError('Your department is not a collaborator.', 404);

  await executeQuery(
    'DELETE FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, deptId]
  );

  // Same as removeCollaborator — clears my + other + admin caches
  await invalidateSubjectCacheForDept(deptId);

  sendCollaboratorLeftMail(subject.subject_id, subject.subject_name,deptId, deptRows[0].dept_name)
    .catch(err => logger.error('Leave subject mail failed', { err: err.message }));

  return successResponse(res, {}, 'You have left this subject.');
});

// ─── SEND JOIN REQUEST ────────────────────────────────────────────────────────
export const sendJoinRequest = catchAsync(async (req, res) => {
  const { deptId } = req.user;
  const subject    = req.subject;

  const deptRows = await executeQuery(
    'SELECT dept_name FROM departments WHERE dept_id = ?',
    [deptId]
  );
  if (!deptRows.length) throw new AppError('Department not found.', 404);

  const existing = await executeQuery(
    'SELECT dept_id FROM subject_access_dept WHERE subject_id = ? AND dept_id = ?',
    [subject.subject_id, deptId]
  );
  if (existing.length) throw new AppError('Your department is already a collaborator on this subject.', 409);

  sendJoinRequestMail(subject.subject_id, subject.subject_name, deptRows[0].dept_name)
    .catch(err => logger.error('Join request mail failed', { err: err.message }));

  return successResponse(res, {}, 'Join request sent to the subject owner.');
});

// ─── EXPORT SUBJECT ───────────────────────────────────────────────────────────
export const exportSubject = catchAsync(async (req, res) => {
  const { type = 'core' } = req.query;
  const subject = req.subject;

  const buffer = type === 'attempts'
    ? await buildSubjectAttemptsExport(subject.subject_id)
    : await buildSubjectCoreExport(subject.subject_id);

  const filename = `${subject.subject_name.replace(/\s+/g, '_')}_${type}_${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

// ─── DELETE SUBJECT ───────────────────────────────────────────────────────────
export const deleteSubject = catchAsync(async (req, res) => {
  const subject = req.subject;

  // Step 1: Build exports before any deletion
  const [coreBuffer, attemptsBuffer] = await Promise.all([
    buildSubjectCoreExport(subject.subject_id),
    buildSubjectAttemptsExport(subject.subject_id),
  ]);

  // Fetch collaborator emails + affected depts BEFORE cascade deletes them
  const collaboratorRows = await executeQuery(
    `SELECT u.email FROM users u
    JOIN departments d ON d.head_user_id = u.user_id
    JOIN subject_access_dept sad ON sad.dept_id = d.dept_id
    WHERE sad.subject_id = ?`,
    [subject.subject_id]
 );

  // Step 2: Handle question usage_count before cascade delete
  await withTransaction(async (conn) => {
    const [qRows] = await conn.execute(
      `SELECT DISTINCT psq.question_id
       FROM practice_set_questions psq
       JOIN practice_sets ps ON psq.set_id = ps.set_id
       JOIN topics t ON ps.topic_id = t.topic_id
       WHERE t.subject_id = ?`,
      [subject.subject_id]
    );
    const qIds = qRows.map(r => r.question_id);

    if (qIds.length) {
      const ph = qIds.map(() => '?').join(',');
      // Collect delete URLs before permanent removal
      const [imgRows] = await conn.execute(
        `SELECT question_image_delete_url FROM questions
         WHERE question_id IN (${ph}) AND usage_count = 1
           AND question_image_delete_url IS NOT NULL`,
        qIds
      );
      await conn.execute(
        `DELETE FROM questions WHERE question_id IN (${ph}) AND usage_count = 1`,
        qIds
      );
      await conn.execute(
        `UPDATE questions SET usage_count = usage_count - 1
         WHERE question_id IN (${ph}) AND usage_count > 1`,
        qIds
      );
      if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
    }

    // CASCADE handles: subject_access_dept, topics, practice_sets, practice_set_questions
    await conn.execute('DELETE FROM subjects WHERE subject_id = ?', [subject.subject_id]);
  });

  // Step 3: Invalidate all affected caches
  await invalidateSubjectCacheForAll();

  // Step 4: Mail (fire-and-forget)
  const collaboratorEmails = collaboratorRows.map(r => r.email);
  sendSubjectDeletedMail(subject.subject_name, collaboratorEmails, coreBuffer, attemptsBuffer)
    .catch(err => logger.error('Subject deleted mail failed', { err: err.message }));

  logger.info('Subject deleted', { subjectId: subject.subject_id, deletedBy: req.user.userId });
  return successResponse(res, {}, 'Subject exported and deleted successfully.');
});