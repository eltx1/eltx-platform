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
    try {
      const u = await apiFetch('/auth/me');
      setUser(u);
    } catch {
      setUser(null);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
