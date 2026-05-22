import { api, unwrap } from './client';
import type {
  ApiEnvelope, AnswerInput, QuestionAdmin, QuestionForAttempt, TestAssignmentRow, TestRecord,
} from '@/types/api';
import type { QuestionInput } from './sets';

export interface TestListResponse {
  tests: TestRecord[];
  total: number;
}

export interface TestForAdminResponse {
  test: TestRecord & {
    is_intelli_pick: 0 | 1;
  };
  assignments: Array<{ dept_id: number; academic_year: string }>;
  questions: QuestionAdmin[];
}

export interface IntelliConfig {
  subject_id: number;
  level: '1' | '2';
  topics: Array<{ topic_id: number; count: number }>;
}

export interface TestAttemptStartResponse {
  attempt_id: number;
  attempt_count: number;
  attempts_remaining: number;
  time_remaining_sec: number;
  test: {
    test_id: number;
    test_name: string;
    total_marks: number;
    total_questions: number;
    end_time: string;
    duration_minutes: number;
  };
  questions: QuestionForAttempt[];
  saved_answers: Array<{ question_id: number; answer: string | null }>;
}

interface CreateTestBody {
  test_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  negative_marking: boolean;
  assignments: Array<{ dept_id: number; academic_year: string }>;
  // Make-questions mode
  questions?: QuestionInput[];
  intelli_pick?: boolean;
  intelli_config?: IntelliConfig;
}

export const testsApi = {
  list: async (search?: string) => {
    const r = await api.get<ApiEnvelope<TestListResponse>>('/tests', {
      params: search ? { search } : undefined,
    });
    return unwrap(r.data);
  },
  participation: async (testId: number) => {
    const r = await api.get<ApiEnvelope<{ assignments: TestAssignmentRow[] }>>(
      `/tests/${testId}/participation`,
    );
    return unwrap(r.data).assignments;
  },
  getForAdmin: async (testId: number) => {
    const r = await api.get<ApiEnvelope<TestForAdminResponse>>(`/tests/${testId}/admin`);
    return unwrap(r.data);
  },
  create: async (body: CreateTestBody) => {
    const r = await api.post<ApiEnvelope<{ test_id: number }>>('/tests', body);
    return unwrap(r.data);
  },
  update: async (
    testId: number,
    body: Partial<{
      test_name: string; start_time: string; end_time: string;
      duration_minutes: number; negative_marking: boolean;
      assignments: Array<{ dept_id: number; academic_year: string }>;
      /** Specific (dept × batch) pairs to DELETE — only honoured when the
       *  test hasn't started yet; backend rejects with 400 otherwise. */
      remove_assignments: Array<{ dept_id: number; academic_year: string }>;
      questions: QuestionInput[];
    }>,
  ) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(`/tests/${testId}`, body);
    return unwrap(r.data);
  },
  remove: async (testId: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>(`/tests/${testId}`);
    return unwrap(r.data);
  },
  startAttempt: async (testId: number) => {
    const r = await api.post<ApiEnvelope<TestAttemptStartResponse>>(`/tests/${testId}/start`);
    return unwrap(r.data);
  },
  saveProgress: async (testId: number, answers: AnswerInput[]) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>(`/tests/${testId}/save`, { answers });
    return unwrap(r.data);
  },
  submitAttempt: async (testId: number, answers: AnswerInput[]) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>(`/tests/${testId}/submit`, { answers });
    return unwrap(r.data);
  },
  parseExcel: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post<ApiEnvelope<{ parsed: QuestionInput[]; total: number; valid_count: number }>>(
      '/tests/parse-excel', fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(r.data);
  },
};
