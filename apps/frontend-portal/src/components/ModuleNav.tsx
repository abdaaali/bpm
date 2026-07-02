import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import { useAccess } from '../auth/useAccess';
import { CASE_DOMAINS, domainForType } from '../config/caseDomains';

interface SubPage { label: string; path: string; perm?: string; }
interface ModuleGroup { label: string; pages: SubPage[]; }

// In-module secondary navigation. Once you open a functional area from the
// Applications launcher, this sub-bar exposes ALL of that module's pages.
// The Cases area is rendered dynamically (scoped to the active case-ops domain)
// rather than as a static group — see the cases branch in the component below.
// Single-page modules (RCA, DataHub) have no sub-bar.
const GROUPS: ModuleGroup[] = [
  { label: 'Service Catalog', pages: [
    { label: 'Catalog', path: '/catalog', perm: 'cases:read' },
    { label: 'My Requests', path: '/my-requests', perm: 'cases:read' },
  ] },
  { label: 'External Workforce', pages: [
    { label: 'Companies', path: '/contractors/companies', perm: 'contractors:read' },
    { label: 'External Workers', path: '/contractors/users', perm: 'contractors:read' },
    { label: 'Dispatch', path: '/contractors/dispatch', perm: 'contractors:read' },
    { label: 'Submission Review', path: '/contractors/review', perm: 'contractors:read' },
    { label: 'Performance & KPIs', path: '/contractors/dashboard', perm: 'contractors:read' },
  ] },
  { label: 'Process Studio', pages: [
    { label: 'Studio', path: '/processes', perm: 'processes:read' },
    { label: 'Process Monitor', path: '/processes/instances', perm: 'processes:read' },
    { label: 'Process Performance', path: '/processes/analytics', perm: 'processes:read' },
  ] },
  { label: 'Governance', pages: [
    { label: 'Policies & Controls', path: '/approvals/policies', perm: 'approvals:read' },
    { label: 'Approval Instances', path: '/approvals/instances', perm: 'approvals:read' },
  ] },
  { label: 'Administration', pages: [
    { label: 'Organization', path: '/org', perm: 'org:read' },
    { label: 'Master Data', path: '/mdm', perm: 'mdm:read' },
    { label: 'SLA Policies', path: '/admin/sla', perm: 'cases:read' },
    { label: 'Integrations', path: '/admin/connectors', perm: 'connectors:manage' },
    { label: 'Notification Templates', path: '/admin/notification-templates', perm: 'notifications:manage' },
    { label: 'Audit & Compliance', path: '/audit', perm: 'audit:read' },
  ] },
];

const base = (p: string) => p.split('?')[0];

function CaseDomainNav({ navigate }: { navigate: (p: string) => void }) {
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  const domainKey = params.get('domain') || domainForType(params.get('type'));
  const domain = domainKey ? CASE_DOMAINS[domainKey] : undefined;
  if (!domain) return null; // plain /cases (e.g. global search) → no scoped tabs

  const type = params.get('type') || '';
  const tabs = [
    { label: 'All', to: `/cases?domain=${domain.key}`, active: !type },
    ...domain.types.map(t => ({ label: t.label, to: `/cases?domain=${domain.key}&type=${t.key}`, active: type === t.key })),
  ];
  const idx = tabs.findIndex(t => t.active);
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, mt: -1 }}>
      <Tabs value={idx < 0 ? false : idx} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        {tabs.map(t => <Tab key={t.to} label={t.label} onClick={() => navigate(t.to)} sx={{ textTransform: 'none', minHeight: 44 }} />)}
      </Tabs>
    </Box>
  );
}

export default function ModuleNav() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { can } = useAccess();
  const full = loc.pathname + loc.search;

  // Cases area: scoped domain tabs (Service / Security / Field), not a flat group.
  if (loc.pathname === '/cases' && can('cases:read')) return <CaseDomainNav navigate={navigate} />;

  const inGroup = (g: ModuleGroup) =>
    g.pages.some(p => loc.pathname === base(p.path) || loc.pathname.startsWith(base(p.path) + '/'));
  const group = GROUPS.find(inGroup);
  if (!group) return null;

  const pages = group.pages.filter(p => can(p.perm));
  if (pages.length <= 1) return null;

  let idx = pages.findIndex(p => p.path === full);
  if (idx < 0) idx = pages.findIndex(p => !p.path.includes('?') && (loc.pathname === base(p.path) || loc.pathname.startsWith(base(p.path) + '/')));

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, mt: -1 }}>
      <Tabs value={idx < 0 ? false : idx} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        {pages.map(p => <Tab key={p.path} label={p.label} onClick={() => navigate(p.path)} sx={{ textTransform: 'none', minHeight: 44 }} />)}
      </Tabs>
    </Box>
  );
}
