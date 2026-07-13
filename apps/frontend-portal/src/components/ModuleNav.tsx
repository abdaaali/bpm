import React from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Box, Tabs, Tab, Chip } from '@mui/material';
import { useAccess } from '../auth/useAccess';
import { useAuth } from '../auth/AuthContext';
import { CASE_DOMAINS, domainForType } from '../config/caseDomains';
import { caseApi } from '../api/client';
import { OPEN_CASE_STATUSES } from '../pages/catalog/ServiceCatalog';

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
  // External Workforce, Process Studio and Governance now have their own
  // sidebar dropdown (see components/Layout.tsx) — a second tab-bar nav
  // surface for them here would be redundant.
  // Administration is likewise NOT listed here — its sidebar dropdown covers it.
];

const base = (p: string) => p.split('?')[0];

function CaseDomainNav() {
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
        {tabs.map(t => <Tab key={t.to} component={RouterLink} to={t.to} label={t.label} sx={{ textTransform: 'none', minHeight: 44 }} />)}
      </Tabs>
    </Box>
  );
}

export default function ModuleNav() {
  const loc = useLocation();
  const { can } = useAccess();
  const { user } = useAuth();
  const full = loc.pathname + loc.search;

  const inGroup = (g: ModuleGroup) =>
    g.pages.some(p => loc.pathname === base(p.path) || loc.pathname.startsWith(base(p.path) + '/'));
  const group = GROUPS.find(inGroup);

  // Hooks must run on every render regardless of which branch below eventually
  // returns — computing this unconditionally avoids a Rules-of-Hooks violation
  // (a conditional useQuery here previously crashed on navigation between route types).
  const { data: myRequestsCount } = useQuery(
    ['module-nav-my-requests-count', user?.id],
    () => caseApi.list({ requesterId: user?.id, status: OPEN_CASE_STATUSES.join(',') }, 1, 1),
    { staleTime: 30_000, enabled: !!user && group?.label === 'Service Catalog' },
  );

  // Cases area: scoped domain tabs (Service / Security / Field), not a flat group.
  if (loc.pathname === '/cases' && can('cases:read')) return <CaseDomainNav />;

  if (!group) return null;

  const pages = group.pages.filter(p => can(p.perm));
  if (pages.length <= 1) return null;

  let idx = pages.findIndex(p => p.path === full);
  if (idx < 0) idx = pages.findIndex(p => !p.path.includes('?') && (loc.pathname === base(p.path) || loc.pathname.startsWith(base(p.path) + '/')));

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, mt: -1 }}>
      <Tabs value={idx < 0 ? false : idx} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        {pages.map(p => (
          <Tab key={p.path} component={RouterLink} to={p.path} sx={{ textTransform: 'none', minHeight: 44 }}
            label={p.label === 'My Requests' && (myRequestsCount?.total ?? 0) > 0
              ? <Box display="flex" alignItems="center" gap={0.75}>{p.label}<Chip label={myRequestsCount!.total} size="small" sx={{ height: 18, fontSize: 11 }} /></Box>
              : p.label} />
        ))}
      </Tabs>
    </Box>
  );
}
