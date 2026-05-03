import { api, unwrap } from './client';
import type { ApiEnvelope, Department } from '@/types/api';

export const commonApi = {
  departments: async () => {
    const r = await api.get<ApiEnvelope<{ departments: Department[] }>>('/common/departments');
    return unwrap(r.data).departments;
  },
  batchYears: async () => {
    const r = await api.get<ApiEnvelope<{ batch_years: string[] }>>('/common/batch-years');
    return unwrap(r.data).batch_years;
  },
};
