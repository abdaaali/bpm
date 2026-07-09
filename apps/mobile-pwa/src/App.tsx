import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { AuthProvider, useAuth } from './auth';
import { getConn } from './connection';
import { getTheme } from './theme';
import Connect from './pages/Connect';
import Login from './pages/Login';
import Home from './pages/Home';
import CaseDetail from './pages/CaseDetail';
import WorkOrderDetail from './pages/WorkOrderDetail';

function Guard({ children }: { children: React.ReactNode }) {
  if (!getConn()) return <Navigate to="/connect" replace />;
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Picks the BPM (blue) or Contractor (orange) theme for the connection
 * chosen on the Connect screen. getConn() reads localStorage directly (no
 * React state backs it), so this re-reads on every navigation via
 * useLocation() — the only reliable way to notice the mode changed right
 * after Connect calls setConn() and navigates to /login.
 */
function ThemedRoutes() {
  const location = useLocation();
  const mode = React.useMemo(() => getConn()?.mode ?? null, [location.pathname]);
  return (
    <ThemeProvider theme={getTheme(mode)}>
      <Routes>
        <Route path="/connect" element={<Connect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guard><Home /></Guard>} />
        <Route path="/case/:id" element={<Guard><CaseDetail /></Guard>} />
        <Route path="/wo/:id" element={<Guard><WorkOrderDetail /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemedRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
