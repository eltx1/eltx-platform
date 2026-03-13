'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';

interface AuthContextType {
  user: any | null | undefined;
  refresh: () => Promise<any | null | undefined>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: undefined, refresh: async () => undefined, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const demoUser = useMemo(
    () => (process.env.NEXT_PUBLIC_DEMO_MODE === '1' ? { id: 'demo', name: 'Demo User' } : null),
    []
  );
  const [user, setUser] = useState<any | null | undefined>(demoUser ?? undefined);
  const refresh = useCallback(async () => {
    if (demoUser) return demoUser;
    const res = await apiFetch<any>('/auth/me');
    const nextUser = res.ok ? res.data : null;
    setUser(nextUser);
    return nextUser;
  }, [demoUser]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const logout = async () => {
    if (demoUser) {
      setUser(null);
      return;
    }
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.assign('/login?loggedOut=1');
    }
  };
  return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
