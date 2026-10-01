'use client';

import { hasPermission, type Permission, type SessionUser } from '@hbe/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, get, post } from './api';

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  reload: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setUser(await get<SessionUser>('/api/v1/auth/me'));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const logout = useCallback(async () => {
    await post('/api/v1/auth/logout').catch(() => undefined);
    setUser(null);
    location.assign('/login/');
  }, []);
  const can = useCallback((p: Permission) => (user ? hasPermission(user.role, p) : false), [user]);
  return <Ctx.Provider value={{ user, loading, reload, setUser, logout, can }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Client-side gate (the API enforces the real rules). Redirects to /login when signed out. */
export function useRequireUser(): SessionUser | null {
  const { user, loading } = useSession();
  useEffect(() => {
    if (!loading && !user) location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
    if (!loading && user?.mfaSetupRequired && !location.pathname.startsWith('/setup-mfa')) location.assign('/setup-mfa/');
  }, [user, loading]);
  return user;
}
