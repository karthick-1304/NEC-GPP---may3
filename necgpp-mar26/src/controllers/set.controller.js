// src/controllers/set.controller.js
import { deleteImgBBImages } from '../utils/imgbb.js';

import XLSX from 'xlsx';

import { executeQuery, withTransaction } from '../config/db.js';
import { AppError } from '../utils/appError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import { getUnlockedSetIds } from '../middleware/set.middleware.js';
import { buildSetCoreExport, buildSetAttemptsExport } from '../services/export.service.js';
import { parseQuestionsExcel } from '../services/questionParse.service.js';
import { sendSetChangeMail, sendSetDeletedMail } from '../services/email.service.js';
import {
  questionSchema,
  excelQuestionSchema,
  createSetSchema,
  updateSetSchema,
  reorderSetsSchema
} from '../validators/set.validator.js';
import logger from '../utils/logger.js';

// ─── GET SETS ─────────────────────────────────────────────────────────────────
// Lists sets for a topic+level.
// For students: includes lock status per set using gamification algorithm.

export const getSets = catchAsync(async (req, res) => {
  const { subjectId, topicId } = req.params;
  const { level } = req.query;
  const { role, userId } = req.user;

  // Verify topic belongs to subject
  const topics = await executeQuery(
    'SELECT topic_id FROM topics WHERE topic_id = ? AND subject_id = ?',
    [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found in this subject.', 404);

  const sets = await executeQuery(
    `SELECT ps.set_id, ps.level,
          ps.negative_marking, ps.threshold_percentage,
          ps.total_marks, ps.total_questions,
          ps.display_order
    FROM practice_sets ps
    WHERE ps.topic_id = ? AND ps.level = ?
    ORDER BY ps.display_order ASC`,
    [topicId, level]
  );

  // For students — compute which sets are unlocked
  if (role === 'Student') {
    const unlockedIds = await getUnlockedSetIds(userId, topicId, level);
    const unlockedSet = new Set(unlockedIds);

    // Fetch passed sets
    const passedSets = await executeQuery(
      `SELECT DISTINCT pa.set_id
       FROM practice_attempts pa
       JOIN practice_sets ps ON pa.set_id = ps.set_id
       WHERE pa.student_id = ? AND ps.topic_id = ? AND ps.level = ?
       AND ps.total_marks > 0
       AND (pa.score / ps.total_marks * 100) >= ps.threshold_percentage`,
      [userId, topicId, level]
    );
    const passedSetIds = new Set(passedSets.map(s => s.set_id));

    return successResponse(res, {
      sets: sets.map((s, idx) => ({
        ...s,
        set_name: `Set ${idx + 1}`,
        locked: !unlockedSet.has(s.set_id),
        is_unlocked: unlockedSet.has(s.set_id),
        is_completed: unlockedSet.has(s.set_id) && passedSetIds.has(s.set_id)
      })),
      superAccess: req.isSuperAccess
    }, 'Sets fetched.');
  }

  // Non-students see all sets, no lock info
  return successResponse(res, {
    sets: sets.map((s, idx) => ({ ...s, set_name: `Set ${idx + 1}` })),
    superAccess: req.isSuperAccess
  }, 'Sets fetched.');
});

// ─── GET SET FOR ADMIN ────────────────────────────────────────────────────────
// Returns a single set configuration along with its questions including correct answers.
// Strictly restricted to Admins and Dept Heads via router middleware.

export const getSetForAdmin = catchAsync(async (req, res) => {
  const set = req.set; // Attached by attachSet

  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url, q.question_image_delete_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id = ?
     ORDER BY q.question_id ASC`,
    [set.set_id]
  );

  return successResponse(res, {
    set,
    questions,
  }, 'Admin set fetched.');
});

// ─── CREATE SET ───────────────────────────────────────────────────────────────
export const createSet = catchAsync(async (req, res) => {
  const { subjectId, topicId } = req.params;
  const { level, negative_marking, threshold_percentage, questions } = req.body;
  const { userId } = req.user;

  // Verify topic belongs to subject
  const topics = await executeQuery(
    'SELECT topic_id FROM topics WHERE topic_id = ? AND subject_id = ?',
    [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found in this subject.', 404);

  // Auto-compute display_order = max(display_order) + 1 for this topic+level
  const maxOrder = await executeQuery(
    `SELECT COALESCE(MAX(display_order), 0) AS maxOrd
     FROM practice_sets WHERE topic_id = ? AND level = ?`,
    [topicId, level]
  );
  const displayOrder = maxOrder[0].maxOrd + 1;

  // Compute totals from questions array
  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  // Guard: totalMarks must be > 0 to avoid division-by-zero in threshold checks
  if (totalMarks <= 0) {
    throw new AppError('Total marks of all questions must be greater than 0.', 400);
  }

  let newSetId;

  await withTransaction(async (conn) => {
    // Insert set
    const [setResult] = await conn.execute(
      `INSERT INTO practice_sets
         (topic_id, level, negative_marking, display_order, threshold_percentage, total_marks, total_questions, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [topicId, level, negative_marking ? 1 : 0, displayOrder, threshold_percentage, totalMarks, totalQuestions, userId, userId]
    );
    newSetId = setResult.insertId;

    // Bulk insert all questions (one statement) then link to set
    const qCols = `(question_type, question_text,
      option_a, option_b, option_c, option_d,
      correct_answer, marks,
      question_image_url, question_image_thumb_url, question_image_delete_url,
      created_by, updated_by, usage_count)`;
    const qRows = questions.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
    const qVals = questions.flatMap(q => [
      q.question_type, q.question_text,
      q.option_a ?? null, q.option_b ?? null, q.option_c ?? null, q.option_d ?? null,
      q.correct_answer, q.marks,
      q.question_image_url ?? null, q.question_image_thumb_url ?? null, q.question_image_delete_url ?? null,
      userId, userId,
    ]);
    const [qResult] = await conn.execute(`INSERT INTO questions ${qCols} VALUES ${qRows}`, qVals);
    const firstId = qResult.insertId;
    const linkRows = questions.map((_, idx) => '(?,?)').join(',');
    const linkVals = questions.flatMap((_, idx) => [newSetId, firstId + idx]);
    await conn.execute(`INSERT INTO practice_set_questions (set_id, question_id) VALUES ${linkRows}`, linkVals);
  });

  const subjects = await executeQuery(
    'SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]
  );
  const topicRow = await executeQuery(
    'SELECT topic_name FROM topics WHERE topic_id = ?', [topicId]
  );

  sendSetChangeMail(subjectId, subjects[0]?.subject_name, topicRow[0]?.topic_name, 'created')
    .catch(err => logger.error('Set create mail failed', { err: err.message }));

  logger.info('Set created', { newSetId, topicId, subjectId, level, userId });
  return successResponse(res, { set_id: newSetId }, 'Set created.', 201);
});

