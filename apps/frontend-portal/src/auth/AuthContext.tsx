/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Keycloak from 'keycloak-js';

// Paths that point at a specific resource — preserved on login (deep links from
// notifications/emails should still open their target rather than bounce Home).
const DEEP_LINK = /^\/(tasks|requests|cases|processes|catalog|contractors)\/[^/]+/;

interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  token: string;
  tenantId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true, logout: () => {}, token: null,
});

const kc = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || window.location.origin,
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'bpm',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'bpm-frontend',
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The URL the user arrived on, before Keycloak finishes initialising.
    const entryPath = window.location.pathname;
    kc.init({ onLoad: 'login-required', checkLoginIframe: false, pkceMethod: 'S256' })
      .then(authenticated => {
        if (authenticated && kc.tokenParsed) {
          const tp = kc.tokenParsed as any;
          setUser({
            id: tp.sub || '',
            email: tp.email || '',
            name: tp.name || tp.preferred_username || '',
            roles: tp.realm_access?.roles || [],
            token: kc.token || '',
            tenantId: tp.tenantId || 'a0000000-0000-0000-0000-000000000001',
          });
          // Land on Home on login. Keycloak's login-required otherwise returns
          // the user to whatever URL they entered on. Keyed on the Keycloak login
          // session (session_state/sid): a new value is minted on every fresh
          // login — so any login after a logout starts at Home, whether it's the
          // same user or a different one. A page refresh reuses the same session
          // (same id), so the user keeps their place; in-app navigation doesn't
          // re-init auth at all. Genuine resource deep links are preserved
          // (notification/email links still open their target).
          const session = tp.session_state || tp.sid || '';
          if (sessionStorage.getItem('bpm_landed_session') !== session && !DEEP_LINK.test(entryPath) && entryPath !== '/home') {
            navigate('/home', { replace: true });
          }
          sessionStorage.setItem('bpm_landed_session', session);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Refresh token before expiry
    setInterval(() => {
      kc.updateToken(60).then(refreshed => {
        if (refreshed && kc.token) {
          setUser(prev => prev ? { ...prev, token: kc.token! } : null);
        }
      }).catch(() => kc.logout());
    }, 30_000);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout: () => kc.logout(), token: user?.token || null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
