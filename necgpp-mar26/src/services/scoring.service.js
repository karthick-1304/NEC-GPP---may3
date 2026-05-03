// src/services/scoring.service.js
// GATE exam scoring rules — the official pattern:
//
// MCQ (Multiple Choice — single correct):
//   Correct   → +marks (1 or 2)
//   Wrong     → -(marks / 3)   i.e. -1/3 for 1-mark, -2/3 for 2-mark
//   Skipped   → 0
//   Negative marking applies ONLY if the set has negative_marking = true
//
// MSQ (Multiple Select — multiple correct):
//   Correct   → +marks (always 2)
//   Wrong     → 0  (NO negative marking for MSQ — GATE rule)
//   Skipped   → 0
//   Note: For MSQ, "correct" means the answer matches EXACTLY (all selected, none extra)
//
// NAT (Numerical Answer Type):
//   Correct   → +marks (1 or 2)
//   Wrong     → 0  (NO negative marking for NAT — GATE rule)
//   Skipped   → 0
//   Tolerance: answer is correct if within ±0.0001 of the correct value (floating point)

// ─── Score a single question ──────────────────────────────────────────────────
export const scoreQuestion = (question, studentAnswer, hasNegativeMarking) => {
  const { question_type, correct_answer, marks } = question;
  // NAT answers may arrive as numbers — coerce defensively before .trim().
  const answerStr   = (studentAnswer === null || studentAnswer === undefined)
                        ? ''
                        : String(studentAnswer);
  const isAttempted = answerStr.trim() !== '';

  if (!isAttempted) return 0;

  const isCorrect = checkCorrectness(question_type, correct_answer, answerStr.trim());

  if (isCorrect) return marks;

  // Wrong answer — apply negative marking rules
  if (question_type === 'MCQ' && hasNegativeMarking) {
    return -(marks / 3);
    // GATE rule: 1/3 of marks deducted for wrong MCQ
    // 1-mark MCQ wrong → -0.3333
    // 2-mark MCQ wrong → -0.6667
  }

  // MSQ wrong → 0 (GATE rule — no negative for MSQ regardless of set setting)
  // NAT wrong → 0 (GATE rule — no negative for NAT regardless of set setting)
  return 0;
};

// ─── Check correctness per question type ─────────────────────────────────────
const checkCorrectness = (questionType, correctAnswer, studentAnswer) => {
  switch (questionType) {
    case 'MCQ':
      // Simple single letter comparison
      return studentAnswer.toLowerCase() === correctAnswer.toLowerCase();

    case 'MSQ': {
      // Frontend sends comma-separated uppercase letters: 'C,D' or 'A,B,D'
      // DB stores lowercase no-comma: 'cd' or 'abd'
      // Strip all non-alpha chars, lowercase, sort → both normalize to same string
      const sortStr = (s) => s.toLowerCase().replace(/[^a-z]/g, '').split('').sort().join('');
      return sortStr(studentAnswer) === sortStr(correctAnswer);
    }

    case 'NAT': {
      // Numeric comparison with tolerance for floating point
      const student = parseFloat(studentAnswer);
      const correct = parseFloat(correctAnswer);
      if (isNaN(student) || isNaN(correct)) return false;
      return Math.abs(student - correct) <= 0.0001;
      // GATE allows ±0.0001 tolerance on NAT answers
    }

    default:
      return false;
  }
};

// ─── Score an entire attempt (array of answered questions) ───────────────────
// Returns { totalScore, correctCount, wrongCount, perQuestion }
// perQuestion is used by the practice result page to show per-question breakdown

export const scoreAttempt = (questions, answers, hasNegativeMarking) => {
  // Build a map of question_id → student answer for O(1) lookup
  const answerMap = new Map(answers.map(a => [a.question_id, a.answer]));
  let totalScore   = 0;
  let correctCount = 0;
  let wrongCount   = 0;

  const perQuestion = questions.map(q => {
    const studentAnswer = answerMap.get(q.question_id) ?? null;
    const scoreDelta    = scoreQuestion(q, studentAnswer, hasNegativeMarking);
    const isAttempted   = studentAnswer !== null && studentAnswer !== undefined && String(studentAnswer).trim() !== '';
    const isCorrect     = isAttempted && scoreDelta > 0;
    const isWrong       = isAttempted && !isCorrect;

    totalScore += scoreDelta;
    if (isCorrect) correctCount++;
    if (isWrong)   wrongCount++;

    return {
      question_id:              q.question_id,
      question_type:            q.question_type,
      question_text:            q.question_text,
      question_image_url:       q.question_image_url       ?? null,
      question_image_thumb_url: q.question_image_thumb_url ?? null,
      option_a:      q.option_a,
      option_b:      q.option_b,
      option_c:      q.option_c,
      option_d:      q.option_d,
      correct_answer:  q.correct_answer,
      marks:           q.marks,
      student_answer:  studentAnswer,
      score_delta:     parseFloat(scoreDelta.toFixed(4)),
      is_correct:      isCorrect,
      is_attempted:    isAttempted,
    };
  });

  // totalScore can go negative — cap at 0 (GATE doesn't go below 0)
  const finalScore = Math.max(0, parseFloat(totalScore.toFixed(2)));

  return { totalScore: finalScore, correctCount, wrongCount, perQuestion };
};

// ─── Check if student passed the set ─────────────────────────────────────────
export const checkPassed = (totalScore, totalMarks, thresholdPercentage) => {
  if (totalMarks === 0) return false;
  const attainedPercentage = (totalScore / totalMarks) * 100;
  return attainedPercentage >= thresholdPercentage;
};