// ─── UPDATE SET ───────────────────────────────────────────────────────────────
// Replaces all questions in the set.
// Practice attempts are preserved — deleting set questions only removes the link.

export const updateSet = catchAsync(async (req, res) => {
  const { subjectId, topicId, setId } = req.params;
  const { negative_marking, threshold_percentage, questions } = req.body;
  const { userId } = req.user;

  // Verify set belongs to topic+subject
  const sets = await executeQuery(
    `SELECT ps.set_id FROM practice_sets ps
     JOIN topics t ON ps.topic_id = t.topic_id
     WHERE ps.set_id = ? AND ps.topic_id = ? AND t.subject_id = ?`,
    [setId, topicId, subjectId]
  );
  if (!sets.length) throw new AppError('Set not found.', 404);

  await withTransaction(async (conn) => {
    // Update set meta
    const updates = [];
    const params = [];
    if (negative_marking !== undefined) { updates.push('negative_marking = ?'); params.push(negative_marking ? 1 : 0); }
    if (threshold_percentage !== undefined) { updates.push('threshold_percentage = ?'); params.push(threshold_percentage); }

    if (questions !== undefined) {
      const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      const totalQuestions = questions.length;

      if (totalMarks < 0) {
        throw new AppError('Total marks cannot be negative.', 400);
      }

      updates.push('total_marks = ?', 'total_questions = ?');
      params.push(totalMarks, totalQuestions);
    }

    if (updates.length) {
      updates.push('updated_by = ?');
      params.push(userId, setId);
      await conn.execute(`UPDATE practice_sets SET ${updates.join(', ')} WHERE set_id = ?`, params);
    }

    // Replace questions if provided
    if (questions !== undefined) {
      // Get existing question_ids for this set
      const [existing] = await conn.execute(
        'SELECT question_id FROM practice_set_questions WHERE set_id = ?', [setId]
      );
      const existingIds = existing.map(r => r.question_id);
      if (existingIds.length) {
        const ph = existingIds.map(() => '?').join(',');
        // Collect delete URLs for questions that will be permanently removed
        const [imgRows] = await conn.execute(
          `SELECT question_image_delete_url FROM questions
           WHERE question_id IN (${ph}) AND usage_count = 1
             AND question_image_delete_url IS NOT NULL`,
          existingIds
        );
        await conn.execute(
          `DELETE FROM questions WHERE question_id IN (${ph}) AND usage_count = 1`,
          existingIds
        );
        await conn.execute(
          `UPDATE questions SET usage_count = usage_count - 1
          WHERE question_id IN (${ph}) AND usage_count > 1`,
          existingIds
        );
        // Fire-and-forget after transaction succeeds
        if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
      }
      await conn.execute('DELETE FROM practice_set_questions WHERE set_id = ?', [setId]);

      // Bulk insert new questions (one statement) then link to set
      const qCols = `(question_type, question_text,
        option_a, option_b, option_c, option_d,
        correct_answer, marks,
        question_image_url, question_image_thumb_url, question_image_delete_url,
        created_by, updated_by, usage_count)`;
      const qRows = questions.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
      const qVals = questions.flatMap(q => [
        q.question_type, q.question_text,
        q.option_a ?? null, q.option_b ?? null, q.option_c ?? null, q.option_d ?? null,
        q.correct_answer, q.marks,
        q.question_image_url ?? null, q.question_image_thumb_url ?? null, q.question_image_delete_url ?? null,
        userId, userId,
      ]);
      const [qResult] = await conn.execute(`INSERT INTO questions ${qCols} VALUES ${qRows}`, qVals);
      const firstId = qResult.insertId;
      const linkRows = questions.map(() => '(?,?)').join(',');
      const linkVals = questions.flatMap((_, idx) => [setId, firstId + idx]);
      await conn.execute(`INSERT INTO practice_set_questions (set_id, question_id) VALUES ${linkRows}`, linkVals);
    }
  });

  const subjects = await executeQuery('SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]);
  const topicRow = await executeQuery('SELECT topic_name FROM topics WHERE topic_id = ?', [topicId]);

  sendSetChangeMail(subjectId, subjects[0]?.subject_name, topicRow[0]?.topic_name, 'updated')
    .catch(err => logger.error('Set update mail failed', { err: err.message }));

  return successResponse(res, {}, 'Set updated.');
});

// ─── REORDER SETS ─────────────────────────────────────────────────────────────
export const reorderSets = catchAsync(async (req, res) => {
  const { topicId, subjectId } = req.params;
  const { order } = req.body;

  const setIds = order.map(o => o.set_id);
  const ph = setIds.map(() => '?').join(',');
  const existing = await executeQuery(
    `SELECT ps.set_id FROM practice_sets ps
    JOIN topics t ON ps.topic_id = t.topic_id
    WHERE ps.set_id IN (${ph}) AND ps.topic_id = ? AND t.subject_id = ?`,
    [...setIds, topicId, subjectId]
  );
  if (existing.length !== setIds.length) {
    throw new AppError('One or more set IDs do not belong to this topic.', 400);
  }

  await withTransaction(async (conn) => {
    for (const { set_id, display_order } of order) {
      await conn.execute(
        'UPDATE practice_sets SET display_order = ? WHERE set_id = ?',
        [display_order, set_id]
      );
    }
  });

  return successResponse(res, {}, 'Sets reordered.');
});

// ─── EXPORT SET ───────────────────────────────────────────────────────────────
export const exportSet = catchAsync(async (req, res) => {
  const { setId, topicId, subjectId } = req.params;
  const { type = 'core' } = req.query;

  const sets = await executeQuery(
    `SELECT ps.set_id FROM practice_sets ps
    JOIN topics t ON ps.topic_id = t.topic_id
    WHERE ps.set_id = ? AND ps.topic_id = ? AND t.subject_id = ?`,
    [setId, topicId, subjectId]
  );
  if (!sets.length) throw new AppError('Set not found.', 404);

  const buffer = type === 'attempts'
    ? await buildSetAttemptsExport(setId)
    : await buildSetCoreExport(setId);

  const filename = `set_${setId}_${type}_${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

// ─── DELETE SET ───────────────────────────────────────────────────────────────
export const deleteSet = catchAsync(async (req, res) => {
  const { subjectId, topicId, setId } = req.params;

  // Pull `level` so we can re-sequence display_order within the same
  // (topic_id, level) bucket after the delete.
  const sets = await executeQuery(
    `SELECT ps.set_id, ps.level FROM practice_sets ps
     JOIN topics t ON ps.topic_id = t.topic_id
     WHERE ps.set_id = ? AND ps.topic_id = ? AND t.subject_id = ?`,
    [setId, topicId, subjectId]
  );
  if (!sets.length) throw new AppError('Set not found.', 404);
  const deletedLevel = sets[0].level;

  // Export before delete (capture buffers for email attachment)
  const [coreBuffer, attemptsBuffer] = await Promise.all([
    buildSetCoreExport(setId),
    buildSetAttemptsExport(setId),
  ]);

  await withTransaction(async (conn) => {
    // Clean up questions: delete if usage_count = 1, decrement if > 1
    const [qLinks] = await conn.execute(
      'SELECT question_id FROM practice_set_questions WHERE set_id = ?', [setId]
    );
    const qIds = qLinks.map(r => r.question_id);
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
        `DELETE FROM questions WHERE question_id IN (${ph}) AND usage_count = 1`, qIds
      );
      await conn.execute(
        `UPDATE questions SET usage_count = usage_count - 1
        WHERE question_id IN (${ph}) AND usage_count > 1`, qIds
      );
      if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
    }
    await conn.execute('DELETE FROM practice_sets WHERE set_id = ?', [setId]);

    // Safe-ordering: rewrite display_order for the remaining sets in this
    // (topic, level) bucket so the sequence stays 1..N (no holes).
    await conn.execute('SET @r := 0');
    await conn.execute(
      `UPDATE practice_sets SET display_order = (@r := @r + 1)
       WHERE topic_id = ? AND level = ?
       ORDER BY display_order ASC, set_id ASC`,
      [topicId, deletedLevel]
    );
  });

  const subjects = await executeQuery('SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]);
  const topicRow = await executeQuery('SELECT topic_name FROM topics WHERE topic_id = ?', [topicId]);

  sendSetDeletedMail(subjectId, subjects[0]?.subject_name, topicRow[0]?.topic_name, coreBuffer, attemptsBuffer)
    .catch(err => logger.error('Set delete mail failed', { err: err.message }));

  logger.info('Set deleted', { setId, topicId, subjectId, deletedBy: req.user.userId });
  return successResponse(res, {}, 'Set exported and deleted.');
});

// ─── PARSE EXCEL QUESTIONS ────────────────────────────────────────────────────
// Parses uploaded Excel file and returns structured questions for preview.
// Same parser is reused at /tests/parse-excel for test creation.

export const parseExcelQuestions = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded.', 400);

  const result = parseQuestionsExcel(req.file.buffer);
  if (!result.ok) {
    return res.status(result.status).json({
      status: 'fail',
      message: result.message,
      errors: result.errors,
      total: result.total,
      error_count: result.error_count,
    });
  }
  return successResponse(res, {
    parsed: result.parsed,
    total: result.total,
    valid_count: result.valid_count,
  }, 'Excel parsed successfully.');
});