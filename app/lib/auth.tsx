'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api';

interface AuthContextType {
  user: any | null | undefined;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: undefined, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const refresh = async () => {
    const res = await apiFetch<any>('/auth/me');
    setUser(res.ok ? res.data : null);
  };
  useEffect(() => {
    refresh();
  }, []);
  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
