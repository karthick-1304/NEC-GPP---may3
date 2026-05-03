// src/services/export.service.js
// All Excel generation lives here.
// Controllers call a named function and receive a Buffer ready to send/attach.
// Uses xlsx (SheetJS) — already installed.

import XLSX          from 'xlsx';
import { executeQuery } from '../config/db.js';

// ─── Shared helper: subject meta row (Sheet1 for all export types) ────────────
const fetchSubjectMeta = async (subjectId) => {
  const subjects = await executeQuery(
    `SELECT s.subject_id, s.subject_name, s.created_by, s.creator,
            s.created_at, s.topics_count,
            u.full_name AS created_by_name
     FROM subjects s
     LEFT JOIN users u ON s.created_by = u.user_id
     WHERE s.subject_id = ?`,
    [subjectId]
  );

  const collaborators = await executeQuery(
    `SELECT d.dept_name, d.dept_code
     FROM subject_access_dept sad
     JOIN departments d ON sad.dept_id = d.dept_id
     WHERE sad.subject_id = ?`,
    [subjectId]
  );

  return { subject: subjects[0], collaborators };
};

// ─── Helper: build Sheet1 (subject info + collaborators) ─────────────────────
const buildSubjectSheet1 = (subject, collaborators) => {
  const rows = [
    ['Subject ID',    subject.subject_id],
    ['Subject Name',  subject.subject_name],
    ['Created By',    subject.created_by_name ?? 'Unknown'],
    ['Creator Code',  subject.creator],
    ['Created At',    subject.created_at],
    ['Topics Count',  subject.topics_count],
    [],
    ['Collaborating Departments'],
    ['Dept Name', 'Dept Code'],
    ...collaborators.map(c => [c.dept_name, c.dept_code]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
};

// ─── Helper: auto-fit column widths ──────────────────────────────────────────
const autoFitCols = (sheet, rows) => {
  if (!rows.length) return;
  const colWidths = rows[0].map((_, ci) =>
    Math.max(...rows.map(row => String(row[ci] ?? '').length), 10)
  );
  sheet['!cols'] = colWidths.map(w => ({ wch: Math.min(w + 2, 60) }));
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Subject Type 1: Core data ────────────────────────────────────────────────
export const buildSubjectCoreExport = async (subjectId) => {
  const { subject, collaborators } = await fetchSubjectMeta(subjectId);
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Subject info
  XLSX.utils.book_append_sheet(wb, buildSubjectSheet1(subject, collaborators), 'Subject Info');

  // Sheet 2 — All topics
  const topics = await executeQuery(
    `SELECT t.topic_id, t.topic_name, t.display_order,
            u.full_name AS created_by_name, t.created_at,
            SUM(ps.level = '1') AS sets_level1,
            SUM(ps.level = '2') AS sets_level2
     FROM topics t
     LEFT JOIN users u        ON t.created_by = u.user_id
     LEFT JOIN practice_sets ps ON ps.topic_id = t.topic_id
     WHERE t.subject_id = ?
     GROUP BY t.topic_id
     ORDER BY t.display_order`,
    [subjectId]
  );

  const topicHeaders = ['Topic ID', 'Topic Name', 'Display Order', 'Created By', 'Created At', 'Sets Level 1', 'Sets Level 2'];
  const topicRows    = topics.map(t => [t.topic_id, t.topic_name, t.display_order, t.created_by_name, t.created_at, t.sets_level1 ?? 0, t.sets_level2 ?? 0]);
  const sheet2       = XLSX.utils.aoa_to_sheet([topicHeaders, ...topicRows]);
  autoFitCols(sheet2, [topicHeaders, ...topicRows]);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Topics');

  // Sheet 3 — All sets
  const sets = await executeQuery(
    `SELECT ps.set_id, ps.topic_id, ps.level, ps.negative_marking,
            ps.display_order, ps.threshold_percentage, ps.total_marks,
            u.full_name AS created_by_name, ps.created_at
     FROM practice_sets ps
     LEFT JOIN users u ON ps.created_by = u.user_id
     WHERE ps.topic_id IN (SELECT topic_id FROM topics WHERE subject_id = ?)
     ORDER BY ps.topic_id, ps.level, ps.display_order`,
    [subjectId]
  );

  const setHeaders = ['Set ID', 'Topic ID', 'Level', 'Negative Marking', 'Display Order', 'Threshold %', 'Total Marks', 'Created By', 'Created At'];
  const setRows    = sets.map(s => [s.set_id, s.topic_id, s.level, s.negative_marking ? 'Yes' : 'No', s.display_order, s.threshold_percentage, s.total_marks, s.created_by_name, s.created_at]);
  const sheet3     = XLSX.utils.aoa_to_sheet([setHeaders, ...setRows]);
  autoFitCols(sheet3, [setHeaders, ...setRows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Sets');

  // Sheet 4 — All questions
  const questions = await executeQuery(
    `SELECT q.question_id, psq.set_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id IN (
       SELECT ps.set_id FROM practice_sets ps
       JOIN topics t ON ps.topic_id = t.topic_id
       WHERE t.subject_id = ?
     )
     ORDER BY psq.set_id, q.question_id`,
    [subjectId]
  );

  const qHeaders = [
    'Question ID', 'Set ID', 'Type', 'Question Text',
    'Option A', 'Option B', 'Option C', 'Option D',
    'Correct Answer', 'Marks', 'Question Image URL', 'Question Image Thumb URL'
  ];
  const qRows = questions.map(q => [
    q.question_id, q.set_id, q.question_type, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.marks, q.question_image_url ?? '', q.question_image_thumb_url ?? ''
  ]);
  const sheet4 = XLSX.utils.aoa_to_sheet([qHeaders, ...qRows]);
  autoFitCols(sheet4, [qHeaders, ...qRows]);
  XLSX.utils.book_append_sheet(wb, sheet4, 'Questions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ─── Subject Type 2: Practice attempts data ───────────────────────────────────
export const buildSubjectAttemptsExport = async (subjectId) => {
  const { subject, collaborators } = await fetchSubjectMeta(subjectId);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSubjectSheet1(subject, collaborators), 'Subject Info');

  // Sheet 2 — Practice attempts (max score per student per set)
  const attempts = await executeQuery(
    `SELECT pa.student_id, s.reg_num, u.full_name, t.topic_id, ps.level, pa.set_id,
            MAX(pa.score) AS max_score, MAX(pa.attempt_at) AS last_attempt
     FROM practice_attempts pa
     JOIN students      s  ON pa.student_id = s.student_id
     JOIN users         u  ON pa.student_id = u.user_id
     JOIN practice_sets ps ON pa.set_id  = ps.set_id
     JOIN topics        t  ON ps.topic_id = t.topic_id
     WHERE t.subject_id = ?
     GROUP BY pa.student_id, s.reg_num, u.full_name, t.topic_id, ps.level, pa.set_id
     ORDER BY t.topic_id, ps.level, pa.set_id, u.full_name`,
    [subjectId]
  );

  const aHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Topic ID', 'Level', 'Set ID', 'Max Score', 'Last Attempt'];
  const aRows    = attempts.map(a => [a.full_name, a.reg_num, a.student_id, a.topic_id, a.level, a.set_id, Number(a.max_score), a.last_attempt]);
  const sheet2   = XLSX.utils.aoa_to_sheet([aHeaders, ...aRows]);
  autoFitCols(sheet2, [aHeaders, ...aRows]);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Practice Attempts');

  // Sheet 3 — student_topic_levels for this subject
  const levels = await executeQuery(
    `SELECT stl.student_id, s.reg_num, u.full_name, stl.topic_id, stl.level, stl.updated_at
     FROM student_topic_levels stl
     JOIN students s ON stl.student_id = s.student_id
     JOIN users    u ON stl.student_id = u.user_id
     JOIN topics   t ON stl.topic_id = t.topic_id
     WHERE t.subject_id = ?
     ORDER BY u.full_name, stl.topic_id`,
    [subjectId]
  );

  const lHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Topic ID', 'Level Completed', 'Updated At'];
  const lRows    = levels.map(l => [l.full_name, l.reg_num, l.student_id, l.topic_id, l.level, l.updated_at]);
  const sheet3   = XLSX.utils.aoa_to_sheet([lHeaders, ...lRows]);
  autoFitCols(sheet3, [lHeaders, ...lRows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Level Completions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const buildTopicCoreExport = async (topicId) => {
  // Get subject info via topic
  const topics = await executeQuery(
    'SELECT topic_id, subject_id, topic_name, display_order, created_at FROM topics WHERE topic_id = ?',
    [topicId]
  );
  if (!topics.length) throw new Error('Topic not found');
  const topic = topics[0];

  const { subject, collaborators } = await fetchSubjectMeta(topic.subject_id);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSubjectSheet1(subject, collaborators), 'Subject Info');

  // Sheet 2 — This specific topic
  const t2Rows = [
    ['Topic ID', 'Topic Name', 'Display Order', 'Created At', 'Sets Level 1', 'Sets Level 2'],
  ];
  const topicSetCounts = await executeQuery(
    `SELECT SUM(level='1') AS l1, SUM(level='2') AS l2
     FROM practice_sets WHERE topic_id = ?`,
    [topicId]
  );
  t2Rows.push([topic.topic_id, topic.topic_name, topic.display_order, topic.created_at, topicSetCounts[0].l1 ?? 0, topicSetCounts[0].l2 ?? 0]);
  const sheet2 = XLSX.utils.aoa_to_sheet(t2Rows);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Topic');

  // Sheet 3 — Sets in this topic
  const sets = await executeQuery(
    `SELECT ps.set_id, ps.level, ps.negative_marking, ps.display_order,
            ps.threshold_percentage, ps.total_marks,
            u.full_name AS created_by_name, ps.created_at
     FROM practice_sets ps
     LEFT JOIN users u ON ps.created_by = u.user_id
     WHERE ps.topic_id = ?
     ORDER BY ps.level, ps.display_order`,
    [topicId]
  );
  const s3Headers = ['Set ID', 'Level', 'Negative Marking', 'Display Order', 'Threshold %', 'Total Marks', 'Created By', 'Created At'];
  const s3Rows    = sets.map(s => [s.set_id, s.level, s.negative_marking ? 'Yes' : 'No', s.display_order, s.threshold_percentage, s.total_marks, s.created_by_name, s.created_at]);
  const sheet3    = XLSX.utils.aoa_to_sheet([s3Headers, ...s3Rows]);
  autoFitCols(sheet3, [s3Headers, ...s3Rows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Sets');

  // Sheet 4 — Questions in this topic's sets
  const questions = await executeQuery(
    `SELECT q.question_id, psq.set_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id IN (SELECT set_id FROM practice_sets WHERE topic_id = ?)
     ORDER BY psq.set_id, q.question_id`,
    [topicId]
  );
  const q4Headers = [
    'Question ID', 'Set ID', 'Type', 'Question Text',
    'Option A', 'Option B', 'Option C', 'Option D',
    'Correct Answer', 'Marks', 'Question Image URL', 'Question Image Thumb URL'
  ];
  const q4Rows = questions.map(q => [
    q.question_id, q.set_id, q.question_type, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.marks, q.question_image_url ?? '', q.question_image_thumb_url ?? ''
  ]);
  const sheet4 = XLSX.utils.aoa_to_sheet([q4Headers, ...q4Rows]);
  autoFitCols(sheet4, [q4Headers, ...q4Rows]);
  XLSX.utils.book_append_sheet(wb, sheet4, 'Questions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

export const buildTopicAttemptsExport = async (topicId) => {
  const topics = await executeQuery(
    'SELECT topic_id, subject_id, topic_name FROM topics WHERE topic_id = ?',
    [topicId]
  );
  if (!topics.length) throw new Error('Topic not found');
  const topic = topics[0];

  const { subject, collaborators } = await fetchSubjectMeta(topic.subject_id);
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Subject + topic info combined
  const infoRows = [
    ['Subject ID', subject.subject_id],
    ['Subject Name', subject.subject_name],
    ['Creator', subject.creator],
    ['Created At', subject.created_at],
    ['Topics Count', subject.topics_count],
    [],
    ['Collaborating Departments'],
    ['Dept Name', 'Dept Code'],
    ...collaborators.map(c => [c.dept_name, c.dept_code]),
    [],
    ['Topic ID', topic.topic_id],
    ['Topic Name', topic.topic_name],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Subject & Topic');

  // Sheet 2 — Practice attempts for this topic only
  const attempts = await executeQuery(
    `SELECT pa.student_id, s.reg_num, u.full_name, ps.level, pa.set_id,
            MAX(pa.score) AS max_score, MAX(pa.attempt_at) AS last_attempt
     FROM practice_attempts pa
     JOIN students      s ON pa.student_id = s.student_id
     JOIN users         u ON pa.student_id = u.user_id
     JOIN practice_sets ps ON pa.set_id = ps.set_id
     WHERE ps.topic_id = ?
     GROUP BY pa.student_id, s.reg_num, u.full_name, ps.level, pa.set_id
     ORDER BY ps.level, pa.set_id, u.full_name`,
    [topicId]
  );
  const aHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Level', 'Set ID', 'Max Score', 'Last Attempt'];
  const aRows    = attempts.map(a => [a.full_name, a.reg_num, a.student_id, a.level, a.set_id, Number(a.max_score), a.last_attempt]);
  const sheet2   = XLSX.utils.aoa_to_sheet([aHeaders, ...aRows]);
  autoFitCols(sheet2, [aHeaders, ...aRows]);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Practice Attempts');

  // Sheet 3 — student_topic_levels for this topic only
  const levels = await executeQuery(
    `SELECT stl.student_id, s.reg_num, u.full_name, stl.topic_id, stl.level, stl.updated_at
     FROM student_topic_levels stl
     JOIN students s ON stl.student_id = s.student_id
     JOIN users    u ON stl.student_id = u.user_id
     WHERE stl.topic_id = ?
     ORDER BY u.full_name`,
    [topicId]
  );
  const lHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Topic ID', 'Level Completed', 'Updated At'];
  const lRows    = levels.map(l => [l.full_name, l.reg_num, l.student_id, l.topic_id, l.level, l.updated_at]);
  const sheet3   = XLSX.utils.aoa_to_sheet([lHeaders, ...lRows]);
  autoFitCols(sheet3, [lHeaders, ...lRows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Level Completions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// SET EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const buildSetCoreExport = async (setId) => {
  const sets = await executeQuery(
    `SELECT ps.set_id, ps.topic_id, ps.level, ps.negative_marking,
            ps.display_order, ps.threshold_percentage, ps.total_marks,
            ps.created_at, u.full_name AS created_by_name
     FROM practice_sets ps
     LEFT JOIN users u ON ps.created_by = u.user_id
     WHERE ps.set_id = ?`,
    [setId]
  );
  if (!sets.length) throw new Error('Set not found');
  const set = sets[0];

  const topics = await executeQuery(
    'SELECT topic_id, subject_id, topic_name, display_order, created_at FROM topics WHERE topic_id = ?',
    [set.topic_id]
  );
  const topic = topics[0];

  const { subject, collaborators } = await fetchSubjectMeta(topic.subject_id);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSubjectSheet1(subject, collaborators), 'Subject Info');

  // Sheet 2 — Topic + Set info
  const s2Rows = [
    ['Topic ID', 'Topic Name', 'Display Order', 'Created At', 'Set ID', 'Level', 'Negative Marking', 'Display Order', 'Threshold %', 'Total Marks', 'Created By', 'Set Created At'],
    [topic.topic_id, topic.topic_name, topic.display_order, topic.created_at, set.set_id, set.level, set.negative_marking ? 'Yes' : 'No', set.display_order, set.threshold_percentage, set.total_marks, set.created_by_name, set.created_at],
  ];
  const sheet2 = XLSX.utils.aoa_to_sheet(s2Rows);
  autoFitCols(sheet2, s2Rows);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Topic & Set');

  // Sheet 3 — Questions in this set
  const questions = await executeQuery(
    `SELECT q.question_id, q.question_type, q.question_text,
            q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_answer, q.marks,
            q.question_image_url, q.question_image_thumb_url
     FROM practice_set_questions psq
     JOIN questions q ON psq.question_id = q.question_id
     WHERE psq.set_id = ?
     ORDER BY q.question_id`,
    [setId]
  );
  const qHeaders = [
    'Question ID', 'Type', 'Question Text',
    'Option A', 'Option B', 'Option C', 'Option D',
    'Correct Answer', 'Marks', 'Question Image URL', 'Question Image Thumb URL'
  ];
  const qRows = questions.map(q => [
    q.question_id, q.question_type, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.marks, q.question_image_url ?? '', q.question_image_thumb_url ?? ''
  ]);
  const sheet3 = XLSX.utils.aoa_to_sheet([qHeaders, ...qRows]);
  autoFitCols(sheet3, [qHeaders, ...qRows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Questions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

export const buildSetAttemptsExport = async (setId) => {
  const sets = await executeQuery(
    `SELECT ps.set_id, ps.topic_id, ps.level, ps.negative_marking,
            ps.display_order, ps.threshold_percentage, ps.total_marks, ps.created_at
     FROM practice_sets ps WHERE ps.set_id = ?`,
    [setId]
  );
  if (!sets.length) throw new Error('Set not found');
  const set = sets[0];

  const topics = await executeQuery(
    'SELECT topic_id, subject_id, topic_name FROM topics WHERE topic_id = ?',
    [set.topic_id]
  );
  const topic = topics[0];
  const { subject, collaborators } = await fetchSubjectMeta(topic.subject_id);
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Combined subject + topic + set info
  const s1Rows = [
    ['Subject ID', subject.subject_id], ['Subject Name', subject.subject_name],
    ['Creator', subject.creator], ['Created At', subject.created_at],
    [], ['Collaborating Departments'], ['Dept Name', 'Dept Code'],
    ...collaborators.map(c => [c.dept_name, c.dept_code]),
    [], ['Topic ID', topic.topic_id], ['Topic Name', topic.topic_name],
    [], ['Set ID', set.set_id], ['Level', set.level],
    ['Negative Marking', set.negative_marking ? 'Yes' : 'No'],
    ['Threshold %', set.threshold_percentage], ['Total Marks', set.total_marks],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1Rows), 'Subject, Topic & Set');

  // Sheet 2 — Attempts for this set only
  const attempts = await executeQuery(
    `SELECT pa.student_id, s.reg_num, u.full_name, ps.topic_id, ps.level, pa.set_id,
            MAX(pa.score) AS max_score, MAX(pa.attempt_at) AS last_attempt
     FROM practice_attempts pa
     JOIN students      s ON pa.student_id = s.student_id
     JOIN users         u ON pa.student_id = u.user_id
     JOIN practice_sets ps ON pa.set_id = ps.set_id
     WHERE pa.set_id = ?
     GROUP BY pa.student_id, s.reg_num, u.full_name, ps.topic_id, ps.level, pa.set_id
     ORDER BY u.full_name`,
    [setId]
  );
  const aHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Topic ID', 'Level', 'Set ID', 'Max Score', 'Last Attempt'];
  const aRows    = attempts.map(a => [a.full_name, a.reg_num, a.student_id, a.topic_id, a.level, a.set_id, Number(a.max_score), a.last_attempt]);
  const sheet2   = XLSX.utils.aoa_to_sheet([aHeaders, ...aRows]);
  autoFitCols(sheet2, [aHeaders, ...aRows]);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Practice Attempts');

  // Sheet 3 — student_topic_levels for this topic
  const levels = await executeQuery(
    `SELECT stl.student_id, s.reg_num, u.full_name, stl.topic_id, stl.level, stl.updated_at
     FROM student_topic_levels stl
     JOIN students s ON stl.student_id = s.student_id
     JOIN users    u ON stl.student_id = u.user_id
     WHERE stl.topic_id = ?
     ORDER BY u.full_name`,
    [set.topic_id]
  );
  const lHeaders = ['Student Name', 'Reg Num', 'Student ID', 'Topic ID', 'Level Completed', 'Updated At'];
  const lRows    = levels.map(l => [l.full_name, l.reg_num, l.student_id, l.topic_id, l.level, l.updated_at]);
  const sheet3   = XLSX.utils.aoa_to_sheet([lHeaders, ...lRows]);
  autoFitCols(sheet3, [lHeaders, ...lRows]);
  XLSX.utils.book_append_sheet(wb, sheet3, 'Level Completions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};