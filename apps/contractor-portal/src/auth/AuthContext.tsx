import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setAuthToken, clearAuthToken } from '../api/client';

interface User {
  sub: string; email: string; full_name: string; role: string;
  company_id: string; company_name: string; tenant_id: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('contractor_token');
    const stored = localStorage.getItem('contractor_user');
    if (token && stored) {
      setAuthToken(token);
      setUser(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    const { access_token, user: u } = r.data;
    setAuthToken(access_token);
    localStorage.setItem('contractor_token', access_token);
    localStorage.setItem('contractor_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    localStorage.removeItem('contractor_token');
    localStorage.removeItem('contractor_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
