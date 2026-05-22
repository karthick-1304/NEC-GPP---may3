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
  //
  // We cache the "no session" outcome in sessionStorage so anonymous visitors
  // wandering across public pages (Home → About → Login) don't fire a fresh
  // /auth/refresh on every navigation. The cache is cleared on login (so the
  // next bootstrap reads the new session) and is implicitly cleared when the
  // tab closes (sessionStorage lifetime).
  //
  // Without this, dev-mode hot reloads and HMR re-mounts produce a stream of
  // 401s in the server log even though the user simply isn't signed in.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Fast path: if a previous mount in this tab already determined there's
    // no session, don't hit the network again.
    if (typeof window !== 'undefined' && sessionStorage.getItem('noSession') === '1') {
      tokenStore.set(null);
      setUser(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const r = await authApi.refresh();
        tokenStore.set(r.accessToken);
        const me = await authApi.me();
        setUser(me);
        sessionStorage.removeItem('noSession'); // we ARE signed in
      } catch {
        tokenStore.set(null);
        setUser(null);
        // Remember the negative result so subsequent mounts in this tab skip
        // the network round-trip. Cleared on login and on tab close.
        try { sessionStorage.setItem('noSession', '1'); } catch { /* private mode */ }
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
    // Successful login invalidates the cached "no session" flag — the next
    // page mount must hit /auth/refresh fresh to pick up the new session.
    sessionStorage.removeItem('noSession');
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* swallow — clear locally either way */ }
    tokenStore.set(null);
    setUser(null);
    sessionStorage.removeItem('previousLoginAt');
    sessionStorage.removeItem('noSession'); // let the post-logout reload re-check
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
