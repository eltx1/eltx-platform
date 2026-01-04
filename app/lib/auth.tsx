'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';

interface AuthContextType {
  user: any | null | undefined;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: undefined, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const demoUser = useMemo(
    () => (process.env.NEXT_PUBLIC_DEMO_MODE === '1' ? { id: 'demo', name: 'Demo User' } : null),
    []
  );
  const [user, setUser] = useState<any | null | undefined>(demoUser ?? undefined);
  const refresh = useCallback(async () => {
    if (demoUser) return;
    const res = await apiFetch<any>('/auth/me');
    setUser(res.ok ? res.data : null);
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
  };
  return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
