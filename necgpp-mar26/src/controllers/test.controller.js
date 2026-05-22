// src/controllers/test.controller.js
import { deleteImgBBImages } from '../utils/imgbb.js';

import { executeQuery, withTransaction } from '../config/db.js';
import { AppError } from '../utils/appError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import { scoreAttempt } from '../services/scoring.service.js';
import { parseQuestionsExcel } from '../services/questionParse.service.js';
import * as emailService from '../services/email.service.js';
import logger from '../utils/logger.js';

const MAX_TEST_ATTEMPTS = parseInt(process.env.MAX_TEST_ATTEMPTS) || 3;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LIST TESTS ───────────────────────────────────────────────────────────────
// Returns upcoming and ongoing tests visible to the requesting user.
// Students: only tests assigned to their dept+batch_year
// Staff/Dept Head: all tests, with indicator if their dept is in participation
// Admin: all tests

export const listTests = catchAsync(async (req, res) => {
  const { role, userId, deptId } = req.user;
  const search = req.query.search || '';
  const searchCondition = search ? 'AND t.test_name LIKE ?' : '';
  const searchParams = search ? [`%${search}%`] : [];

  let tests;

  if (role === 'Student') {
    // Get student's batch_year
    const students = await executeQuery(
      'SELECT batch_year, dept_id FROM students WHERE student_id = ?', [userId]
    );
    if (!students.length) throw new AppError('Student record not found.', 404);
    const { batch_year } = students[0];

    tests = await executeQuery(
      `SELECT t.test_id, t.test_name, t.total_marks, t.total_questions,
              t.start_time, t.end_time, t.duration_minutes, t.negative_marking, t.created_by,
              CASE
                WHEN NOW() BETWEEN t.start_time AND t.end_time THEN 'ongoing'
                WHEN NOW() < t.start_time THEN 'upcoming'
                ELSE 'ended'
              END AS status,
              sta.status AS attempt_status,
              sta.attempt_count,
              CASE 
                WHEN sta.attempt_start_time IS NOT NULL THEN 
                  GREATEST(0, (t.duration_minutes * 60) - TIMESTAMPDIFF(SECOND, sta.attempt_start_time, NOW()))
                ELSE t.duration_minutes * 60
              END AS time_remaining_sec,
              CASE
                -- If test ended OR student submitted OR student reached max attempts OR attempt time is zero
                WHEN NOW() > t.end_time OR sta.status = 'Submitted' OR sta.attempt_count >= ? OR 
                     (sta.attempt_start_time IS NOT NULL AND (t.duration_minutes * 60) <= TIMESTAMPDIFF(SECOND, sta.attempt_start_time, NOW()))
                  THEN 'Finished'
                WHEN sta.attempt_count IS NULL OR sta.attempt_count = 0 
                  THEN 'Start Test'
                ELSE 'Resume Test'
              END AS attempt_ui_label
       FROM tests t
       JOIN test_assignment ta ON ta.test_id = t.test_id
       LEFT JOIN student_test_attempts sta
              ON sta.test_id = t.test_id AND sta.student_id = ?
       WHERE ta.dept_id = ? AND ta.academic_year = ?
         AND t.end_time >= NOW()
         ${searchCondition}
       ORDER BY t.start_time ASC`,
      [MAX_TEST_ATTEMPTS, userId, deptId, batch_year, ...searchParams]
    );

  } else {
    // Staff, Dept Head, Admin — see all tests
    // Creator dept resolves via:
    //   - staffs.dept_id   (when creator is Staff)
    //   - departments.head_user_id (when creator is Dept Head — no staffs row)
    //   - NULL when creator is Admin
    tests = await executeQuery(
      `SELECT t.test_id, t.test_name, t.total_marks, t.total_questions,
              t.start_time, t.end_time, t.duration_minutes, t.negative_marking,
              t.created_by,
              u.role  AS creator_role,
              COALESCE(ds.dept_code, dh.dept_code) AS creator_dept_code,
              CASE
                WHEN NOW() BETWEEN t.start_time AND t.end_time THEN 'ongoing'
                WHEN NOW() < t.start_time THEN 'upcoming'
                ELSE 'ended'
              END AS status
       FROM tests t
       LEFT JOIN users u           ON t.created_by = u.user_id
       LEFT JOIN staffs st         ON u.user_id    = st.staff_id
       LEFT JOIN departments ds    ON st.dept_id   = ds.dept_id
       LEFT JOIN departments dh    ON dh.head_user_id = u.user_id
       WHERE 1=1
         ${searchCondition}
       ORDER BY t.start_time ASC`,
      [...searchParams]
    );

    // Add dept participation indicator for Staff/Dept Head
    if (deptId && (role === 'Staff' || role === 'Dept Head')) {
      const participatingTestIds = await executeQuery(
        'SELECT test_id FROM test_assignment WHERE dept_id = ?', [deptId]
      );
      const participatingSet = new Set(participatingTestIds.map(r => r.test_id));
      tests = tests.map(t => ({ ...t, dept_participating: participatingSet.has(t.test_id) }));
    }
  }

  return successResponse(res, { tests, total: tests.length }, 'Tests fetched.');
});

