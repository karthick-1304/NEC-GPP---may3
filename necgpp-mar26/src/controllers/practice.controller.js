// src/controllers/practice.controller.js
import { executeQuery, withTransaction } from '../config/db.js';
import { AppError } from '../utils/appError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import { scoreAttempt, checkPassed } from '../services/scoring.service.js';

// ─── GET QUESTIONS FOR A SET ──────────────────────────────────────────────────
// Returns all questions for the set.
// Questions are shuffled to prevent pattern memorization across attempts.
// Correct answers are NOT sent — they come back only after submission.

export const getQuestions = catchAsync(async (req, res) => {
  const setId = req.setId; // attached by attachSet middleware

  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.marks, q.question_image_url, q.question_image_thumb_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id = ? ORDER BY q.question_id`,
    [setId]
  );

  // Shuffle questions — different order every attempt
  //const shuffled = questions.sort(() => Math.random() - 0.5);

  const set = req.set;

  return successResponse(res, {
    set: {
      set_id: set.set_id,
      // display_order is what students see in the listing ("Set 1", "Set 2",
      // …) — the attempt header echoes it. The internal set_id is the
      // database row's PK and shouldn't leak into the UI.
      display_order: set.display_order,
      level: set.level,
      negative_marking: Boolean(set.negative_marking),
      threshold_percentage: set.threshold_percentage,
      total_marks: set.total_marks,
      total_questions: set.total_questions,
      timer_minutes: 30, // practice sets have 30min timer
    },
    shuffled:questions,
  }, 'Questions fetched.');
});

// ─── SUBMIT PRACTICE ATTEMPT ──────────────────────────────────────────────────
// Scores the attempt.
// For Students (passed attempts only — failed attempts are NOT recorded):
//   - Stores record in practice_attempts
//   - Updates practice_score by the improvement delta over previous best
//   - Updates student_topic_levels if level is now complete
// For other roles:
//   - Scores and returns result but NO DB writes (vanishes on refresh)

export const submitAttempt = catchAsync(async (req, res) => {
  const { answers } = req.body;
  const { role, userId } = req.user;
  const set = req.set;

  // Fetch full question data (including correct answers) for scoring
  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id = ?`,
    [set.set_id]
  );

  if (!questions.length) throw new AppError('No questions found for this set.', 404);

  // Score the attempt
  const { totalScore, correctCount, wrongCount, perQuestion } =
    scoreAttempt(questions, answers, Boolean(set.negative_marking));

  const passed = checkPassed(totalScore, set.total_marks, set.threshold_percentage);
  const attainedPercentage = set.total_marks > 0
    ? parseFloat(((totalScore / set.total_marks) * 100).toFixed(2))
    : 0;

  // ── Student-only: persist results ────────────────────────────────────────
  if (role === 'Student'&& passed) {
    await withTransaction(async (conn) => {
      // Find the student's previous best score on this set (any attempt, pass or fail)
      const [prevBestRow] = await conn.execute(
        `SELECT COALESCE(MAX(score), 0) AS prev_best
         FROM practice_attempts
         WHERE student_id = ? AND set_id = ?`,
        [userId, set.set_id]
      );
      const prevBest = parseFloat(prevBestRow[0]?.prev_best ?? 0);

      // Record the (passed) attempt for history
      await conn.execute(
        `INSERT INTO practice_attempts (student_id, set_id, score)
         VALUES (?, ?, ?)`,
        [userId, set.set_id, totalScore]
      );

      // Update practice_score by the improvement delta only if curr > prev best
      // practice_score += (currScore - prevBest)  → only the NEW gain is added
      if (totalScore > prevBest) {
        const delta = parseFloat((totalScore - prevBest).toFixed(4));
        await conn.execute(
          'UPDATE students SET practice_score = practice_score + ? WHERE student_id = ?',
          [delta, userId]
        );
      }

      await _checkAndUpdateLevelCompletion(conn, userId, set.topic_id, set.level);
    });
  }


  // Build result response — includes correct answers and per-question breakdown
  return successResponse(res, {
    result: {
      total_score: totalScore,
      total_marks: set.total_marks,
      correct_count: correctCount,
      wrong_count: wrongCount,
      attained_percentage: attainedPercentage,
      threshold_percentage: set.threshold_percentage,
      passed,
    },
    ...(role !== 'Student' && { per_question: perQuestion }),
  }, passed ? 'Attempt submitted — Passed!' : 'Attempt submitted — Not passed. Try again!');
});

