import { api, unwrap } from './client';
import type { ApiEnvelope, PageQuery } from '@/types/api';

export interface TutorwardStudent {
  user_id: number;
  full_name: string;
  email: string;
  reg_num: string;
  batch_year: string;
  dept_name: string | null;
  dept_code: string | null;
}

export interface TutorwardListResponse {
  students: TutorwardStudent[];
  total: number;
  page: number;
  limit: number;
}

export interface AvailableListResponse extends TutorwardListResponse {
  tutor_batch_year: string;
}

export const tutorApi = {
  myWards: async (q: PageQuery = {}) => {
    const r = await api.get<ApiEnvelope<TutorwardListResponse>>('/tutor/my-students', { params: q });
    return unwrap(r.data);
  },
  available: async (q: PageQuery = {}) => {
    const r = await api.get<ApiEnvelope<AvailableListResponse>>('/tutor/available-students', { params: q });
    return unwrap(r.data);
  },
  setBatchYear: async (tutor_batch_year: string | null) => {
    const r = await api.patch<ApiEnvelope<{ tutor_batch_year: string | null }>>(
      '/tutor/batch-year',
      { tutor_batch_year },
    );
    return unwrap(r.data);
  },
  add: async (student_id: number) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/tutor/add', { student_id });
    return unwrap(r.data);
  },
  remove: async (student_id: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>('/tutor/remove', { data: { student_id } });
    return unwrap(r.data);
  },
};
