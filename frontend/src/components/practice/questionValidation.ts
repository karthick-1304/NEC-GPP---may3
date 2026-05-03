import type { QuestionDraft, QuestionFieldErrors } from './QuestionEditor';
import type { QuestionInput } from '@/lib/api/sets';

const MCQ_RE = /^[a-d]$/;
const MSQ_RE = /^(?=.)a?b?c?d?$/;
const NAT_RE = /^-?\d+(\.\d{1,4})?$/;

/** Returns errors for a single question. Empty object = valid. */
export const validateQuestion = (q: QuestionDraft): QuestionFieldErrors => {
  const e: QuestionFieldErrors = {};

  if (!q.question_text.trim()) e.question_text = 'Question text is required.';
  else if (q.question_text.length > 5000) e.question_text = 'Max 5000 characters.';

  if (q.question_type !== 'NAT') {
    (['option_a', 'option_b', 'option_c', 'option_d'] as const).forEach(k => {
      const v = (q[k] ?? '').trim();
      if (!v) e[k] = `Option ${k.slice(-1).toUpperCase()} is required.`;
      else if (v.length > 2000) e[k] = 'Max 2000 characters.';
    });
  }

  const ca = (q.correct_answer ?? '').toLowerCase();
  if (q.question_type === 'MCQ') {
    if (!MCQ_RE.test(ca)) e.correct_answer = 'Pick one correct option.';
  } else if (q.question_type === 'MSQ') {
    if (!MSQ_RE.test(ca) || ca.length === 0) e.correct_answer = 'Select at least one correct option.';
  } else { // NAT
    if (!NAT_RE.test(q.correct_answer.trim()))
      e.correct_answer = 'Enter a numeric value (up to 4 decimal places).';
  }

  if (q.marks !== 1 && q.marks !== 2) e.marks = 'Marks must be 1 or 2.';

  return e;
};

/** Validates the whole list. Returns map of index → errors. */
export const validateAll = (qs: QuestionDraft[]): Map<number, QuestionFieldErrors> => {
  const m = new Map<number, QuestionFieldErrors>();
  qs.forEach((q, i) => {
    const e = validateQuestion(q);
    if (Object.keys(e).length) m.set(i, e);
  });
  return m;
};

/** Converts drafts to API payload. NAT removes options to match Joi schema. */
export const toApiQuestions = (qs: QuestionDraft[]): QuestionInput[] => qs.map(q => {
  if (q.question_type === 'NAT') {
    return {
      question_type: 'NAT',
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer.trim(),
      marks: q.marks,
      question_image_url: q.question_image_url ?? null,
      question_image_thumb_url: q.question_image_thumb_url ?? null,
      question_image_delete_url: q.question_image_delete_url ?? null,
    };
  }
  return {
    question_type: q.question_type,
    question_text: q.question_text.trim(),
    option_a: q.option_a.trim(),
    option_b: q.option_b.trim(),
    option_c: q.option_c.trim(),
    option_d: q.option_d.trim(),
    correct_answer: q.correct_answer.toLowerCase(),
    marks: q.marks,
    question_image_url: q.question_image_url ?? null,
    question_image_thumb_url: q.question_image_thumb_url ?? null,
    question_image_delete_url: q.question_image_delete_url ?? null,
  };
});

/** Maps an API question back to a draft with a fresh _key. */
export const fromApiQuestion = (q: QuestionInput): QuestionDraft => ({
  _key: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `q-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  question_type: q.question_type,
  question_text: q.question_text,
  option_a: q.option_a ?? '',
  option_b: q.option_b ?? '',
  option_c: q.option_c ?? '',
  option_d: q.option_d ?? '',
  correct_answer: q.correct_answer,
  marks: q.marks,
  question_image_url: q.question_image_url ?? null,
  question_image_thumb_url: q.question_image_thumb_url ?? null,
  question_image_delete_url: q.question_image_delete_url ?? null,
});
