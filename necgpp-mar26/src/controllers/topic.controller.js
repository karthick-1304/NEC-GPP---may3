// src/controllers/topic.controller.js
import { deleteImgBBImages } from '../utils/imgbb.js';

import { executeQuery, withTransaction } from '../config/db.js';
import { AppError }                      from '../utils/appError.js';
import { catchAsync }                    from '../utils/catchAsync.js';
import { successResponse }               from '../utils/successResponse.js';
import { buildTopicCoreExport, buildTopicAttemptsExport } from '../services/export.service.js';
import { sendTopicChangeMail, sendTopicDeletedMail }      from '../services/email.service.js';
import { invalidateSubjectCacheForAll } from './subject.controller.js';
import logger from '../utils/logger.js';

// ─── GET TOPICS ───────────────────────────────────────────────────────────────
// Lists topics for a subject with pagination.
// Ordered by display_order. Each card shows set counts per level.

export const getTopics = catchAsync(async (req, res) => {
  const { subjectId } = req.params;
  const { search, page = 1, limit = 6 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);


  const conditions = ['t.subject_id = ?'];
  const params     = [subjectId];

  if (search) {
    conditions.push('(t.topic_name LIKE ? OR t.topic_id = ?)');
    params.push(`%${search}%`, parseInt(search) || 0);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM topics t ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const topics = await executeQuery(
    `SELECT t.topic_id, t.topic_name, t.display_order,
            SUM(ps.level = '1') AS sets_level1,
            SUM(ps.level = '2') AS sets_level2,
            COUNT(ps.set_id)    AS total_sets
     FROM topics t
     LEFT JOIN practice_sets ps ON ps.topic_id = t.topic_id
     ${whereClause}
     GROUP BY t.topic_id
     ORDER BY t.display_order ASC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  res.set('X-Total-Count', total);
  return successResponse(res, { topics, total, page: parseInt(page), limit: parseInt(limit), superAccess: req.isSuperAccess }, 'Topics fetched.');
});

// ─── GET LEVELS FOR A TOPIC ───────────────────────────────────────────────────
// Returns level 1 and level 2 card data.
// For students: includes lock status and new_sets_available indicator.

export const getLevels = catchAsync(async (req, res) => {
  const { subjectId, topicId } = req.params;
  const { role, userId }       = req.user;

  // Verify topic belongs to subject
  const topics = await executeQuery(
    'SELECT topic_id, topic_name FROM topics WHERE topic_id = ? AND subject_id = ?',
    [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found in this subject.', 404);

  // Get set counts per level
  const setCounts = await executeQuery(
    `SELECT level, COUNT(*) AS set_count
     FROM practice_sets WHERE topic_id = ?
     GROUP BY level`,
    [topicId]
  );

  const countMap = { '1': 0, '2': 0 };
  for (const row of setCounts) countMap[row.level] = row.set_count;

  const levels = [
    { level: '1', label: 'Level 1', description: 'Intermediate', set_count: countMap['1'] },
    { level: '2', label: 'Level 2', description: 'Advanced',     set_count: countMap['2'] },
  ];

  // For students — compute lock status and new sets indicator
  // Replace the per-level loop with one query for all student data:
if (role === 'Student') {
  const [completedLevels, passedSets] = await Promise.all([
    executeQuery(
      `SELECT level FROM student_topic_levels
       WHERE student_id = ? AND topic_id = ?`,
      [userId, topicId]
    ),
    executeQuery(
      `SELECT ps.level, COUNT(DISTINCT pa.set_id) AS cnt
       FROM practice_attempts pa
       JOIN practice_sets ps ON pa.set_id = ps.set_id
       WHERE pa.student_id = ?
         AND ps.topic_id   = ?
         AND ps.total_marks > 0
         AND (pa.score / ps.total_marks * 100) >= ps.threshold_percentage
       GROUP BY ps.level`,
      [userId, topicId]
    ),
  ]);

  const completedSet  = new Set(completedLevels.map(r => r.level));
  const passedMap     = Object.fromEntries(passedSets.map(r => [r.level, r.cnt]));
  const level1Complete = completedSet.has('1');

  for (const lvl of levels) {
    lvl.locked = lvl.level === '2' && !level1Complete;
    lvl.completed_sets = passedMap[lvl.level] ?? 0;  
    if (completedSet.has(lvl.level)) {
      lvl.new_sets_available = lvl.set_count > (passedMap[lvl.level] ?? 0);
    } else {
      lvl.new_sets_available = false;
    }
  }
}

  return successResponse(res, { topic: topics[0], levels }, 'Levels fetched.');
});

// ─── CREATE TOPIC ─────────────────────────────────────────────────────────────
export const createTopic = catchAsync(async (req, res) => {
  const { subjectId }  = req.params;
  const { topic_name } = req.body;
  const { userId }     = req.user;

  // Check for duplicate topic name within this subject
  const duplicate = await executeQuery(
    'SELECT topic_id FROM topics WHERE subject_id = ? AND topic_name = ?',
    [subjectId, topic_name]
  );
  if (duplicate.length) {
    throw new AppError(`A topic named '${topic_name}' already exists in this subject.`, 409);
  }

  // Get the current max display_order for this subject
  const maxOrder = await executeQuery(
    'SELECT COALESCE(MAX(display_order), 0) AS maxOrd FROM topics WHERE subject_id = ?',
    [subjectId]
  );
  const displayOrder = maxOrder[0].maxOrd + 1;
  let newTopicId;
  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO topics (subject_id, topic_name, display_order, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?)`,
      [subjectId, topic_name, displayOrder, userId, userId]
    );
    newTopicId = result.insertId;

    await conn.execute(
      'UPDATE subjects SET topics_count = topics_count + 1 WHERE subject_id = ?',
      [subjectId]
    );
  });

  // Get subject name for mail
  const subjects = await executeQuery(
    'SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]
  );

  await invalidateSubjectCacheForAll();

  sendTopicChangeMail(subjectId, subjects[0]?.subject_name, topic_name, 'created')
    .catch(err => logger.error('Topic create mail failed', { err: err.message }));

  return successResponse(res, { topic_id: newTopicId }, 'Topic created.', 201);
});

