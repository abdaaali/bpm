import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { getConn } from './connection';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connect" element={<Connect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Home /></Guard>} />
          <Route path="/case/:id" element={<Guard><CaseDetail /></Guard>} />
          <Route path="/wo/:id" element={<Guard><WorkOrderDetail /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