// ─── GET TEST PARTICIPATION ────────────────────────────────────────────────────
export const getTestParticipation = catchAsync(async (req, res) => {
  const { testId } = req.params;

  const assignments = await executeQuery(
    `SELECT ta.academic_year, d.dept_id, d.dept_name, d.dept_code
     FROM test_assignment ta
     JOIN departments d ON ta.dept_id = d.dept_id
     WHERE ta.test_id = ?
     ORDER BY ta.academic_year, d.dept_name`,
    [testId]
  );

  return successResponse(res, { assignments }, 'Participation fetched.');
});

// ─── GET TEST DETAILS (For Admin/Creator Editing) ──────────────────────────────
export const getTestForAdmin = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { userId, role } = req.user;

  const tests = await executeQuery(
    `SELECT test_id, test_name, start_time, end_time, duration_minutes,
            negative_marking, is_intelli_pick, created_by
     FROM tests WHERE test_id = ?`,
    [testId]
  );
  if (!tests.length) throw new AppError('Test not found.', 404);

  const test = tests[0];
  if (role !== 'Admin' && test.created_by !== userId) {
    throw new AppError('Access denied. Only test creator or Admin can view these details.', 403);
  }

  // Fetch Assignments
  const assignments = await executeQuery(
    `SELECT dept_id, academic_year FROM test_assignment WHERE test_id = ?`,
    [testId]
  );

  // Fetch Questions
  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url, q.question_image_delete_url
     FROM test_questions tq
     JOIN questions q ON tq.question_id = q.question_id
     WHERE tq.test_id = ?`,
    [testId]
  );

  return successResponse(res, { test, assignments, questions }, 'Test details fetched for editing.');
});

// ─── CREATE TEST ──────────────────────────────────────────────────────────────
export const createTest = catchAsync(async (req, res) => {
  const {
    test_name, start_time, end_time, duration_minutes,
    assignments, questions, intelli_pick, intelli_config, negative_marking = true
  } = req.body;
  const { userId } = req.user;

  // Resolve final questions list
  let finalQuestions = [];

  if (intelli_pick) {
    finalQuestions = await _intelliPickQuestions(intelli_config);
  } else {
    finalQuestions = questions;
  }

  if (!finalQuestions.length) {
    throw new AppError('No questions available for the selected configuration.', 400);
  }

  const totalQuestions = finalQuestions.length;
  const totalMarks = finalQuestions.reduce((sum, q) => sum + q.marks, 0);

  if (totalMarks <= 0) {
    throw new AppError('Total test marks must be greater than 0.', 400);
  }

  let newTestId;

  await withTransaction(async (conn) => {
    const [testResult] = await conn.execute(
      `INSERT INTO tests (test_name, created_by, total_marks, total_questions,
                          start_time, end_time, duration_minutes,is_intelli_pick, negative_marking)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [test_name, userId, totalMarks, totalQuestions, start_time, end_time, duration_minutes, intelli_pick ? 1 : 0, negative_marking ? 1 : 0]
    );
    newTestId = testResult.insertId;

    if (intelli_pick) {
      // ── Intelli-pick: all questions already exist ──────────────────────────
      const qIds = finalQuestions.map(q => q.question_id);
      const ph = qIds.map(() => '?').join(',');

      // Batch increment usage_count
      await conn.execute(
        `UPDATE questions SET usage_count = usage_count + 1 WHERE question_id IN (${ph})`,
        qIds
      );

      // Batch insert test_questions
      const tqPh = qIds.map(() => '(?, ?)').join(',');
      const tqValues = qIds.flatMap(id => [newTestId, id]);
      await conn.execute(
        `INSERT INTO test_questions (test_id, question_id) VALUES ${tqPh}`,
        tqValues
      );

    } else {
      // ── Make-questions: insert all questions first, then link ──────────────
      const qPh = finalQuestions.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
      const qValues = finalQuestions.flatMap(q => [
        q.question_type, q.question_text,
        q.option_a ?? null, q.option_b ?? null, q.option_c ?? null, q.option_d ?? null,
        q.correct_answer, q.marks,
        q.question_image_url ?? null, q.question_image_thumb_url ?? null, q.question_image_delete_url ?? null,
        userId, userId,
      ]);

      const [qInsert] = await conn.execute(
        `INSERT INTO questions
          (question_type, question_text,
           option_a, option_b, option_c, option_d,
           correct_answer, marks,
           question_image_url, question_image_thumb_url, question_image_delete_url,
           created_by, updated_by, usage_count)
        VALUES ${qPh}`,
        qValues
      );

      // Build question IDs from insertId + affectedRows
      // MySQL batch insert: insertId = first row's ID, subsequent IDs are consecutive
      const firstId = qInsert.insertId;
      const questionIds = Array.from({ length: finalQuestions.length }, (_, i) => firstId + i);

      // Batch insert test_questions
      const tqPh = questionIds.map(() => '(?, ?)').join(',');
      const tqValues = questionIds.flatMap(id => [newTestId, id]);
      await conn.execute(
        `INSERT INTO test_questions (test_id, question_id) VALUES ${tqPh}`,
        tqValues
      );
    }

    // Batch insert assignments
    if (assignments.length) {
      const ph = assignments.map(() => '(?, ?, ?)').join(',');
      const values = assignments.flatMap(({ dept_id, academic_year }) => [newTestId, academic_year, dept_id]);
      await conn.execute(
        `INSERT INTO test_assignment (test_id, academic_year, dept_id) VALUES ${ph}`,
        values
      );
    }
  });

  logger.info('Test created', { testId: newTestId, test_name, userId });

  // ── Send Notification Emails ──────────────────────────────────────────────
  emailService.sendTestCreatedMail(
    { test_id: newTestId, test_name, start_time, duration_minutes },
    assignments.map(a => a.dept_id)
  ).catch(err => logger.error('Test created notification failed', { err: err.message }));

  return successResponse(res, { test_id: newTestId }, 'Test created.', 201);
});




