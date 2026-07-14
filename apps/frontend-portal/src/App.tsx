import React, { useMemo, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { useAuth } from './auth/AuthContext';
import { setAuthHeaders } from './api/client';
import { createAppTheme } from './theme/theme';
import type { PaletteMode } from '@mui/material';
import Layout from './components/Layout';
import Dashboard from './pages/dashboard/Dashboard';
import Workplace from './pages/workplace/Workplace';
import WorkItemDetail from './pages/inbox/WorkItemDetail';
import CaseList from './pages/cases/CaseList';
import CaseDetail from './pages/cases/CaseDetail';
import CreateCase from './pages/cases/CreateCase';
import ProcessStudio from './pages/process-studio/ProcessStudio';
import ProcessList from './pages/process-studio/ProcessList';
import ProcessInstances from './pages/process-studio/ProcessInstances';
import ProcessInstanceDetail from './pages/process-studio/ProcessInstanceDetail';
import ProcessAnalytics from './pages/process-studio/ProcessAnalytics';
import ReportBuilder from './pages/reports/ReportBuilder';
import ManagementDigest from './pages/digest/ManagementDigest';
import ApprovalPolicies from './pages/approvals/ApprovalPolicies';
import ApprovalInstances from './pages/approvals/ApprovalInstances';
import OrgStructure from './pages/org/OrgStructure';
import AuditLog from './pages/audit/AuditLog';
import ConnectorAdmin from './pages/admin/ConnectorAdmin';
import NotificationTemplates from './pages/admin/NotificationTemplates';
import DataHub from './pages/admin/DataHub';
import SlaPolicies from './pages/admin/SlaPolicies';
import OpsDashboard from './pages/dashboard/OpsDashboard';
import { HomePage, DashboardsPage } from './pages/launcher/Launcher';
import MdmPage from './pages/mdm/MdmPage';
import RcaPage from './pages/rca/RcaPage';
import ServiceCatalog from './pages/catalog/ServiceCatalog';
import NewRequest from './pages/catalog/NewRequest';
import ExternalCompanyRegistry from './pages/contractors/ExternalCompanyRegistry';
import ExternalUserManager from './pages/contractors/ExternalUserManager';
import WorkOrderDispatch from './pages/contractors/WorkOrderDispatch';
import ExternalSubmissionReview from './pages/contractors/ExternalSubmissionReview';
import ContractorDashboard from './pages/contractors/ContractorDashboard';
import RequirePerm from './components/RequirePerm';

export default function App() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<PaletteMode>(() => {
    const saved = localStorage.getItem('bpm_color_mode');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const appTheme = useMemo(() => createAppTheme(mode), [mode]);
  const toggleMode = () => setMode(current => {
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('bpm_color_mode', next);
    return next;
  });

  // Set synchronously on every render so headers() is always up-to-date
  // before any child component's query fires.
  if (user) setAuthHeaders(user.token, user.tenantId, user.id);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return null; // Keycloak redirects to login

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Layout colorMode={mode} onToggleColorMode={toggleMode}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/dashboards" element={<DashboardsPage />} />
          <Route path="/workplace" element={<Workplace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/operations" element={<OpsDashboard />} />
          <Route path="/catalog" element={<ServiceCatalog />} />
          <Route path="/catalog/:defId/new" element={<NewRequest />} />
          {/* Old personal-work routes now live as Workplace tabs */}
          <Route path="/my-requests" element={<Navigate to="/workplace?tab=requests" replace />} />
          <Route path="/inbox" element={<Navigate to="/workplace" replace />} />
          <Route path="/tasks/:id" element={<WorkItemDetail mode="task" />} />
          <Route path="/requests/:id" element={<WorkItemDetail mode="request" />} />
          <Route path="/cases" element={<CaseList />} />
          <Route path="/cases/new" element={<CreateCase />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          {/* Process design + monitoring are a designer-only concern (processes:read).
              End users experience process-backed work as ordinary cases. */}
          <Route path="/processes" element={<RequirePerm perm="processes:read"><ProcessList /></RequirePerm>} />
          <Route path="/processes/:id/studio" element={<RequirePerm perm="processes:read"><ProcessStudio /></RequirePerm>} />
          <Route path="/processes/instances" element={<RequirePerm perm="processes:read"><ProcessInstances /></RequirePerm>} />
          <Route path="/processes/instances/:id" element={<RequirePerm perm="processes:read"><ProcessInstanceDetail /></RequirePerm>} />
          <Route path="/processes/analytics" element={<RequirePerm perm="processes:read"><ProcessAnalytics /></RequirePerm>} />
          <Route path="/reports" element={<RequirePerm perm="analytics:read"><ReportBuilder /></RequirePerm>} />
          {/* notifications:manage, not analytics:read — this page is governance
              reporting for leadership (its own canManage check already gates
              editing on the same permission); analytics:read is held by
              individual-contributor roles like IT Engineer for Reports access
              and would otherwise let them into this page too. */}
          <Route path="/digest" element={<RequirePerm perm="notifications:manage"><ManagementDigest /></RequirePerm>} />
          <Route path="/approvals/policies" element={<ApprovalPolicies />} />
          <Route path="/approvals/instances" element={<ApprovalInstances />} />
          <Route path="/org" element={<OrgStructure />} />
          <Route path="/mdm" element={<MdmPage />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin/sla" element={<SlaPolicies />} />
          <Route path="/admin/connectors" element={<ConnectorAdmin />} />
          <Route path="/admin/notification-templates" element={<NotificationTemplates />} />
          <Route path="/admin" element={<Navigate to="/org" replace />} />
          <Route path="/admin/datahub" element={<DataHub />} />
          <Route path="/rca" element={<RcaPage />} />
          <Route path="/contractors/companies" element={<ExternalCompanyRegistry />} />
          <Route path="/contractors/users" element={<ExternalUserManager />} />
          <Route path="/contractors/dispatch" element={<WorkOrderDispatch standalone />} />
          <Route path="/contractors/review" element={<ExternalSubmissionReview />} />
          <Route path="/contractors/review/:id" element={<ExternalSubmissionReview />} />
          <Route path="/contractors/dashboard" element={<ContractorDashboard />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </ThemeProvider>
  );
}
