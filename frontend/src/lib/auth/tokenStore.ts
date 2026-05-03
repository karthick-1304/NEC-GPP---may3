// In-memory access token store. Refresh token lives in an httpOnly cookie
// owned by the backend; we never read or write it from JS.
//
// We keep the access token as a module-level variable (not in React state)
// so the axios interceptor can read it synchronously — no extra refs needed.

let _accessToken: string | null = null;
const subscribers = new Set<(t: string | null) => void>();

export const tokenStore = {
  get: () => _accessToken,
  set: (t: string | null) => {
    _accessToken = t;
    subscribers.forEach((cb) => cb(t));
  },
  subscribe: (cb: (t: string | null) => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  },
};