// ─── _intelliPickQuestions ────────────────────────────────────────────────────
// Internal helper. Returns array of question objects (with IDs for existing ones).
const _intelliPickQuestions = async ({ subject_id, level, topics }) => {
  // Verify all topics belong to subject in one query
  const topicIds = topics.map(t => t.topic_id);
  const ph = topicIds.map(() => '?').join(',');
  const validTopics = await executeQuery(
    `SELECT topic_id FROM topics WHERE topic_id IN (${ph}) AND subject_id = ?`,
    [...topicIds, subject_id]
  );
  const validIds = new Set(validTopics.map(r => r.topic_id));

  // Filter to only valid topics, then fetch all in parallel
  const validConfigs = topics.filter(t => validIds.has(t.topic_id));

  const results = await Promise.all(
    validConfigs.map(({ topic_id, count }) =>
      executeQuery(
        `SELECT q.question_id, q.question_type, q.question_text,
                q.option_a, q.option_b, q.option_c, q.option_d,
                q.correct_answer, q.marks,
                q.question_image_url, q.question_image_thumb_url
         FROM practice_set_questions psq
         JOIN questions     q  ON psq.question_id = q.question_id
         JOIN practice_sets ps ON psq.set_id      = ps.set_id
         WHERE ps.topic_id = ? AND ps.level = ?
         ORDER BY RAND()
         LIMIT ?`,
        [topic_id, level, count]
      )
    )
  );

  // Dedupe by question_id — the same question can appear in multiple topics'
  // sets, and test_questions has PRIMARY KEY (test_id, question_id).
  const seen = new Set();
  const deduped = [];
  for (const q of results.flat()) {
    if (seen.has(q.question_id)) continue;
    seen.add(q.question_id);
    deduped.push(q);
  }
  return deduped;
};

// ─── UPDATE TEST ──────────────────────────────────────────────────────────────