// ─── UPDATE TOPIC ─────────────────────────────────────────────────────────────
export const updateTopic = catchAsync(async (req, res) => {
  const { subjectId, topicId } = req.params;
  const { topic_name }         = req.body;

  const topics = await executeQuery(
    'SELECT topic_id, topic_name FROM topics WHERE topic_id = ? AND subject_id = ?',
    [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found.', 404);

  // Check for duplicate topic name within this subject (exclude current topic)
  const duplicate = await executeQuery(
    'SELECT topic_id FROM topics WHERE subject_id = ? AND topic_name = ? AND topic_id != ?',
    [subjectId, topic_name, topicId]
  );
  if (duplicate.length) {
    throw new AppError(`A topic named '${topic_name}' already exists in this subject.`, 409);
  }

  const oldTopicName = topics[0].topic_name;

  await executeQuery(
    'UPDATE topics SET topic_name = ?, updated_by = ? WHERE topic_id = ?',
    [topic_name, req.user.userId, topicId]
  );

  const subjects = await executeQuery(
    'SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]
  );

  sendTopicChangeMail(subjectId, subjects[0]?.subject_name, topic_name, 'updated', oldTopicName)
    .catch(err => logger.error('Topic update mail failed', { err: err.message }));

  return successResponse(res, {}, 'Topic updated.');
});

// ─── REORDER TOPICS ───────────────────────────────────────────────────────────
export const reorderTopics = catchAsync(async (req, res) => {
  const { subjectId } = req.params;
  const { order }     = req.body;
  // order: [{ topic_id: 5, display_order: 1 }, { topic_id: 3, display_order: 2 }, ...]

  // Verify all topic_ids belong to this subject
  const topicIds = order.map(o => o.topic_id);
  const ph       = topicIds.map(() => '?').join(',');
  const existing = await executeQuery(
    `SELECT topic_id FROM topics WHERE topic_id IN (${ph}) AND subject_id = ?`,
    [...topicIds, subjectId]
  );
  if (existing.length !== topicIds.length) {
    throw new AppError('One or more topic IDs do not belong to this subject.', 400);
  }

  await withTransaction(async (conn) => {
    for (const { topic_id, display_order } of order) {
      await conn.execute(
        'UPDATE topics SET display_order = ? WHERE topic_id = ?',
        [display_order, topic_id]
      );
    }
  });

  return successResponse(res, {}, 'Topics reordered.');
});

// ─── EXPORT TOPIC ─────────────────────────────────────────────────────────────
export const exportTopic = catchAsync(async (req, res) => {
  const { topicId, subjectId }     = req.params;
  const { type = 'core' } = req.query;

  const topics = await executeQuery(
    'SELECT topic_id, topic_name FROM topics WHERE topic_id = ? AND subject_id = ?', [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found.', 404);

  const buffer = type === 'attempts'
    ? await buildTopicAttemptsExport(topicId)
    : await buildTopicCoreExport(topicId);

  const filename = `topic_${topics[0].topic_name.replace(/\s+/g, '_')}_${type}_${Date.now()}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

// ─── DELETE TOPIC ─────────────────────────────────────────────────────────────
export const deleteTopic = catchAsync(async (req, res) => {
  const { subjectId, topicId } = req.params;

  const topics = await executeQuery(
    'SELECT topic_id, topic_name FROM topics WHERE topic_id = ? AND subject_id = ?',
    [topicId, subjectId]
  );
  if (!topics.length) throw new AppError('Topic not found.', 404);

  const topic = topics[0];

  // Step 1: Export both types (capture buffers for email attachment)
  const [coreBuffer, attemptsBuffer] = await Promise.all([
    buildTopicCoreExport(topicId),
    buildTopicAttemptsExport(topicId),
  ]);

  // Step 2: Delete topic and cascade to sets and attempts, while adjusting question usage_count
  await withTransaction(async (conn) => {
    // Handle question usage_count
    const [qRows] = await conn.execute(
      `SELECT DISTINCT psq.question_id
      FROM practice_set_questions psq
      JOIN practice_sets ps ON psq.set_id = ps.set_id
      WHERE ps.topic_id = ?`,
      [topicId]
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
        `DELETE FROM questions WHERE question_id IN (${ph}) AND usage_count = 1`, qIds
      );
      await conn.execute(
        `UPDATE questions SET usage_count = usage_count - 1
        WHERE question_id IN (${ph}) AND usage_count > 1`, qIds
      );
      if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
    }

    await conn.execute('DELETE FROM topics WHERE topic_id = ?', [topicId]);
    await conn.execute(
      'UPDATE subjects SET topics_count = GREATEST(topics_count - 1, 0) WHERE subject_id = ?',
      [subjectId]
    );

    // Safe-ordering: rewrite display_order for the remaining topics in this
    // subject so the sequence stays 1..N (no holes from the deleted row).
    await conn.execute('SET @r := 0');
    await conn.execute(
      `UPDATE topics SET display_order = (@r := @r + 1)
       WHERE subject_id = ?
       ORDER BY display_order ASC, topic_id ASC`,
      [subjectId]
    );
  });

  const subjects = await executeQuery(
    'SELECT subject_name FROM subjects WHERE subject_id = ?', [subjectId]
  );

  await invalidateSubjectCacheForAll();

  sendTopicDeletedMail(subjectId, subjects[0]?.subject_name, topic.topic_name, coreBuffer, attemptsBuffer)
    .catch(err => logger.error('Topic delete mail failed', { err: err.message }));

  logger.info('Topic deleted', { topicId, subjectId, deletedBy: req.user.userId });
  return successResponse(res, {}, 'Topic exported and deleted.');
});