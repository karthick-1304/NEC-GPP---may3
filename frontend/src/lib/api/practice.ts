import { api, unwrap } from './client';
import type { ApiEnvelope, AnswerInput, PracticeResult, PracticeSet, QuestionForAttempt } from '@/types/api';

export interface PracticeQuestionsResponse {
  set: Pick<PracticeSet, 'set_id' | 'display_order' | 'level' | 'threshold_percentage' | 'total_marks' | 'total_questions'> & {
    negative_marking: boolean;
    timer_minutes: number;
  };
  shuffled: QuestionForAttempt[];
}

export interface PracticeSubmitResponse {
  result: PracticeResult;
  per_question?: Array<{
    question_id: number;
    question_type: 'MCQ' | 'MSQ' | 'NAT';
    question_text: string;
    question_image_url: string | null;
    question_image_thumb_url: string | null;
    option_a: string | null;
    option_b: string | null;
    option_c: string | null;
    option_d: string | null;
    correct_answer: string;
    marks: number;
    student_answer: string | null;
    score_delta: number;
    is_correct: boolean;
    is_attempted: boolean;
  }>;
}

export interface PracticeHistoryResponse {
  attempts: Array<{ practice_id: number; score: number; attempt_at: string }>;
  set: { total_marks: number; threshold_percentage: number };
}

const base = (subjectId: number, topicId: number, setId: number) =>
  `/subjects/${subjectId}/topics/${topicId}/sets/${setId}/practice`;

export const practiceApi = {
  questions: async (subjectId: number, topicId: number, setId: number) => {
    const r = await api.get<ApiEnvelope<PracticeQuestionsResponse>>(`${base(subjectId, topicId, setId)}/questions`);
    return unwrap(r.data);
  },
  submit: async (
    subjectId: number, topicId: number, setId: number,
    answers: AnswerInput[],
  ) => {
    const r = await api.post<ApiEnvelope<PracticeSubmitResponse>>(
      `${base(subjectId, topicId, setId)}/submit`,
      { answers },
    );
    return unwrap(r.data);
  },
  history: async (subjectId: number, topicId: number, setId: number) => {
    const r = await api.get<ApiEnvelope<PracticeHistoryResponse>>(`${base(subjectId, topicId, setId)}/history`);
    return unwrap(r.data);
  },
};