export const updateTest = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { test_name, start_time, end_time, duration_minutes, negative_marking, assignments, remove_assignments, questions } = req.body;
  const { userId, role } = req.user;

  const tests = await executeQuery(
    'SELECT test_id, created_by, is_intelli_pick, start_time, end_time, duration_minutes, negative_marking, test_name FROM tests WHERE test_id = ?', [testId]
  );
  if (!tests.length) throw new AppError('Test not found.', 404);

  const test = tests[0];
  if (test.created_by !== userId && role !== 'Admin') {
    throw new AppError('Only the test creator or Admin can edit this test.', 403);
  }

  // Pre-compute once — every started-state check below uses this single
  // source of truth so we can't get a half-locked, half-editable result
  // from race-condition reads inside the transaction.
  const startedAlready = new Date(test.start_time) <= new Date();

  // VALIDATION: questions from make questions mode can only be changed...Dont change the questions by intelli-pick.
  if (questions !== undefined && test.is_intelli_pick) {
    throw new AppError('Individual questions cannot be edited for an Intelli-Pick test. Only test metadata and assignments can be changed.', 400);
  }

  // ── Started-state field locks ─────────────────────────────────────────────
  // Once a test starts, schedule/duration/question changes would surprise
  // students mid-attempt. Reject those field-by-field with precise messages
  // so the frontend can map them back to the right input.
  if (startedAlready) {
    if (start_time !== undefined) {
      throw new AppError('Start time cannot be changed after the test has started.', 400);
    }
    if (end_time !== undefined) {
      throw new AppError('End time cannot be changed after the test has started.', 400);
    }
    if (duration_minutes !== undefined) {
      throw new AppError('Duration cannot be changed after the test has started.', 400);
    }
    if (remove_assignments !== undefined) {
      throw new AppError('Existing participation cannot be removed after the test has started. You can still add new participation.', 400);
    }
    if (questions !== undefined) {
      throw new AppError('Questions cannot be edited after the test has started.', 400);
    }
  }

  await withTransaction(async (conn) => {
    // Update test meta
    const updates = [];
    const params = [];
    if (test_name !== undefined) { updates.push('test_name = ?'); params.push(test_name); }
    if (start_time !== undefined) { updates.push('start_time = ?'); params.push(start_time); }
    if (end_time !== undefined) { updates.push('end_time = ?'); params.push(end_time); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (negative_marking !== undefined) { updates.push('negative_marking = ?'); params.push(negative_marking ? 1 : 0); }

    if (updates.length) {
      params.push(testId);
      await conn.execute(`UPDATE tests SET ${updates.join(', ')} WHERE test_id = ?`, params);
    }

    // Assignments: add new ones. Existing rows are kept untouched via INSERT IGNORE.
    if (assignments !== undefined) {
      if (assignments.length) {
        const ph = assignments.map(() => '(?, ?, ?)').join(',');
        const values = assignments.flatMap(({ dept_id, academic_year }) => [testId, academic_year, dept_id]);
        await conn.execute(
          `INSERT IGNORE INTO test_assignment (test_id, academic_year, dept_id) VALUES ${ph}`, values
        );
      }
    }

    // Remove-assignments: deletes specific (dept × batch) rows. Only reachable
    // when test hasn't started (guarded above). Empty-or-not: per-pair DELETE.
    if (remove_assignments !== undefined && remove_assignments.length) {
      // One DELETE per pair keeps the query plan simple and lets MySQL skip
      // non-existent rows silently. For tests with many pairs this is still
      // fast — `test_assignment` is indexed on (test_id, dept_id, academic_year).
      for (const { dept_id, academic_year } of remove_assignments) {
        await conn.execute(
          'DELETE FROM test_assignment WHERE test_id = ? AND dept_id = ? AND academic_year = ?',
          [testId, dept_id, academic_year],
        );
      }
    }

    if (questions !== undefined) {
      // Started-state guard already rejected this case above — we only get
      // here when the test hasn't started yet. Safe to proceed directly to
      // the cleanup/replace.
      // Cleanup old questions
      const [existingLinks] = await conn.execute(
        'SELECT question_id FROM test_questions WHERE test_id = ?', [testId]
      );
      const existingIds = existingLinks.map(r => r.question_id);
      if (existingIds.length) {
        const ph = existingIds.map(() => '?').join(',');
        // Collect delete URLs before permanent removal
        const [imgRows] = await conn.execute(
          `SELECT question_image_delete_url FROM questions
           WHERE question_id IN (${ph}) AND usage_count = 1
             AND question_image_delete_url IS NOT NULL`,
          existingIds
        );
        await conn.execute(
          `DELETE FROM questions WHERE question_id IN (${ph}) AND usage_count = 1`, existingIds
        );
        await conn.execute(
          `UPDATE questions SET usage_count = usage_count - 1
           WHERE question_id IN (${ph}) AND usage_count > 1`, existingIds
        );
        if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
      }
      await conn.execute('DELETE FROM test_questions WHERE test_id = ?', [testId]);

      // Batch insert new questions (new schema — no option_*_img columns)
      const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      const qPh = questions.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
      const qValues = questions.flatMap(q => [
        q.question_type, q.question_text,
        q.option_a ?? null, q.option_b ?? null, q.option_c ?? null, q.option_d ?? null,
        q.correct_answer, q.marks,
        q.question_image_url ?? null, q.question_image_thumb_url ?? null, q.question_image_delete_url ?? null,
        userId, userId,
      ]);
      const [qInsert] = await conn.execute(
        `INSERT INTO questions
           (question_type, question_text,
            option_a, option_b, option_c, option_d,
            correct_answer, marks,
            question_image_url, question_image_thumb_url, question_image_delete_url,
            created_by, updated_by, usage_count)
         VALUES ${qPh}`, qValues
      );

      const firstId = qInsert.insertId;
      const questionIds = Array.from({ length: questions.length }, (_, i) => firstId + i);
      const tqPh = questionIds.map(() => '(?, ?)').join(',');
      const tqValues = questionIds.flatMap(id => [testId, id]);
      await conn.execute(
        `INSERT INTO test_questions (test_id, question_id) VALUES ${tqPh}`, tqValues
      );

      await conn.execute(
        'UPDATE tests SET total_marks = ?, total_questions = ? WHERE test_id = ?',
        [totalMarks, questions.length, testId]
      );
    }
  });

  // ── Send Notification Emails ──────────────────────────────────────────────
  //
  // Build a per-field "old → new" change list so recipients see *what*
  // actually changed, not just a vague "schedule updated". Only fields whose
  // value really moved produce a line — so saving the form with no edits
  // sends no email at all.
  const fmtDt = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    // ISO-ish short form; recipients almost always live in IST so this is
    // their local time anyway since dates are stored as the user's local
    // wall-clock in DATETIME columns.
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const changes = [];

  if (test_name !== undefined && test_name !== test.test_name) {
    changes.push(`Test name: <strong>${test.test_name}</strong> → <strong>${test_name}</strong>`);
  }
  if (start_time !== undefined) {
    changes.push(`Start time: <strong>${fmtDt(test.start_time)}</strong> → <strong>${fmtDt(start_time)}</strong>`);
  }
  if (end_time !== undefined) {
    changes.push(`End time: <strong>${fmtDt(test.end_time)}</strong> → <strong>${fmtDt(end_time)}</strong>`);
  }
  if (duration_minutes !== undefined && Number(duration_minutes) !== Number(test.duration_minutes)) {
    changes.push(`Duration: <strong>${test.duration_minutes} min</strong> → <strong>${duration_minutes} min</strong>`);
  }
  if (negative_marking !== undefined) {
    const oldVal = test.negative_marking === 1;
    const newVal = !!negative_marking;
    if (oldVal !== newVal) {
      changes.push(`Negative marking: <strong>${oldVal ? 'enabled' : 'disabled'}</strong> → <strong>${newVal ? 'enabled' : 'disabled'}</strong>`);
    }
  }
  if (assignments !== undefined && assignments.length) {
    changes.push(`Added <strong>${assignments.length}</strong> participation pair${assignments.length === 1 ? '' : 's'}`);
  }
  if (remove_assignments !== undefined && remove_assignments.length) {
    changes.push(`Removed <strong>${remove_assignments.length}</strong> participation pair${remove_assignments.length === 1 ? '' : 's'}`);
  }
  if (questions !== undefined) {
    const newMarks = questions.reduce((s, q) => s + Number(q.marks), 0);
    changes.push(`Test questions replaced (<strong>${questions.length}</strong> questions, <strong>${newMarks}</strong> marks)`);
  }

  if (changes.length > 0) {
    // Always pass the *current* test_name (post-update if it changed,
    // otherwise the existing one) so the email subject is recognisable
    // regardless of what fields were touched.
    const currentName = test_name !== undefined ? test_name : test.test_name;
    emailService.sendTestUpdatedMail({ test_id: testId, test_name: currentName }, changes)
      .catch(err => logger.error('Test updated notification failed', { err: err.message }));
  }

  return successResponse(res, {}, 'Test updated.');
});


