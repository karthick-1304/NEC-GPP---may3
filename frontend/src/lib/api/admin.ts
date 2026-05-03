import { api, unwrap } from './client';
import type { ApiEnvelope, Role } from '@/types/api';

export interface AdminUserRow {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: Role;
  // Student fields
  reg_num?: string;
  batch_year?: string;
  // Common across student/staff/HOD
  dept_code?: string | null;
  dept_name?: string | null;
  // Staff fields
  is_tutor?: 0 | 1;
  tutor_batch_year?: string | null;
}

export interface AdminUsersListResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}

export const adminApi = {
  listUsers: async (params: {
    role?: Role; dept_code?: string; batch_year?: string;
    search?: string; page?: number; limit?: number;
  }) => {
    const r = await api.get<ApiEnvelope<AdminUsersListResponse>>('/admin/users', { params });
    return unwrap(r.data);
  },
  // Single creation
  createStudent: async (body: {
    full_name: string; email: string; phone_number?: string | null;
    dept_code: string; batch_year: string; reg_num: string;
  }) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/admin/users/students/single', body);
    return unwrap(r.data);
  },
  createStaff: async (body: {
    full_name: string; email: string; phone_number?: string | null; dept_code: string;
  }) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/admin/users/staffs/single', body);
    return unwrap(r.data);
  },
  createAdmin: async (body: {
    full_name: string; email: string; phone_number?: string | null;
  }) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/admin/users/admin', body);
    return unwrap(r.data);
  },
  createDepartment: async (body: {
    dept_name: string; dept_code: string; hod_phone?: string | null; hod_email: string;
  }) => {
    const r = await api.post<ApiEnvelope<{ dept_id: number }>>('/admin/departments', body);
    return unwrap(r.data);
  },
  // Bulk uploads
  bulkStudents: async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await api.post<ApiEnvelope<{ created: number }>>('/admin/users/students/bulk', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(r.data);
  },
  bulkStaffs: async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await api.post<ApiEnvelope<{ created: number }>>('/admin/users/staffs/bulk', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(r.data);
  },
  // Edits
  editStudent: async (userId: number, body: Partial<{
    full_name: string; email: string; phone_number: string | null;
    batch_year: string; dept_code: string; reg_num: string; remove_tutor: boolean;
  }>) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(`/admin/users/students/${userId}`, body);
    return unwrap(r.data);
  },
  editStaff: async (userId: number, body: Partial<{
    full_name: string; email: string; phone_number: string | null; dept_code: string;
  }>) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>(`/admin/users/staffs/${userId}`, body);
    return unwrap(r.data);
  },
  // Deletions
  deleteStudentByEmail: async (email: string) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>('/admin/users/students/single', { data: { email } });
    return unwrap(r.data);
  },
  deleteStaffByEmail: async (email: string) => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>('/admin/users/staffs/single', { data: { email } });
    return unwrap(r.data);
  },
  bulkDeleteStudents: async (batch_year: string, dept_code: string) => {
    const r = await api.delete<ApiEnvelope<{ deleted_count: number }>>('/admin/users/students/bulk', {
      data: { batch_year, dept_code },
    });
    return unwrap(r.data);
  },

  // ─── Email kill switch ──────────────────────────────────────────
  getEmailStatus: async () => {
    const r = await api.get<ApiEnvelope<EmailStatus>>('/admin/system/email-status');
    return unwrap(r.data);
  },
  setEmailStatus: async (body: {
    action: 'enable' | 'disable';
    durationHours?: number;
    indefinite?: boolean;
    reason?: string;
  }) => {
    const r = await api.post<ApiEnvelope<EmailStatus>>('/admin/system/email-status', body);
    return unwrap(r.data);
  },
};

export interface EmailStatus {
  active: boolean;
  indefinite: boolean;
  disabledUntil: string | null;
  secondsRemaining: number | null;
  meta: { reason: string | null; actorId: number | null; activatedAt: string } | null;
}
