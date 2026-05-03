import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from '../auth/tokenStore';
import type { ApiEnvelope, ApiErrorBody } from '@/types/api';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '';
// In dev, Vite proxy at /api → localhost:5000; production should set VITE_API_BASE.
const baseURL = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api/v1` : '/api/v1';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// ─── Request interceptor: attach bearer ───────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const t = tokenStore.get();
  if (t && config.headers) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// ─── 401 → refresh-and-retry, single-flight ────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;
const refreshOnce = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const r = await axios.post<ApiEnvelope<{ accessToken: string }>>(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const t = r.data?.data?.accessToken ?? null;
      tokenStore.set(t);
      return t;
    } catch {
      tokenStore.set(null);
      return null;
    } finally {
      // micro-task delay so concurrent callers see the resolved value
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();
  return refreshPromise;
};

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Don't try to refresh on the refresh route itself, login, or already-retried calls.
    const url = original?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshOnce();
      if (newToken) {
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

// ─── Convenience helpers ───────────────────────────────────────────────────
export const unwrap = <T,>(envelope: ApiEnvelope<T>): T => envelope.data;

export type ParsedApiError = {
  status: number;
  message: string;
  fieldErrors: Array<{ field?: string; message: string }>;
};

export const parseApiError = (err: unknown): ParsedApiError => {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    const status = err.response?.status ?? 0;
    const message = err.response?.data?.message || err.message || 'Network error';
    const rawErrors = err.response?.data?.errors;
    const fieldErrors = Array.isArray(rawErrors)
      ? rawErrors.map((e: any) => ({ field: e.field, message: e.message ?? String(e.reason ?? '') }))
      : [];
    return { status, message, fieldErrors };
  }
  return { status: 0, message: (err as Error)?.message || 'Unexpected error', fieldErrors: [] };
};
