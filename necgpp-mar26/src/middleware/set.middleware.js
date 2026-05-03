// src/middleware/set.middleware.js
// Two middleware functions:
//
// attachSet      — loads set + topic + subject, attaches to req
// checkSetAccess — gamification gate for students
//                  runs the unlock algorithm to determine which sets are accessible
//                  rejects with 403 if student tries to access a locked set

import { executeQuery } from '../config/db.js';
import { AppError }     from '../utils/appError.js';
import { catchAsync }   from '../utils/catchAsync.js';


// ─── getUnlockedSetIds ────────────────────────────────────────────────────────
// The gamification algorithm. Returns an array of set_ids the student
// is allowed to access, in display_order sequence.
//
// Algorithm (from spec):
//   Res1 = all sets in this topic+level, sorted by display_order
//   Res2 = all sets this student has PASSED in this topic+level sorted by display_order
//          (passed = score >= threshold_percentage * total_marks / 100)
//
//   Walk Res1 one by one:
//     - Add set_id to unlocked array
//     - If set_id is NOT in Res2 (not passed), STOP → return unlocked array
//
//   The last element of the unlocked array is the current "in-progress" set.
//   All before it are completed.

export const getUnlockedSetIds = async (studentId, topicId, level) => {
  // All sets in this topic+level, ordered
  const allSets = await executeQuery(
    `SELECT ps.set_id, ps.display_order, ps.total_marks, ps.total_questions,  ps.threshold_percentage
     FROM practice_sets ps
     WHERE ps.topic_id = ? AND ps.level = ?
     ORDER BY ps.display_order ASC`,
    [topicId, level]
  );

  if (!allSets.length) return [];

  // Sets this student has passed (score >= threshold)
  // A set is "passed" if ANY attempt has score >= threshold
  const passedRows = await executeQuery(
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

  const passedIds = new Set(passedRows.map(r => r.set_id));

  // Walk the algorithm
  const unlocked = [];
  for (const set of allSets) {
    unlocked.push(set.set_id);
    if (!passedIds.has(set.set_id)) {
      // This set is not yet passed — stop here
      break;
    }
  }

  return unlocked;
};

// ─── attachSet ────────────────────────────────────────────────────────────────
// Loads practice_set + topic + subject into req.
// Used on all practice routes: /api/v1/practice/:setId/*

export const attachSet = catchAsync(async (req, _res, next) => {
  const setId = req.params.setId || req.params.id;

  const sets = await executeQuery(
    `SELECT ps.set_id, ps.topic_id, ps.level, ps.negative_marking,
            ps.display_order, ps.threshold_percentage, ps.total_marks, ps.total_questions,
            t.subject_id, t.topic_name,
            s.subject_name, s.locked AS subject_locked,
            s.creator    AS subject_creator
     FROM practice_sets ps
     JOIN topics   t ON ps.topic_id  = t.topic_id
     JOIN subjects s ON t.subject_id = s.subject_id
     WHERE ps.set_id = ?`,
    [setId]
  );

  if (!sets.length) throw new AppError('Practice set not found.', 404);

  const set = sets[0];
  req.set       = set;
  req.setId     = set.set_id;
  req.topicId   = set.topic_id;
  req.subjectId = set.subject_id;

  next();
});

// ─── checkSetAccess ───────────────────────────────────────────────────────────
// Must run AFTER attachSet and protect.
// For students: runs the gamification algorithm and rejects if the set is locked.
// For other roles: passes through (they can always access any set for their subjects).

export const checkSetAccess = catchAsync(async (req, _res, next) => {
  const { role, userId } = req.user;
  const set = req.set;

  // Subject lock — only super access can proceed (handled by subject middleware)
  // Set middleware focuses on gamification lock for students

  if (role !== 'Student') return next();

  // Get level lock status from student_topic_levels
  // Level 2 is locked unless level 1 entry exists in student_topic_levels
  if (set.level === '2') {
    const l1Complete = await executeQuery(
      `SELECT student_id FROM student_topic_levels
       WHERE student_id = ? AND topic_id = ? AND level = '1'`,
      [userId, set.topic_id]
    );

    if (!l1Complete.length) {
      throw new AppError('Complete Level 1 before accessing Level 2.', 403);
    }
  }

  // Gamification: is this specific set unlocked for this student?
  const unlockedIds = await getUnlockedSetIds(userId, set.topic_id, set.level);

  if (!unlockedIds.includes(set.set_id)) {
    throw new AppError('Complete the previous set before accessing this one.', 403);
  }

  next();
});