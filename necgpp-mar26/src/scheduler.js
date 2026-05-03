// src/scheduler.js
import { deleteImgBBImages } from './utils/imgbb.js';

import cron  from 'node-cron';
import XLSX  from 'xlsx';

import { withTransaction, pool } from './config/db.js';
import { _submitAttempt }                      from './controllers/test.controller.js';
import { rebuildAllLeaderboards }              from './controllers/progress.controller.js';
import * as emailService                       from './services/email.service.js';
import logger                                  from './utils/logger.js';


async function evaluateEndedTests() {
  // Find ALL tests that ended but haven't been processed yet
  // Regardless of whether InProgress attempts exist
  const [endedTests] = await pool.query(
    `SELECT DISTINCT t.test_id, t.test_name, t.created_by,
            u.email AS creator_email, u.full_name AS creator_name,
            t.total_marks, t.total_questions, t.start_time, t.end_time,
            t.duration_minutes, t.negative_marking
     FROM   tests t
     JOIN   users u ON t.created_by = u.user_id
     WHERE  TIMESTAMPADD(MINUTE, 5, t.end_time) <= NOW()
       AND  t.test_ended = 0`

  );

  if (!endedTests.length) return;

  for (const test of endedTests) {
    try {
      await processEndedTest(test);
    } catch (err) {
      logger.error('Scheduler: failed processing test', { testId: test.test_id, err: err.message });
    }
  }
}

async function processEndedTest(test) {
  logger.info('Scheduler: processing ended test', { testId: test.test_id });

  // Mark test_ended = 1 immediately — prevents re-processing if scheduler
  // runs again before deletion completes
  await pool.query(
    'UPDATE tests SET test_ended = 1 WHERE test_id = ?', [test.test_id]
  );

  // 1. Evaluate all attempts that haven't been scored yet (InProgress or Submitted)
  const [unprocessedAttempts] = await pool.query(
    `SELECT sta.* FROM student_test_attempts sta
     LEFT JOIN student_test_attempt_result star ON sta.attempt_id = star.attempt_id
     WHERE sta.test_id = ? AND star.attempt_id IS NULL`,
    [test.test_id]
  );

  for (const attempt of unprocessedAttempts) {
    try {
      await withTransaction(async (conn) => {
        await _submitAttempt(conn, attempt, attempt.student_id, test.negative_marking);
      });
    } catch (err) {
      logger.error('Scheduler: failed evaluating attempt', {
        attemptId: attempt.attempt_id, err: err.message
      });
    }
  }

  logger.info('Scheduler: evaluated all attempts', {
    test_id: test.test_id, count: unprocessedAttempts.length
  });

  // 2. Fetch full results — all submitted attempts (including pre-submitted ones)
  const [results] = await pool.query(
    `SELECT u.full_name, u.email, s.reg_num,
            s.batch_year, d.dept_name, d.dept_code,
            star.score        AS total_score,
            star.correct_count, star.wrong_count,
            sta.attempt_count, sta.status
     FROM   student_test_attempts sta
     JOIN   student_test_attempt_result star ON star.attempt_id = sta.attempt_id
     JOIN   users       u ON sta.student_id = u.user_id
     JOIN   students    s ON sta.student_id = s.student_id
     JOIN   departments d ON s.dept_id      = d.dept_id
     WHERE  sta.test_id = ?
     ORDER  BY s.reg_num ASC`,
    [test.test_id]
  );

  // 3. Fetch participation details
  const [assignments] = await pool.query(
    `SELECT ta.academic_year, ta.dept_id, d.dept_name, d.dept_code, u.email AS head_email
     FROM test_assignment ta
     JOIN departments d ON ta.dept_id = d.dept_id
     LEFT JOIN users u ON d.head_user_id = u.user_id
     WHERE ta.test_id = ?`,
    [test.test_id]
  );

  // 4. Build Excel + email — even if no attempts (send empty report)
  const wb       = buildTestResultWorkbook(test, results, assignments);
  const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${test.test_name.replace(/\s+/g, '_')}_results_${Date.now()}.xlsx`;

  const [adminRows] = await pool.query(`SELECT email FROM users WHERE role = 'Admin'`);
  const adminEmails = adminRows.map(r => r.email);
  const headEmails  = assignments.map(a => a.head_email);
  const toList      = [...new Set([test.creator_email, ...adminEmails, ...headEmails])].filter(Boolean);

  emailService.sendTestReportMail(test, results, toList, [{
    filename,
    content:     buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }]).catch(err =>
    logger.error('Scheduler: failed emailing results', { testId: test.test_id, err: err.message })
  );

  logger.info('Scheduler: result email queued', { testId: test.test_id });

  // 5. Delete the test — question cleanup + cascade
  await withTransaction(async (conn) => {
    const [tqs] = await conn.execute(
      'SELECT question_id FROM test_questions WHERE test_id = ?', [test.test_id]
    );
    const qIds = tqs.map(r => r.question_id);

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
         WHERE  question_id IN (${ph}) AND usage_count > 1`, qIds
      );
      if (imgRows.length) deleteImgBBImages(imgRows.map(r => r.question_image_delete_url));
    }

    await conn.execute('DELETE FROM tests WHERE test_id = ?', [test.test_id]);
  });

  logger.info('Scheduler: test deleted', { testId: test.test_id, name: test.test_name });
}

// ─── Excel builder ────────────────────────────────────────────────────────────
function buildTestResultWorkbook(test, results, assignments) {
  const wb = XLSX.utils.book_new();

  const infoRows = [
    ['Test Name',       test.test_name],
    ['Created By',      test.creator_name],
    ['Total Marks',     test.total_marks],
    ['Total Questions', test.total_questions],
    ['Start Time',      test.start_time],
    ['End Time',        test.end_time],
    ['Duration (min)',  test.duration_minutes],
    [],
    ['Participation'],
    ['Batch Year', 'Dept Name', 'Dept Code'],
    ...assignments.map(a => [a.academic_year, a.dept_name, a.dept_code]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Test Info');

  const headers = [
    'Reg Num', 'Student Name', 'Email', 'Dept', 'Batch Year',
    'Score', 'Total Marks', 'Correct', 'Wrong', 'Attempts', 'Status',
  ];
  const dataRows = results.map((r, i) => [
    r.reg_num, r.full_name, r.email, r.dept_code, r.batch_year,
    Number(r.total_score), test.total_marks,
    r.correct_count, r.wrong_count, r.attempt_count, r.status,
  ]);
  const sheet2 = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  sheet2['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet2, 'Results');

  return wb;
}



// ═══════════════════════════════════════════════════════════════════════════════
// Register jobs
// ═══════════════════════════════════════════════════════════════════════════════

let evaluateTask;
let leaderboardTask;

export function startScheduler() {
  evaluateTask = cron.schedule('* * * * *', () => {
    evaluateEndedTests().catch(err =>
      logger.error('Scheduler: unhandled error in evaluateEndedTests', { err: err.message })
    );
  });

  // Sharp 12:00 AM: Rebuild all leaderboards
  leaderboardTask = cron.schedule('0 0 * * *', () => {
    rebuildAllLeaderboards().catch(err =>
      logger.error('Scheduler: failed midnight leaderboard rebuild', { err: err.message })
    );
  });

  logger.info('Scheduler started: evaluateEndedTests (min), Leaderboards (00:00)');
}

export function stopScheduler() {
  evaluateTask?.stop();
  leaderboardTask?.stop();
  evaluateTask = undefined;
  leaderboardTask = undefined;
  logger.info('Scheduler stopped.');
}