// ─── DELETE TEST ──────────────────────────────────────────────────────────────
export const deleteTest = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { userId, role } = req.user;

  const tests = await executeQuery(
    'SELECT test_id, test_name, created_by FROM tests WHERE test_id = ?', [testId]
  );
  if (!tests.length) throw new AppError('Test not found.', 404);

  if (tests[0].created_by !== userId && role !== 'Admin') {
    throw new AppError('Only the test creator or Admin can delete this test.', 403);
  }

  // ── Send Notification Emails ──────────────────────────────────────────────
  // Fetch assignments before they are deleted or get them from existing logic
  // Since they might be gone from DB if cascade is set, I'll fetch them before transaction ends or pass them
  // Actually, I'll fetch them BEFORE deletion
  const assignments = await executeQuery('SELECT dept_id FROM test_assignment WHERE test_id = ?', [testId]);
  const deptIds = assignments.map(a => a.dept_id);

  await withTransaction(async (conn) => {
    // ... exactly what was there ...
    const [qLinks] = await conn.execute(
      'SELECT question_id FROM test_questions WHERE test_id = ?', [testId]
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

    await conn.execute('DELETE FROM tests WHERE test_id = ?', [testId]);
  });

  if (deptIds.length) {
    emailService.sendTestDeletedMail(tests[0].test_name, deptIds)
      .catch(err => logger.error('Test deleted notification failed', { err: err.message }));
  }

  logger.info('Test deleted', { testId, deletedBy: userId });
  return successResponse(res, {}, 'Test deleted.');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST ATTEMPTING
// ═══════════════════════════════════════════════════════════════════════════════

// ─── START / RESUME ATTEMPT ───────────────────────────────────────────────────
export const startAttempt = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { userId } = req.user;

  // Verify test exists and is currently live
  const tests = await executeQuery(
    `SELECT test_id, test_name, start_time, end_time, duration_minutes, negative_marking,
            total_marks, total_questions
     FROM tests WHERE test_id = ?`,
    [testId]
  );
  if (!tests.length) throw new AppError('Test not found.', 404);

  const test = tests[0];
  const now = new Date();

  if (now < new Date(test.start_time)) throw new AppError('This test has not started yet.', 400);
  if (now > new Date(test.end_time)) throw new AppError('This test has ended.', 400);

  // Verify student is assigned to this test
  const student = await executeQuery(
    'SELECT batch_year, dept_id FROM students WHERE student_id = ?', [userId]
  );
  if (!student.length) throw new AppError('Student record not found.', 404);

  const { batch_year, dept_id } = student[0];
  const assignment = await executeQuery(
    'SELECT test_id FROM test_assignment WHERE test_id = ? AND dept_id = ? AND academic_year = ?',
    [testId, dept_id, batch_year]
  );
  if (!assignment.length) throw new AppError('You are not assigned to this test.', 403);

  // ─── START / RESUME ATTEMPT (Race-condition safe, AUTO_INCREMENT-friendly) ──
  //
  // Previous implementation used `INSERT ... ON DUPLICATE KEY UPDATE`. That
  // pattern looks atomic and elegant, but it has a subtle MySQL gotcha:
  // InnoDB reserves the next AUTO_INCREMENT value BEFORE evaluating the
  // duplicate-key check. On every "resume" call (where the row already
  // exists and only the UPDATE branch runs), an attempt_id is silently
  // burned. So a student who started+resumed twice (3 calls in total)
  // would consume IDs 82, 83, 84 — and the next student would get id 85.
  //
  // Fix: explicit SELECT-then-UPDATE-or-INSERT, wrapped in a transaction
  // with SELECT FOR UPDATE for the same race-condition safety the UPSERT
  // gave us. AUTO_INCREMENT now only advances on real INSERTs.
  let attemptId;
  let attemptCount;
  let attemptStatus;
  let attemptStartTime;
  let timeRemaining;
  let savedAnswers = [];

  await withTransaction(async (conn) => {
    const [existing] = await conn.execute(
      `SELECT attempt_id, attempt_count, status, attempt_start_time
       FROM student_test_attempts
       WHERE student_id = ? AND test_id = ?
       FOR UPDATE`,
      [userId, testId]
    );

    if (existing.length) {
      // Row exists — UPDATE in place. No AUTO_INCREMENT change.
      const cur = existing[0];
      let newCount = cur.attempt_count;

      // Mirror the original CASE behaviour exactly:
      //   - If status is Submitted, don't increment (controller will throw).
      //   - If already past MAX, don't increment further (controller throws).
      //   - Otherwise, count this as a new resume.
      if (cur.status !== 'Submitted' && cur.attempt_count <= MAX_TEST_ATTEMPTS) {
        newCount = cur.attempt_count + 1;
        await conn.execute(
          'UPDATE student_test_attempts SET attempt_count = ? WHERE attempt_id = ?',
          [newCount, cur.attempt_id]
        );
      }

      attemptId        = cur.attempt_id;
      attemptCount     = newCount;
      attemptStatus    = cur.status;
      attemptStartTime = cur.attempt_start_time;
    } else {
      // Fresh attempt — INSERT (this is the ONLY path that advances
      // AUTO_INCREMENT, so IDs stay gap-free between students).
      const [result] = await conn.execute(
        `INSERT INTO student_test_attempts (student_id, test_id, attempt_count, status, attempt_start_time)
         VALUES (?, ?, 1, 'InProgress', NOW())`,
        [userId, testId]
      );
      attemptId        = result.insertId;
      attemptCount     = 1;
      attemptStatus    = 'InProgress';
      attemptStartTime = new Date();
    }
  });

  // Synthesise the same shape the old code expected from its read-back query
  // so downstream logic doesn't need to know which branch we took above.
  const attempt = {
    attempt_id:         attemptId,
    attempt_count:      attemptCount,
    status:             attemptStatus,
    attempt_start_time: attemptStartTime,
  };

  if (attempt.status === 'Submitted') {
    throw new AppError('You have already submitted this test.', 403);
  }
  if (attemptCount > MAX_TEST_ATTEMPTS) {
    throw new AppError(`Maximum ${MAX_TEST_ATTEMPTS} attempts reached for this test.`, 403);
  }

  const elapsedSeconds = Math.floor((now - new Date(attempt.attempt_start_time)) / 1000);
  timeRemaining = (test.duration_minutes * 60) - elapsedSeconds;

  if (timeRemaining <= 0) {
    throw new AppError('Your attempt time has expired.', 403);
  }

  // Restore saved answers
  const saved = await executeQuery(
    'SELECT question_id, selected_option_or_answer AS answer FROM student_test_attempt_saving WHERE attempt_id = ?',
    [attemptId]
  );
  savedAnswers = saved;

  // Fetch questions
  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.marks, q.question_image_url, q.question_image_thumb_url
     FROM test_questions tq
     JOIN questions q ON tq.question_id = q.question_id
     WHERE tq.test_id = ?`,
    [testId]
  );

  const attemptsRemaining = MAX_TEST_ATTEMPTS - (attemptCount > MAX_TEST_ATTEMPTS ? MAX_TEST_ATTEMPTS : attemptCount);

  return successResponse(res, {
    attempt_id: attemptId,
    attempt_count: attemptCount,
    attempts_remaining: attemptsRemaining,
    time_remaining_sec: timeRemaining,
    test: {
      test_id: test.test_id,
      test_name: test.test_name,
      total_marks: test.total_marks,
      total_questions: test.total_questions,
      end_time: test.end_time,
      duration_minutes: test.duration_minutes,
    },
    questions,
    saved_answers: savedAnswers,
  }, attemptCount > 1
    ? `Resuming attempt. ${attemptsRemaining} attempt(s) remaining.`
    : 'Test started. Good luck!'
  );
});



// ─── SAVE PROGRESS ────────────────────────────────────────────────────────────
export const saveProgress = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { answers } = req.body;
  const { userId } = req.user;

  const attempts = await executeQuery(
    `SELECT sta.attempt_id, sta.status, sta.attempt_start_time, t.duration_minutes
     FROM student_test_attempts sta
     JOIN tests t ON sta.test_id = t.test_id
     WHERE sta.student_id = ? AND sta.test_id = ?`,
    [Number(userId), Number(testId)]
  );

  if (!attempts.length) {
    throw new AppError('No test session found for this test. Please start the test first.', 404);
  }

  const attempt = attempts[0];
  const now = new Date();

  // REQUIREMENT: if submitted or attempt_count>max_count || rem_time <=0: dont allow.
  if (attempt.status === 'Submitted') {
    throw new AppError('This attempt has already been submitted or has expired.', 403);
  }

  if (attempt.attempt_count > MAX_TEST_ATTEMPTS) {
    throw new AppError('You have exceeded the maximum allowed attempts.', 403);
  }

  const elapsedSeconds = Math.floor((now - new Date(attempt.attempt_start_time)) / 1000);
  const remTime = (attempt.duration_minutes * 60) - elapsedSeconds;

  if (remTime <= 0) {
    throw new AppError('Your attempt time has expired.', 403);
  }

  const attemptId = attempt.attempt_id;

  // Check test window: must have started and not yet ended
  const testWindow = await executeQuery(
    'SELECT start_time, end_time FROM tests WHERE test_id = ?', [testId]
  );

  
  if (!testWindow.length) throw new AppError('Test not found.', 404);
  if (now < new Date(testWindow[0].start_time)) throw new AppError('Test has not started yet.', 400);
  if (now > new Date(testWindow[0].end_time))   throw new AppError('Test window has ended.', 403);

  await withTransaction(async (conn) => {
    // Delete all previous saved answers for this attempt, then insert fresh
    await conn.execute(
      'DELETE FROM student_test_attempt_saving WHERE attempt_id = ?', [attemptId]
    );
    if (answers.length) {
      const ph = answers.map(() => '(?, ?, ?)').join(',');
      const values = answers.flatMap(({ question_id, answer }) => [attemptId, question_id, answer ?? null]);
      await conn.execute(
        `INSERT INTO student_test_attempt_saving (attempt_id, question_id, selected_option_or_answer)
         VALUES ${ph}`,
        values
      );
    }
  });

  return successResponse(res, {}, 'Progress saved.');
});

// ─── SUBMIT ATTEMPT (voluntary) ───────────────────────────────────────────────
// Takes answers from req.body — does NOT read from attempt_saving.
// Cleans up attempt_saving after scoring.
export const submitTestAttempt = catchAsync(async (req, res) => {
  const { testId } = req.params;
  const { userId } = req.user;
  const { answers } = req.body;

  const attempts = await executeQuery(
    `SELECT * FROM student_test_attempts
     WHERE student_id = ? AND test_id = ?`,
    [Number(userId), Number(testId)]
  );

  if (!attempts.length) {
    throw new AppError('No test session found. Please start the test first.', 404);
  }

  const attempt = attempts[0];
  if (attempt.status === 'Submitted') {
    throw new AppError('This test has already been submitted.', 400);
  }

  // REQUIREMENT: Its purpose not to evaluate the answer. 
  // Write the answers into the student_test_attempts_saving table and make status == 'submitted'.
  await withTransaction(async (conn) => {
    const attemptId = attempt.attempt_id;

    // Delete all previous saved answers for this attempt, then insert fresh
    await conn.execute(
      'DELETE FROM student_test_attempt_saving WHERE attempt_id = ?', [attemptId]
    );
    if (answers && answers.length) {
      const ph = answers.map(() => '(?, ?, ?)').join(',');
      const values = answers.flatMap(({ question_id, answer }) => [attemptId, question_id, answer ?? null]);
      await conn.execute(
        `INSERT INTO student_test_attempt_saving (attempt_id, question_id, selected_option_or_answer)
         VALUES ${ph}`,
        values
      );
    }

    // Mark submitted
    await conn.execute(
      `UPDATE student_test_attempts SET status = 'Submitted' WHERE attempt_id = ?`,
      [attemptId]
    );
  });

  return successResponse(res, {}, 'Test submitted successfully. Results will be released after the test window closes.');
});

// ─── _submitAttempt — used by scheduler only (auto-submit on test end) ────────
// Reads from attempt_saving table since student is not present to send answers.
export const _submitAttempt = async (conn, attempt, studentId, negativeMarking = true) => {
  const { attempt_id, test_id } = attempt;

  const [savedAnswers] = await conn.execute(
    'SELECT question_id, selected_option_or_answer FROM student_test_attempt_saving WHERE attempt_id = ?',
    [attempt_id]
  );

  const [questions] = await conn.execute(
    `SELECT q.question_id, q.question_type, q.correct_answer, q.marks
     FROM test_questions tq
     JOIN questions q ON tq.question_id = q.question_id
     WHERE tq.test_id = ?`,
    [test_id]
  );

  const answers = savedAnswers.map(a => ({
    question_id: a.question_id,
    answer: a.selected_option_or_answer,
  }));

  const { totalScore, correctCount, wrongCount } =
    scoreAttempt(questions, answers, Boolean(negativeMarking));

  const [testRows] = await conn.execute(
    'SELECT total_marks FROM tests WHERE test_id = ?', [test_id]
  );
  const totalMarks = testRows[0]?.total_marks ?? 0;

  await conn.execute(
    `UPDATE student_test_attempts SET status = 'Submitted' WHERE attempt_id = ?`,
    [attempt_id]
  );

  const [existingResult] = await conn.execute(
    'SELECT attempt_id FROM student_test_attempt_result WHERE attempt_id = ?',
    [attempt_id]
  );
  if (!existingResult.length) {
    await conn.execute(
      `INSERT INTO student_test_attempt_result (attempt_id, score, correct_count, wrong_count)
       VALUES (?, ?, ?, ?)`,
      [attempt_id, totalScore, correctCount, wrongCount]
    );
    await conn.execute(
      'UPDATE students SET test_score = test_score + ? WHERE student_id = ?',
      [totalScore, studentId]
    );
  }

  // Cleanup saving table after auto-submit too
  await conn.execute(
    'DELETE FROM student_test_attempt_saving WHERE attempt_id = ?',
    [attempt_id]
  );

  return {
    total_score: totalScore,
    total_marks: totalMarks,
    correct_count: correctCount,
    wrong_count: wrongCount,
    attained_percentage: totalMarks > 0
      ? parseFloat(((totalScore / totalMarks) * 100).toFixed(2))
      : 0,
  };
};

// ─── PARSE EXCEL QUESTIONS (for test creation) ────────────────────────────────
// Same parser as set.controller.parseExcelQuestions but without subject/topic context.
// Used by Make-Questions mode of /tests/new before submitting.
export const parseExcelQuestionsForTest = catchAsync(async (req, res) => {
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
