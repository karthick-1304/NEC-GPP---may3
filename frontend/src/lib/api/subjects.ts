import { api, unwrap } from './client';
import type { ApiEnvelope, Collaborator, Department, PageQuery, Subject } from '@/types/api';

export interface SubjectsPage {
  subjects: Subject[];
  total: number;
  page: number;
  limit: number;
}

export interface CollaboratorsPayload {
  collaborators: Collaborator[];
  nonCollaborators: Department[]; // populated only when caller has SuperAccess
}

export const subjectsApi = {
  list: async (q: PageQuery = {}) => {
    const r = await api.get<ApiEnvelope<SubjectsPage>>('/subjects', { params: q });
    return unwrap(r.data);
  },
  listOther: async (q: PageQuery = {}) => {
    const r = await api.get<ApiEnvelope<SubjectsPage>>('/subjects/other', { params: q });
    return unwrap(r.data);
  },
  get: async (subjectId: number) => {
    const r = await api.get<ApiEnvelope<{ subject: Subject }>>(`/subjects/${subjectId}`);
    return unwrap(r.data).subject;
  },
  create: async (body: { subject_name: string; collaborator_dept_ids?: number[]; notify?: boolean }) => {
    const r = await api.post<ApiEnvelope<{ subject_id: number }>>('/subjects', body);
    return unwrap(r.data);
  },
  updateName: async (subjectId: number, subject_name: string) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(`/subjects/${subjectId}`, { subject_name });
    return unwrap(r.data);
  },
  toggleLock: async (subjectId: number) => {
    const r = await api.patch<ApiEnvelope<{ locked: boolean }>>(`/subjects/${subjectId}/lock`);
    return unwrap(r.data);
  },
  toggleDeptLock: async (subjectId: number) => {
    const r = await api.patch<ApiEnvelope<{ dept_sub_lock: boolean }>>(`/subjects/${subjectId}/dept-lock`);
    return unwrap(r.data);
  },
  collaborators: async (subjectId: number) => {
    const r = await api.get<ApiEnvelope<CollaboratorsPayload>>(`/subjects/${subjectId}/collaborators`);
    return unwrap(r.data);
  },
  addCollaborator: async (subjectId: number, dept_id: number) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>(`/subjects/${subjectId}/collaborators`, { dept_id });
    return unwrap(r.data);
  },
  removeCollaborator: async (subjectId: number, deptId: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>(`/subjects/${subjectId}/collaborators/${deptId}`);
    return unwrap(r.data);
  },
  leave: async (subjectId: number) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>(`/subjects/${subjectId}/leave`);
    return unwrap(r.data);
  },
  joinRequest: async (subjectId: number, message?: string) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>(
      `/subjects/${subjectId}/join-request`,
      { message: message ?? '' },
    );
    return unwrap(r.data);
  },
  remove: async (subjectId: number) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>(`/subjects/${subjectId}`);
    return unwrap(r.data);
  },
  /**
   * Returns the binary Excel buffer. Caller is responsible for triggering the download.
   */
  exportBlob: async (subjectId: number, type: 'core' | 'attempts') => {
    const r = await api.get(`/subjects/${subjectId}/export`, {
      params: { type },
      responseType: 'blob',
    });
    return r.data as Blob;
  },
};