// ─── GET PRACTICE HISTORY ─────────────────────────────────────────────────────
// Returns all past attempts for a student on this set.
// Only for students.

export const getPracticeHistory = catchAsync(async (req, res) => {
  const { userId, role } = req.user;
  if (role !== 'Student') {
    throw new AppError('Practice history is only available for students.', 403);
  }

  const setId = req.setId;

  const attempts = await executeQuery(
    `SELECT practice_id, score, attempt_at
     FROM practice_attempts
     WHERE student_id = ? AND set_id = ?
     ORDER BY attempt_at DESC`,
    [userId, setId]
  );

  const set = req.set;

  return successResponse(res, {
    attempts,
    set: {
      total_marks: set.total_marks,
      threshold_percentage: set.threshold_percentage,
    },
  }, 'Practice history fetched.');
});

// ─── _checkAndUpdateLevelCompletion ──────────────────────────────────────────
// Internal helper — called inside a transaction after a student passes a set.
// Checks if all sets in this topic+level are now completed.
// If so, inserts/updates student_topic_levels and updates student topic/level counters.

export const _checkAndUpdateLevelCompletion = async (conn, studentId, topicId, level) => {
  // All sets in this topic+level
  const [allSets] = await conn.execute(
    'SELECT set_id, total_marks, threshold_percentage FROM practice_sets WHERE topic_id = ? AND level = ?',
    [topicId, level]
  );

  // Sets this student has passed
  const [passedSets] = await conn.execute(
    `SELECT DISTINCT pa.set_id
     FROM practice_attempts pa
     JOIN practice_sets ps ON pa.set_id = ps.set_id
     WHERE pa.student_id = ?
       AND ps.topic_id   = ?
       AND ps.level      = ?
       AND ps.total_marks > 0
       AND (pa.score / ps.total_marks * 100) >= ps.threshold_percentage`,
    [studentId, topicId, level]
  );

  const passedIds = new Set(passedSets.map(r => r.set_id));
  const allPassed = allSets.every(s => passedIds.has(s.set_id));

  if (!allPassed) return; // Not all sets done yet

  if (level === '1') {
    const [existingL1] = await conn.execute(
      `SELECT student_id FROM student_topic_levels
        WHERE student_id = ? AND topic_id = ? AND level = '1'`,
      [studentId, topicId]
    );
    if (!existingL1.length) {
      await conn.execute(
        `INSERT IGNORE INTO student_topic_levels (student_id, topic_id, level) VALUES (?, ?, ?)`,
        [studentId, topicId, level]
      );
      await conn.execute(
        'UPDATE students SET lev_1_completed = lev_1_completed + 1 WHERE student_id = ?',
        [studentId]
      );
    }
  }
  else if (level === '2') {
    // Before incrementing topics_completed, check it wasn't already counted:
    // The INSERT IGNORE above prevents duplicate student_topic_levels rows.
    // But topics_completed could still be double-incremented on race conditions.
    // Guard with a check: only increment if this level 2 entry didn't exist before.

    const [existingL2] = await conn.execute(
      `SELECT student_id FROM student_topic_levels
      WHERE student_id = ? AND topic_id = ? AND level = '2'`,
      [studentId, topicId]
    );

    if (!existingL2.length) {
      // This is a fresh level 2 completion — safe to increment
      await conn.execute(
        `INSERT IGNORE INTO student_topic_levels (student_id, topic_id, level) VALUES (?, ?, ?)`,
        [studentId, topicId, level]
      );
      await conn.execute(
        'UPDATE students SET lev_2_completed = lev_2_completed + 1 WHERE student_id = ?',
        [studentId]
      );
      // Check L1 also complete for topics_completed
      const [l1Entry] = await conn.execute(
        `SELECT student_id FROM student_topic_levels
        WHERE student_id = ? AND topic_id = ? AND level = '1'`,
        [studentId, topicId]
      );
      if (l1Entry.length) {
        await conn.execute(
          'UPDATE students SET topics_completed = topics_completed + 1 WHERE student_id = ?',
          [studentId]
        );
      }
    }
  }
};