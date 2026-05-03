import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { tokenStore } from './tokenStore';
import type { AuthUser } from '@/types/api';

type AuthState = {
  user: AuthUser | null;
  loading: boolean;        // initial bootstrap (refresh-on-mount)
  authenticated: boolean;
};

type AuthActions = {
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);
  const queryClient = useQueryClient();

  // ─── Bootstrap: try refresh on mount (cookie may still be valid) ──────
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const r = await authApi.refresh();
        tokenStore.set(r.accessToken);
        const me = await authApi.me();
        setUser(me);
      } catch {
        tokenStore.set(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    tokenStore.set(r.accessToken);
    // Capture the previous login timestamp from the login response BEFORE we
    // ever call /users/me. The login controller returns last_login as it was
    // *prior* to updating it to NOW() — that's the value the user actually
    // wants to see ("when did this account last sign in"). Storing it here
    // prevents /me refreshes from overwriting it with the current session's
    // freshly-set timestamp.
    sessionStorage.setItem('previousLoginAt', r.user.last_login ?? '');
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* swallow — clear locally either way */ }
    tokenStore.set(null);
    setUser(null);
    sessionStorage.removeItem('previousLoginAt');
    // Crucial: drop every cached query so the next user doesn't see the previous
    // session's data on the same browser before refetches land.
    queryClient.clear();
    // Full reload + replace the current history entry with `/`. This is the
    // only way to drop the authed deep route the user is on out of the
    // browser back stack — clicking back after sign-out should never resurrect
    // a logged-in screen, even momentarily.
    window.location.replace('/');
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
  }, []);

  const value = useMemo<AuthState & AuthActions>(() => ({
    user,
    loading,
    authenticated: !!user,
    login,
    logout,
    refreshMe,
    setUser,
  }), [user, loading, login, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
