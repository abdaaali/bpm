import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import WorkOrderList from './pages/WorkOrderList';
import WorkOrderDetail from './pages/WorkOrderDetail';
import TeamView from './pages/TeamView';
import Profile from './pages/Profile';
import NotificationsPage from './pages/NotificationsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="work-orders" element={<WorkOrderList />} />
            <Route path="work-orders/:id" element={<WorkOrderDetail />} />
            <Route path="team" element={<TeamView />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
