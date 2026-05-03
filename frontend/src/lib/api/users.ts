import { api, unwrap } from './client';
import type { ApiEnvelope } from '@/types/api';

export const usersApi = {
  sessions: async () => {
    const r = await api.get<ApiEnvelope<{ active_sessions: number }>>('/users/me/sessions');
    return unwrap(r.data);
  },
  logoutOtherSessions: async () => {
    const r = await api.delete<ApiEnvelope<Record<string, never>>>('/users/me/sessions/others');
    return unwrap(r.data);
  },
};
