import { api, unwrap } from './client';
import type {
  ApiEnvelope,
  AuthUser,
  LoginResponse,
  RefreshResponse,
} from '@/types/api';

export const authApi = {
  login: async (email: string, password: string) => {
    const r = await api.post<ApiEnvelope<LoginResponse>>('/auth/login', { email, password });
    return unwrap(r.data);
  },
  refresh: async () => {
    const r = await api.post<ApiEnvelope<RefreshResponse>>('/auth/refresh', {});
    return unwrap(r.data);
  },
  logout: async () => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/auth/logout', {});
    return unwrap(r.data);
  },
  forgotPassword: async (email: string) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/auth/forgot-password', { email });
    return unwrap(r.data);
  },
  verifyOtp: async (email: string, otp: string) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/auth/verify-otp', { email, otp });
    return unwrap(r.data);
  },
  resetPassword: async (email: string, otp: string, newPassword: string) => {
    const r = await api.post<ApiEnvelope<Record<string, never>>>('/auth/reset-password', {
      email, otp, newPassword,
    });
    return unwrap(r.data);
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const r = await api.patch<ApiEnvelope<Record<string, never>>>('/auth/change-password', {
      currentPassword, newPassword,
    });
    return unwrap(r.data);
  },
  me: async () => {
    const r = await api.get<ApiEnvelope<{ profile: AuthUser & Record<string, unknown> }>>('/users/me');
    return unwrap(r.data).profile;
  },
};
