import { api, unwrap } from './client';
import type { ApiEnvelope } from '@/types/api';

export interface ProgressStudent {
  user_id: number;
  reg_num: string;
  full_name: string;
  email: string;
  dept_name: string | null;
  dept_code: string | null;
  batch_year: string | null;
  practice_score: number;
  test_score: number;
  lev_1_completed: number;
  lev_2_completed: number;
  topics_completed: number;
}

export interface ProgressListResponse {
  students: ProgressStudent[];
  total: number;
  page: number;
  limit: number;
}

export interface StudentDetailResponse {
  general: {
    full_name: string; reg_num: string; email: string;
    dept_code: string | null; batch_year: string | null;
    practice_score: number; test_score: number;
    lev_1_completed: number; lev_2_completed: number; topics_completed: number;
    tutor_name: string | null; tutor_dept: string | null;
  };
  top_subjects: Array<{ subject_id: number; subject_name: string }>;
  history: Array<{
    subject_name: string; topic_name: string; level: '1' | '2'; set_name: number;
    score: number; status: 'Passed' | 'Failed'; date: string;
  }>;
}

export interface LeaderboardRow {
  full_name: string;
  email: string;
  reg_num: string;
  batch_year: string | null;
  dept_name: string | null;
  dept_id: number | null;
  score: number;
  rank: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardRow[];
  last_updated: string;
}

export const progressApi = {
  list: async (params: { dept_id?: number; batch_year?: string; search?: string; page?: number; limit?: number }) => {
    const r = await api.get<ApiEnvelope<ProgressListResponse>>('/progress/students', { params });
    return unwrap(r.data);
  },
  detail: async (studentId: number) => {
    const r = await api.get<ApiEnvelope<StudentDetailResponse>>(`/progress/students/${studentId}`);
    return unwrap(r.data);
  },
  leaderboard: async (params: { type: 'practice' | 'test'; dimension: 'all' | 'dept' | 'batch'; value?: string; search?: string }) => {
    const r = await api.get<ApiEnvelope<LeaderboardResponse>>('/progress/leaderboard', { params });
    return unwrap(r.data);
  },
  rebuild: async () => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/progress/leaderboard/rebuild');
    return unwrap(r.data);
  },
};
