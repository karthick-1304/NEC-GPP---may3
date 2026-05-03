import { api, unwrap } from './client';
import type { ApiEnvelope, LevelInfo, PageQuery, Topic } from '@/types/api';

export interface TopicsListResponse {
  topics: Topic[];
  total: number;
  page: number;
  limit: number;
  superAccess: boolean;
}

export interface LevelsResponse {
  topic: { topic_id: number; topic_name: string };
  levels: LevelInfo[];
}

export const topicsApi = {
  list: async (subjectId: number, q: PageQuery = {}) => {
    const r = await api.get<ApiEnvelope<TopicsListResponse>>(
      `/subjects/${subjectId}/topics`, { params: q },
    );
    return unwrap(r.data);
  },
  create: async (subjectId: number, topic_name: string) => {
    const r = await api.post<ApiEnvelope<{ topic_id: number }>>(
      `/subjects/${subjectId}/topics`, { topic_name },
    );
    return unwrap(r.data);
  },
  updateName: async (subjectId: number, topicId: number, topic_name: string) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/${topicId}`, { topic_name },
    );
    return unwrap(r.data);
  },
  remove: async (subjectId: number, topicId: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/${topicId}`,
    );
    return unwrap(r.data);
  },
  reorder: async (subjectId: number, order: Array<{ topic_id: number; display_order: number }>) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/topics/reorder`, { order },
    );
    return unwrap(r.data);
  },
  levels: async (subjectId: number, topicId: number) => {
    const r = await api.get<ApiEnvelope<LevelsResponse>>(
      `/subjects/${subjectId}/topics/${topicId}/levels`,
    );
    return unwrap(r.data);
  },
  exportBlob: async (subjectId: number, topicId: number, type: 'core' | 'attempts') => {
    const r = await api.get(
      `/subjects/${subjectId}/topics/${topicId}/export`,
      { params: { type }, responseType: 'blob' },
    );
    return r.data as Blob;
  },
};
