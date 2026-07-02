import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { getConn, kcTokenUrl, apiBase } from './connection';

interface AuthState { token: string | null; user: any; ready: boolean;
  login: (u: string, p: string) => Promise<void>; logout: () => void; }
const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('pwa_token'));
  const [user, setUser] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('pwa_user') || 'null'); } catch { return null; } });
  const [ready, setReady] = useState(true);

  const login = useCallback(async (u: string, p: string) => {
    const conn = getConn()!;
    if (conn.mode === 'bpm') {
      const body = new URLSearchParams({ client_id: 'bpm-frontend', username: u, password: p, grant_type: 'password' });
      const r = await axios.post(kcTokenUrl(conn), body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const t = r.data.access_token;
      localStorage.setItem('pwa_token', t); setToken(t);
      const me = JSON.parse(atob(t.split('.')[1]));
      const usr = { name: me.name || me.preferred_username, username: me.preferred_username, roles: me.realm_access?.roles || [] };
      localStorage.setItem('pwa_user', JSON.stringify(usr)); setUser(usr);
    } else {
      const r = await axios.post(`${apiBase(conn)}/auth/login`, { email: u, password: p });
      const t = r.data.access_token;
      localStorage.setItem('pwa_token', t); setToken(t);
      localStorage.setItem('pwa_user', JSON.stringify(r.data.user)); setUser(r.data.user);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pwa_token'); localStorage.removeItem('pwa_user');
    setToken(null); setUser(null);
  }, []);

  useEffect(() => { setReady(true); }, []);
  return <Ctx.Provider value={{ token, user, ready, login, logout }}>{children}</Ctx.Provider>;
}
