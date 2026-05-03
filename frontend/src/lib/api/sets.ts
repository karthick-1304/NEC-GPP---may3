import { api, unwrap } from './client';
import type { ApiEnvelope, PracticeSet, QuestionAdmin } from '@/types/api';

export interface SetsListResponse {
  sets: PracticeSet[];
  superAccess: boolean;
}

export interface SetForAdminResponse {
  set: PracticeSet & {
    subject_id?: number;
    topic_name?: string;
    subject_name?: string;
    subject_locked?: 0 | 1;
    subject_creator?: string;
  };
  questions: QuestionAdmin[];
}

export interface QuestionInput {
  question_type: 'MCQ' | 'MSQ' | 'NAT';
  question_text: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_answer: string;
  marks: 1 | 2;
  question_image_url?: string | null;
  question_image_thumb_url?: string | null;
  question_image_delete_url?: string | null;
}

export const setsApi = {
  list: async (subjectId: number, topicId: number, level: '1' | '2') => {
    const r = await api.get<ApiEnvelope<SetsListResponse>>(
      `/subjects/${subjectId}/topics/${topicId}/sets`,
      { params: { level } },
    );
    return unwrap(r.data);
  },
  getForAdmin: async (subjectId: number, topicId: number, setId: number) => {
    const r = await api.get<ApiEnvelope<SetForAdminResponse>>(
      `/subjects/${subjectId}/topics/${topicId}/sets/${setId}/admin`,
    );
    return unwrap(r.data);
  },
  create: async (
    subjectId: number, topicId: number,
    body: { level: '1' | '2'; negative_marking: boolean; threshold_percentage: number; questions: QuestionInput[] },
  ) => {
    const r = await api.post<ApiEnvelope<{ set_id: number }>>(
      `/subjects/${subjectId}/topics/${topicId}/sets`, body,
    );
    return unwrap(r.data);
  },
  update: async (
    subjectId: number, topicId: number, setId: number,
    body: Partial<{ negative_marking: boolean; threshold_percentage: number; questions: QuestionInput[] }>,
  ) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/${topicId}/sets/${setId}`, body,
    );
    return unwrap(r.data);
  },
  remove: async (subjectId: number, topicId: number, setId: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/${topicId}/sets/${setId}`,
    );
    return unwrap(r.data);
  },
  reorder: async (
    subjectId: number, topicId: number,
    order: Array<{ set_id: number; display_order: number }>,
  ) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/${topicId}/sets/reorder`, { order },
    );
    return unwrap(r.data);
  },
  exportBlob: async (
    subjectId: number, topicId: number, setId: number, type: 'core' | 'attempts',
  ) => {
    const r = await api.get(
      `/subjects/${subjectId}/topics/${topicId}/sets/${setId}/export`,
      { params: { type }, responseType: 'blob' },
    );
    return r.data as Blob;
  },
  parseExcel: async (subjectId: number, topicId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post<ApiEnvelope<{ parsed: QuestionInput[]; total: number; valid_count: number }>>(
      `/subjects/${subjectId}/topics/${topicId}/sets/parse-excel`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(r.data);
  },
};
