# Frontend-Portal Navigation, Home/Dashboards/Administration Restructure, Process Studio Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure frontend-portal's sidebar into real, expandable links; consolidate Home/Dashboards/Administration around the new structure; and fix three concrete Process Studio defects (diagram not rendering, no BPMN export, no file-upload form field).

**Architecture:** Mostly frontend-portal-only React/MUI changes reusing existing dormant scaffolding (`Layout.tsx`'s unused `Collapse` state) and existing backend primitives (case-service's already-built generic `AttachmentModule`, the report-source registry, the permission-gated admin pages). Three small backend changes: a new `report-sources.ts` registry entries (bpm-orchestrator), a new `is_active` column + check (notification-service), and a new multipart-forwarding controller (api-gateway) to bridge frontend-portal to case-service's existing attachment endpoints.

**Tech Stack:** React 18, MUI 5, react-router-dom v6, react-query, NestJS 10, PostgreSQL, MinIO (via `minio` client), bpmn-js.

## Global Constraints

- Frontend-portal only. Do not modify contractor-portal or mobile-pwa in this plan.
- Every new sidebar/tab link must be a real anchor (`component={Link}` from `react-router-dom`, imported as `RouterLink`) so ctrl/cmd/middle-click opens a new tab — not a bare `onClick={() => navigate(...)}`.
- Never use browser history (`navigate(-1)`) for back-navigation — this codebase's `BackButton.tsx` deliberately always targets a fixed, explicit route (see its own doc-comment). Task 8 is the one narrow exception (a `location.state`-carried "return to caller" for `/processes/analytics` only) — it is not a precedent for any other page.
- `npx tsc --noEmit` must be clean in `apps/frontend-portal` after every frontend task, and in the touched backend service (`services/bpm-orchestrator`, `services/notification-service`, or `services/api-gateway`) after every backend task.
- Do not touch `.superpowers/sdd/progress.md`'s existing RBAC-plan entries — this plan's ledger entries are additive, under a new `=== Plan: 2026-07-13-frontend-nav-home-dashboards-admin-process-studio ===` heading.

---

### Task 1: Sidebar — expandable dropdowns + real links

**Files:**
- Modify: `apps/frontend-portal/src/components/Layout.tsx`

**Interfaces:**
- Produces: a `NavItem.children?: NavChild[]` shape that Task 2 does not consume, but that establishes the pattern Task 3 (Administration route unwrap) assumes is already in place.

**Current state:** `NAV` (lines 58-65) is a flat 4-item list. Each renders as a plain `ListItemButton` with `onClick={() => navigate(item.path)}` — no `href`, so it isn't a real link. `Collapse`, `ExpandLess`, `ExpandMore` are already imported (lines 6, 10-11) and unused; `collapsed` state + `toggleSection()` (lines 75-102) already exist and are unused.

- [ ] **Step 1: Replace the `NavItem` interface and `NAV` array (lines 58-65)**

```tsx
interface NavChild { label: string; path: string; perm?: string; }
interface NavItem { label: string; icon: React.ReactNode; path: string; match: string[]; perm?: string; children?: NavChild[]; }

const NAV: NavItem[] = [
  { label: 'Home', icon: <HomeIcon />, path: '/home', match: ['/home', '/catalog', '/cases'] },
  { label: 'My Work', icon: <WorkIcon />, path: '/workplace', match: ['/workplace', '/inbox', '/tasks', '/requests', '/my-requests'],
    children: [
      { label: 'To Do', path: '/workplace?tab=todo' },
      { label: 'My Requests', path: '/workplace?tab=requests' },
      { label: 'Team Queue', path: '/workplace?tab=team' },
    ] },
  { label: 'Dashboards', icon: <DashboardIcon />, path: '/dashboards', match: ['/dashboards', '/dashboard', '/reports', '/digest', '/rca'], perm: 'cases:read',
    children: [
      { label: 'Operational Dashboard', path: '/dashboard' },
      { label: 'Telecom Operations', path: '/dashboard/operations' },
      { label: 'Process Performance', path: '/processes/analytics', perm: 'processes:read' },
      { label: 'Report Generator', path: '/reports', perm: 'analytics:read' },
      { label: 'Management Digest', path: '/digest', perm: 'analytics:read' },
      { label: 'Root Cause Analysis', path: '/rca', perm: 'rca:read' },
    ] },
  { label: 'Administration', icon: <SettingsIcon />, path: '/admin', match: ['/admin', '/org', '/mdm', '/audit', '/approvals'], perm: 'org:read',
    children: [
      { label: 'Organization', path: '/org' },
      { label: 'Master Data', path: '/mdm', perm: 'mdm:read' },
      { label: 'SLA Policies', path: '/admin/sla' },
      { label: 'Integrations', path: '/admin/connectors', perm: 'connectors:manage' },
      { label: 'Notification Templates', path: '/admin/notification-templates', perm: 'notifications:manage' },
      { label: 'Audit & Compliance', path: '/audit', perm: 'audit:read' },
      { label: 'Operational DataHub', path: '/admin/datahub', perm: 'mdm:read' },
      { label: 'Approval Policies', path: '/approvals/policies', perm: 'approvals:read' },
      { label: 'Approval Instances', path: '/approvals/instances', perm: 'approvals:read' },
    ] },
  { label: 'External Workforce', icon: <EngineeringIcon />, path: '/contractors/companies', match: ['/contractors'], perm: 'contractors:read',
    children: [
      { label: 'Companies', path: '/contractors/companies' },
      { label: 'External Workers', path: '/contractors/users' },
      { label: 'Dispatch', path: '/contractors/dispatch' },
      { label: 'Submission Review', path: '/contractors/review' },
      { label: 'Performance & KPIs', path: '/contractors/dashboard' },
    ] },
  { label: 'Process Studio', icon: <AccountTreeIcon />, path: '/processes', match: ['/processes'], perm: 'processes:read',
    children: [
      { label: 'Studio', path: '/processes' },
      { label: 'Process Monitor', path: '/processes/instances' },
      { label: 'Process Performance', path: '/processes/analytics' },
    ] },
];
```

`EngineeringIcon` and `AccountTreeIcon` are already imported (lines 28, 16) — no new icon imports needed.

- [ ] **Step 2: Add the `Link as RouterLink` import**

Change line 2 from:
```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```
to:
```tsx
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
```

- [ ] **Step 3: Rename `collapsed`/`toggleSection` to `expanded`/`toggleSection` and add a child-active helper**

Replace lines 75-102 (the `collapsed` state + `toggleSection`) with:

```tsx
const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
});
const toggleSection = (label: string) => {
  setExpanded(prev => {
    const next = { ...prev, [label]: !prev[label] };
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
};
```

After `isSelected` (line 112), add:

```tsx
const isChildActive = (c: NavChild) => {
  const [p, q] = c.path.split('?');
  return q ? (location.pathname === p && location.search === `?${q}`)
            : (location.pathname === p || location.pathname.startsWith(p + '/'));
};
```

- [ ] **Step 4: Replace the `<List>` block (lines 207-236) with the dropdown-aware version**

```tsx
<List>
  {NAV.filter(item => can(item.perm)).map(item => {
    const active = isSelected(item);
    const children = (item.children || []).filter(c => can(c.perm));
    const hasChildren = children.length > 0;
    const isOpen = expanded[item.label] ?? active;
    return (
      <ListItem key={item.path} disablePadding sx={{ display: 'block' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <ListItemButton
            selected={active}
            component={RouterLink}
            to={item.path}
            onClick={() => { if (hasChildren) setExpanded(prev => ({ ...prev, [item.label]: true })); }}
            sx={{
              borderRadius: 2, mx: 1, my: 0.25, py: 1.25, flex: 1, position: 'relative', pl: active ? 2.25 : 2,
              '&:hover': { bgcolor: active ? 'rgba(40,86,201,0.14)' : 'rgba(15,23,42,0.045)' },
              '&.Mui-selected': {
                bgcolor: 'rgba(40,86,201,0.1)', color: 'primary.main',
                '& .MuiListItemIcon-root': { color: 'primary.main' },
                '&::before': {
                  content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
                  borderRadius: 3, bgcolor: 'primary.main',
                },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary', transition: 'color 160ms ease' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 15, fontWeight: active ? 700 : 600 }} />
          </ListItemButton>
          {hasChildren && (
            <IconButton size="small" onClick={() => toggleSection(item.label)} sx={{ mr: 1 }}
              aria-label={isOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}>
              {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
        </Box>
        {hasChildren && (
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding dense>
              {children.map(c => {
                const childActive = isChildActive(c);
                return (
                  <ListItemButton key={c.path} component={RouterLink} to={c.path} selected={childActive}
                    sx={{
                      pl: 6.5, py: 0.75, borderRadius: 2, mx: 1, my: 0.15,
                      '&.Mui-selected': { bgcolor: 'rgba(40,86,201,0.08)', color: 'primary.main' },
                    }}>
                    <ListItemText primary={c.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: childActive ? 700 : 500 }} />
                  </ListItemButton>
                );
              })}
            </List>
          </Collapse>
        )}
      </ListItem>
    );
  })}
</List>
```

`IconButton` is already imported (line 5).

- [ ] **Step 5: Verify**

Run `npx tsc --noEmit` in `apps/frontend-portal`. Manually: load the app, confirm all 6 sidebar items render, each with a chevron where it has children; click a parent label → navigates to its default page AND opens its dropdown; click the chevron alone → toggles open/closed without navigating; ctrl-click any item or child → opens in a new tab; navigating to `/admin/sla` directly (typed URL) shows Administration expanded and highlighted with SLA Policies highlighted as the active child.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend-portal/src/components/Layout.tsx
git commit -m "feat: sidebar becomes expandable real links with dropdown sub-navigation"
```

---

### Task 2: ModuleNav — trim redundant groups, convert tabs to real links

**Files:**
- Modify: `apps/frontend-portal/src/components/ModuleNav.tsx`

**Interfaces:**
- Consumes: `CASE_DOMAINS` from `caseDomains.ts` (unchanged export shape; Task 4 changes its content, not its shape).

**Current state:** `GROUPS` (lines 19-44) has 4 groups: Service Catalog, External Workforce, Process Studio, Governance. After Task 1, External Workforce and Process Studio have their own sidebar dropdown, and Governance's two pages moved into the Administration dropdown — so those 3 groups are now redundant secondary nav. `CaseDomainNav`'s tabs (line 64) and the main `Tabs` (lines 103-109) both use `onClick={() => navigate(...)}`, not real links.

- [ ] **Step 1: Trim `GROUPS` to just Service Catalog (lines 19-44)**

```tsx
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
```

- [ ] **Step 2: Add the `Link as RouterLink` import**

Change line 2 from:
```tsx
import { useLocation, useNavigate } from 'react-router-dom';
```
to:
```tsx
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
```

- [ ] **Step 3: Convert `CaseDomainNav`'s tabs to real links (line 64)**

Replace:
```tsx
{tabs.map(t => <Tab key={t.to} label={t.label} onClick={() => navigate(t.to)} sx={{ textTransform: 'none', minHeight: 44 }} />)}
```
with:
```tsx
{tabs.map(t => <Tab key={t.to} component={RouterLink} to={t.to} label={t.label} sx={{ textTransform: 'none', minHeight: 44 }} />)}
```

- [ ] **Step 4: Convert the main group tabs to real links (lines 103-109)**

Replace:
```tsx
{pages.map(p => (
  <Tab key={p.path} onClick={() => navigate(p.path)} sx={{ textTransform: 'none', minHeight: 44 }}
    label={p.label === 'My Requests' && (myRequestsCount?.total ?? 0) > 0
      ? <Box display="flex" alignItems="center" gap={0.75}>{p.label}<Chip label={myRequestsCount!.total} size="small" sx={{ height: 18, fontSize: 11 }} /></Box>
      : p.label} />
))}
```
with:
```tsx
{pages.map(p => (
  <Tab key={p.path} component={RouterLink} to={p.path} sx={{ textTransform: 'none', minHeight: 44 }}
    label={p.label === 'My Requests' && (myRequestsCount?.total ?? 0) > 0
      ? <Box display="flex" alignItems="center" gap={0.75}>{p.label}<Chip label={myRequestsCount!.total} size="small" sx={{ height: 18, fontSize: 11 }} /></Box>
      : p.label} />
))}
```

`navigate` (from `useNavigate`) becomes unused in this file once both call sites are converted — remove the `useNavigate` import and its `const navigate = useNavigate();` (line 72) and drop the now-unused `navigate` param from `CaseDomainNav`'s props (line 48) and its call site (line 91).

- [ ] **Step 5: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open `/catalog`, confirm the Service Catalog tab bar still works and ctrl-click opens a new tab; open `/cases?domain=service`, confirm the 3(→4 after Task 4) domain tabs are real links.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend-portal/src/components/ModuleNav.tsx
git commit -m "refactor: trim ModuleNav groups now covered by sidebar dropdowns, convert tabs to real links"
```

---

### Task 3: Retire AdminLayout — sidebar dropdown replaces its nav box

**Files:**
- Modify: `apps/frontend-portal/src/App.tsx`
- Delete: `apps/frontend-portal/src/components/AdminLayout.tsx`

**Current state:** `AdminLayout` renders its own persistent left nav box (reading `ADMINISTRATION` from `Launcher.tsx`) beside its children, for exactly 6 routes: `/org`, `/mdm`, `/audit`, `/admin/sla`, `/admin/connectors`, `/admin/notification-templates` (`/admin/datahub`, `/approvals/policies`, `/approvals/instances` are already plain unwrapped routes). Task 1's Administration sidebar dropdown now does this job at the top level, so `AdminLayout`'s nav box is redundant screen real estate.

- [ ] **Step 1: Unwrap the 6 `AdminLayout`-wrapped routes in `App.tsx`**

Replace lines 92-97:
```tsx
<Route path="/org" element={<AdminLayout><OrgStructure /></AdminLayout>} />
<Route path="/mdm" element={<AdminLayout><MdmPage /></AdminLayout>} />
<Route path="/audit" element={<AdminLayout><AuditLog /></AdminLayout>} />
<Route path="/admin/sla" element={<AdminLayout><SlaPolicies /></AdminLayout>} />
<Route path="/admin/connectors" element={<AdminLayout><ConnectorAdmin /></AdminLayout>} />
<Route path="/admin/notification-templates" element={<AdminLayout><NotificationTemplates /></AdminLayout>} />
```
with:
```tsx
<Route path="/org" element={<OrgStructure />} />
<Route path="/mdm" element={<MdmPage />} />
<Route path="/audit" element={<AuditLog />} />
<Route path="/admin/sla" element={<SlaPolicies />} />
<Route path="/admin/connectors" element={<ConnectorAdmin />} />
<Route path="/admin/notification-templates" element={<NotificationTemplates />} />
```

- [ ] **Step 2: Remove the now-unused import**

Delete line 31: `import AdminLayout from './components/AdminLayout';`

- [ ] **Step 3: Delete the file**

```bash
rm apps/frontend-portal/src/components/AdminLayout.tsx
```

- [ ] **Step 4: Verify**

`npx tsc --noEmit` in `apps/frontend-portal` (confirms nothing else imports `AdminLayout` — if it does, `grep -rn "AdminLayout" apps/frontend-portal/src` first and resolve before deleting). Manually: open each of the 6 admin pages, confirm they render full-width with no orphaned left nav box, and that Administration's sidebar dropdown (Task 1) is the only nav surface for them.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend-portal/src/App.tsx
git rm apps/frontend-portal/src/components/AdminLayout.tsx
git commit -m "refactor: remove AdminLayout's nav box, superseded by the Administration sidebar dropdown"
```

---

### Task 4: Unify the case-type taxonomy (fixes a real data gap)

**Files:**
- Modify: `apps/frontend-portal/src/config/caseDomains.ts`

**Interfaces:**
- Produces: `CASE_DOMAINS` gains a 4th key `itsm`; `service`'s `change` type moves to `itsm`. `typeKeysForDomain`, `domainForType`, `labelForType` signatures are unchanged — callers (`CaseList.tsx`, `ModuleNav.tsx`'s `CaseDomainNav`) need no changes.

**Current state:** `CASE_DOMAINS` has 3 domains (service/security/field, `change` inside `service`). `CreateCase.tsx`'s `TYPE_CONFIGS`/`TYPE_GROUPS` has 4 groups (Service Operations/IT Service Management/Security Operations/Field & Logistics), with `change` in "IT Service Management" alongside `request` and `alarm` — types that don't exist in `CASE_DOMAINS` at all today, so cases of type `request`/`alarm` are invisible in any domain-scoped case view.

- [ ] **Step 1: Replace `CASE_DOMAINS` (lines 10-39)**

```tsx
export const CASE_DOMAINS: Record<string, CaseDomain> = {
  service: {
    key: 'service',
    label: 'Service Operations',
    types: [
      { key: 'incident', label: 'Incidents' },
      { key: 'fault',    label: 'Faults' },
      { key: 'problem',  label: 'Problems' },
      { key: 'pdt',      label: 'Performance' },
    ],
  },
  itsm: {
    key: 'itsm',
    label: 'IT Service Management',
    types: [
      { key: 'change',  label: 'Changes' },
      { key: 'request', label: 'Service Requests' },
      { key: 'alarm',   label: 'Alarms' },
    ],
  },
  security: {
    key: 'security',
    label: 'Security Operations',
    types: [
      { key: 'theft',          label: 'Theft' },
      { key: 'security_audit', label: 'Security Audits' },
    ],
  },
  field: {
    key: 'field',
    label: 'Field & Logistics',
    types: [
      { key: 'asset_movement', label: 'Asset Movements' },
      { key: 'convoy',         label: 'Convoys' },
      { key: 'spare_part',     label: 'Spare Parts' },
    ],
  },
};
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open `/cases?domain=itsm`, confirm the tab bar shows All/Changes/Service Requests/Alarms and each filters correctly; open `/cases?type=request`, confirm it resolves to the `itsm` domain (via `domainForType`) rather than showing no scoped tabs.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend-portal/src/config/caseDomains.ts
git commit -m "fix: add missing IT Service Management case domain (change/request/alarm were unreachable via any domain-scoped view)"
```

---

### Task 5: Home page restructure

**Files:**
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx`

**Interfaces:**
- Consumes: Task 4's 4-domain `CASE_DOMAINS` (via the new "Operations" tile's target URL).

**Current state:** `APPLICATIONS` (lines 34-45) has 10 tiles. `WorkplaceSummary`'s whole card is one link to `/workplace` (line 118) with 3 non-clickable `KPIStatCard`s inside. `HomePage`'s quick-create button says "New Request" (line 155) and the `TileGrid title="Applications"` (line 160) renders all 10 tiles in a grid.

- [ ] **Step 1: Replace `APPLICATIONS` (lines 34-45) with a single-tile array**

```tsx
export const APPLICATIONS: Tile[] = [
  { title: 'Operations', desc: 'Service, IT, security and field & logistics cases — one place', icon: <ListAltIcon />, path: '/cases?domain=service', color: '#455a64', perm: 'cases:read' },
];
```

Remove these now-fully-unused icon imports: `SecurityIcon`, `LocalShippingIcon`, `EngineeringIcon`, `AccountTreeIcon`, `StorageIcon`, `VerifiedUserIcon`. Keep `StoreIcon` and `BugReportIcon` (still used by `HomePage`'s quick-create buttons), `ListAltIcon` (used by the new `APPLICATIONS` tile above), and `PsychologyIcon` (still used — Task 7 adds it to `DASHBOARDS`).

- [ ] **Step 2: Make `WorkplaceSummary`'s 3 KPI cards individually clickable (lines 101-140)**

Replace the `CardActionArea` wrapping the whole card (line 118) and the 3 `Grid item`s (lines 127-135):

```tsx
return (
  <Card sx={{ mb: 3 }}>
    <Box sx={{ p: 2.5 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" fontWeight={700}>My Workplace</Typography>
        <Box display="flex" alignItems="center" gap={0.5} color="primary.main" sx={{ cursor: 'pointer' }} onClick={() => navigate('/workplace')}>
          <Typography variant="body2" fontWeight={600}>Go to My Workplace</Typography>
          <ChevronRightIcon fontSize="small" />
        </Box>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4} sx={{ cursor: 'pointer' }} onClick={() => navigate('/workplace?tab=todo')}>
          <KPIStatCard label="To Do" value={toDoCount} color="#2856c9" />
        </Grid>
        <Grid item xs={12} sm={4} sx={{ cursor: 'pointer' }} onClick={() => navigate('/workplace?tab=requests')}>
          <KPIStatCard label="My Requests" value={myRequestsData?.total ?? 0} color="#1b7a4a" />
        </Grid>
        <Grid item xs={12} sm={4} sx={{ cursor: 'pointer' }} onClick={() => navigate('/workplace?tab=team')}>
          <KPIStatCard label="Team Queue" value={teamCases.length} color="#b5760f" />
        </Grid>
      </Grid>
    </Box>
  </Card>
);
```

- [ ] **Step 3: Rename the quick-create button and simplify `HomePage`'s tile section (lines 142-163)**

Replace line 155:
```tsx
<Button variant="outlined" size="large" startIcon={<StoreIcon />} onClick={() => navigate('/catalog')}>New Request</Button>
```
with:
```tsx
<Button variant="outlined" size="large" startIcon={<StoreIcon />} onClick={() => navigate('/catalog')}>Service Request</Button>
```

Replace line 160 (`<TileGrid title="Applications" tiles={APPLICATIONS} />`) with a direct single-card render matching `TileGrid`'s own `Card`/`CardActionArea` styling, since a 1-tile grid section reads oddly:

```tsx
{APPLICATIONS.filter(t => can(t.perm)).map(t => (
  <Card key={t.title} sx={{
    position: 'relative', overflow: 'hidden', maxWidth: 420,
    transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
    '&:hover': { boxShadow: '0 12px 28px rgba(15,23,42,0.14)', transform: 'translateY(-3px)', borderColor: `${t.color}55` },
    '&:hover .tile-arrow': { opacity: 1, transform: 'translateX(0)' },
  }}>
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: t.color }} />
    <CardActionArea sx={{ p: 2.75 }} onClick={() => navigate(t.path)}>
      <Box display="flex" alignItems="center" gap={1.5} mb={1.25}>
        <Avatar variant="rounded" sx={{ bgcolor: t.color, width: 46, height: 46, boxShadow: `0 4px 12px ${t.color}4d` }}>{t.icon}</Avatar>
        <Typography variant="h6" fontWeight={700} flex={1}>{t.title}</Typography>
        <ChevronRightIcon className="tile-arrow" sx={{ color: t.color, opacity: 0, transform: 'translateX(-4px)', transition: 'opacity 200ms ease, transform 200ms ease' }} />
      </Box>
      <Typography variant="body2" color="text.secondary">{t.desc}</Typography>
    </CardActionArea>
  </Card>
))}
```

This needs `useAccess` in `HomePage` — add `const { can } = useAccess();` (import already exists at line 25 for the module) alongside the existing `const { user } = useAuth();` in `HomePage`.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: load `/home`, confirm the button reads "Service Request", the Applications tile grid is gone in favor of a single "Operations" card, and each of the 3 My Workplace KPI numbers navigates to its own Workplace tab.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend-portal/src/pages/launcher/Launcher.tsx
git commit -m "feat: consolidate Home into one Operations card, per-tab Workplace KPI links, rename quick-create button"
```

---

### Task 6: New Case back button targets Home

**Files:**
- Modify: `apps/frontend-portal/src/pages/cases/CreateCase.tsx`

**Current state:** grep the file for `BackButton` — it currently targets `/cases`. Since Task 5 removes `/cases` as a standalone Home destination (it's now reached only through the "Operations" card), the cancel/back target should be `/home`.

- [ ] **Step 1: Update the `BackButton` (line 240)**

Replace:
```tsx
<BackButton to="/cases" label="Back to Cases" sx={{ mb: 2 }} />
```
with:
```tsx
<BackButton to="/home" label="Back to Home" sx={{ mb: 2 }} />
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open `/cases/new`, click Back, confirm it lands on `/home`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend-portal/src/pages/cases/CreateCase.tsx
git commit -m "fix: New Case back button returns to Home now that Cases is no longer a standalone Home destination"
```

---

### Task 7: Dashboard header cleanup + RCA tile

**Files:**
- Modify: `apps/frontend-portal/src/pages/dashboard/Dashboard.tsx`
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx`

**Current state:** `Dashboard.tsx`'s header (lines 122-139) has a title/subtitle block plus "My Workplace" and "Full Analytics" buttons. `DASHBOARDS` (`Launcher.tsx` lines 47-53) has 5 tiles, no RCA.

- [ ] **Step 1: Remove the header buttons in `Dashboard.tsx` (lines 129-138)**

Replace:
```tsx
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<AssignmentIcon />} onClick={() => navigate('/workplace')}>
            My Workplace
          </Button>
          {isDesigner && (
            <Button variant="contained" startIcon={<BarChartIcon />} onClick={() => navigate('/processes/analytics')}>
              Full Analytics
            </Button>
          )}
        </Box>
```
with nothing (delete the `Box` entirely — the header's `justifyContent="space-between"` on the parent `Box` at line 122 still works correctly with only the title block as a child).

Remove the now-unused `BarChartIcon` import (line 18) — confirm with `grep -n "BarChartIcon" apps/frontend-portal/src/pages/dashboard/Dashboard.tsx` that no other usage remains before deleting. `AssignmentIcon` stays imported (still used at "Pending Pool Tasks", around line 533).

- [ ] **Step 2: Add an RCA tile to `DASHBOARDS` in `Launcher.tsx` (after line 52)**

```tsx
{ title: 'Root Cause Analysis', desc: 'RCA dashboards and taxonomy', icon: <PsychologyIcon />, path: '/rca', color: '#5d4037', perm: 'rca:read' },
```

`PsychologyIcon` is already imported in `Launcher.tsx` (line 12).

- [ ] **Step 3: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open `/dashboard`, confirm only the back button remains in the header (SLA banner and any "Full Analytics" links further down the page are untouched); open `/dashboards`, confirm Root Cause Analysis appears as a 6th tile.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend-portal/src/pages/dashboard/Dashboard.tsx apps/frontend-portal/src/pages/launcher/Launcher.tsx
git commit -m "feat: trim Operational Dashboard header to back-only, add RCA to the Dashboards tile grid"
```

---

### Task 8: Process Performance — return to caller

**Files:**
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessAnalytics.tsx`
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx`
- Modify: `apps/frontend-portal/src/components/Layout.tsx` (the Process Performance child link added in Task 1)

**Current state:** `ProcessAnalytics.tsx`'s `BackButton` (line 58) is hardcoded `to="/processes"`. It's now reachable from 3 places: the Dashboards tile grid (`Launcher.tsx`), the Dashboards sidebar dropdown, and the Process Studio sidebar dropdown (both added in Task 1) — plus directly from inside Process Studio's own `ModuleNav` tab (unchanged). A single fixed back target is wrong for the Dashboards-originated visits.

- [ ] **Step 1: Every entry point passes where it came from via router state**

In `Launcher.tsx`'s `DASHBOARDS` array, `Process Performance`'s tile uses the shared `TileGrid`/`onClick={() => navigate(t.path)}` mechanism, which doesn't carry state per-tile today. Rather than special-case `TileGrid`, keep `ProcessAnalytics.tsx`'s fallback (`/processes`) as correct for the Process-Studio-dropdown and tile-grid entry points (both conceptually "process area" origins), and add state only where a genuinely different origin exists: the **Dashboards sidebar dropdown child** added in Task 1. In `Layout.tsx`, change the Dashboards group's Process Performance child navigation to carry state — since `ListItemButton component={RouterLink} to={...}` doesn't support a `state` prop directly through `to` as a string, change that one child's `to` to a `{ pathname, state }` object:

```tsx
to={c.path === '/processes/analytics' ? { pathname: c.path, state: { from: '/dashboards' } } : c.path}
```

Apply this inline in the `children.map` render from Task 1 Step 4 (the `<ListItemButton key={c.path} component={RouterLink} to={c.path} ...>` line) — replace `to={c.path}` with the expression above.

- [ ] **Step 2: `ProcessAnalytics.tsx` reads `location.state?.from`**

Add `useLocation` to the import (line 2 already imports `useNavigate` — check and extend):
```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```
Add inside the component, after `const navigate = useNavigate();` (line 29):
```tsx
const location = useLocation();
const backTo = (location.state as { from?: string } | null)?.from || '/processes';
```
Replace line 58:
```tsx
<BackButton to="/processes" label="Back to Process Studio" sx={{ mb: 1 }} />
```
with:
```tsx
<BackButton to={backTo} label={backTo === '/dashboards' ? 'Back to Dashboards' : 'Back to Process Studio'} sx={{ mb: 1 }} />
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open Process Performance from the Dashboards sidebar dropdown, confirm the back button says "Back to Dashboards" and lands on `/dashboards`; open it from the Process Studio sidebar dropdown or the Dashboards tile grid, confirm it still says "Back to Process Studio" and lands on `/processes` (today's behavior, unchanged for those two entry points); open `/processes/analytics` directly by URL, confirm it falls back to "Back to Process Studio" / `/processes` with no crash on missing state.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend-portal/src/pages/process-studio/ProcessAnalytics.tsx apps/frontend-portal/src/components/Layout.tsx
git commit -m "feat: Process Performance's back button returns to Dashboards when opened from there"
```

---

### Task 9: Report Generator — root-cause and CAPA columns

**Files:**
- Modify: `services/bpm-orchestrator/src/reports/report-sources.ts`

**Interfaces:**
- Produces: two new `REPORT_SOURCES` keys, `rca` and `capa`. No frontend change — `ReportBuilder.tsx` is 100% metadata-driven off `GET /reports/sources`.

**Current state:** The `cases` table already has `root_cause_category`/`root_cause_subcategory`/`root_cause_description`/`is_recurring` columns (migration `011_rca_taxonomy.sql`) not yet exposed as report columns. `rca_records` (one row per case, `UNIQUE(case_id)`) and `capa_actions` (many rows per case) exist (migration `030_rca_capa.sql`) but aren't in the registry at all. `cases`' existing `type` column is already `filterable` (no `filterable: false` set), so "filter by case type" already works once these columns exist — no filter-mechanism change needed.

**Decision:** do NOT `LEFT JOIN capa_actions` into the existing `cases` source — `capa_actions` is one-to-many per case, so joining it there would fan out and duplicate case rows in every cases report. Add `rca` (one-to-one with `cases`, safe to join) and a separate `capa` source (one-to-many, its own primary table) instead.

- [ ] **Step 1: Add 4 columns to the existing `cases` source**

In `REPORT_SOURCES.cases.columns` (after the `subcategory` column, around line 54):
```tsx
      { key: 'root_cause_category',    label: 'Root Cause Category',    expr: 'c.root_cause_category',    type: 'string' },
      { key: 'root_cause_subcategory', label: 'Root Cause Subcategory', expr: 'c.root_cause_subcategory', type: 'string' },
      { key: 'root_cause_description', label: 'Root Cause Description', expr: 'c.root_cause_description', type: 'string' },
      { key: 'is_recurring',           label: 'Recurring',              expr: 'c.is_recurring',           type: 'bool' },
```

- [ ] **Step 2: Add the `rca` and `capa` sources**

After the `tasks` source (after line 118, before the closing `};`):
```tsx

  rca: {
    key: 'rca',
    label: 'Root Cause Analysis',
    alias: 'r',
    from: `rca_records r
      JOIN cases c        ON c.id = r.case_id
      LEFT JOIN users cb  ON cb.id = r.created_by
      LEFT JOIN users rb  ON rb.id = r.reviewed_by`,
    defaultOrder: 'r.created_at DESC',
    defaultColumns: ['case_number', 'case_type', 'method', 'root_cause_statement', 'status', 'created_at'],
    columns: [
      { key: 'case_number',          label: 'Case #',                expr: 'c.case_number',          type: 'string' },
      { key: 'case_type',            label: 'Case Type',             expr: 'c.type',                 type: 'string' },
      { key: 'method',               label: 'Method',                expr: 'r.method',               type: 'string' },
      { key: 'summary',              label: 'Summary',                expr: 'r.summary',              type: 'string' },
      { key: 'root_cause_statement', label: 'Root Cause Statement',   expr: 'r.root_cause_statement', type: 'string' },
      { key: 'status',               label: 'Status',                 expr: 'r.status',               type: 'string' },
      { key: 'created_by',           label: 'Created By',             expr: fullName('cb'),           type: 'string' },
      { key: 'reviewed_by',          label: 'Reviewed By',            expr: fullName('rb'),           type: 'string' },
      { key: 'created_at',           label: 'Created At',             expr: 'r.created_at',           type: 'date' },
      { key: 'updated_at',           label: 'Updated At',             expr: 'r.updated_at',           type: 'date' },
    ],
  },

  capa: {
    key: 'capa',
    label: 'CAPA Actions',
    alias: 'a',
    from: `capa_actions a
      JOIN cases c        ON c.id = a.case_id
      LEFT JOIN users ow  ON ow.id = a.owner_id
      LEFT JOIN users vb  ON vb.id = a.verified_by`,
    defaultOrder: 'a.created_at DESC',
    defaultColumns: ['case_number', 'action_type', 'description', 'owner', 'status', 'due_at'],
    columns: [
      { key: 'case_number',         label: 'Case #',              expr: 'c.case_number',        type: 'string' },
      { key: 'case_type',           label: 'Case Type',           expr: 'c.type',                type: 'string' },
      { key: 'action_type',         label: 'Action Type',         expr: 'a.action_type',         type: 'string' },
      { key: 'description',         label: 'Description',         expr: 'a.description',         type: 'string' },
      { key: 'owner',               label: 'Owner',                expr: fullName('ow'),          type: 'string' },
      { key: 'status',              label: 'Status',               expr: 'a.status',              type: 'string' },
      { key: 'due_at',              label: 'Due At',               expr: 'a.due_at',              type: 'date' },
      { key: 'effectiveness',       label: 'Effectiveness',        expr: 'a.effectiveness',       type: 'string' },
      { key: 'effectiveness_notes', label: 'Effectiveness Notes',  expr: 'a.effectiveness_notes', type: 'string' },
      { key: 'verified_by',         label: 'Verified By',          expr: fullName('vb'),          type: 'string' },
      { key: 'created_at',          label: 'Created At',           expr: 'a.created_at',          type: 'date' },
    ],
  },
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` in `services/bpm-orchestrator`. Rebuild/restart `bpm-orchestrator`, then `curl` (or open Report Generator in the browser) `GET /api/v1/reports/sources` and confirm `cases` now lists the 4 new columns and `rca`/`capa` appear as new sources; build a report against `rca` filtered by `case_type` and confirm it returns rows with no duplication; build one against `capa` and confirm each CAPA action is its own row (not fanned out against unrelated case columns).

- [ ] **Step 4: Commit**

```bash
git add services/bpm-orchestrator/src/reports/report-sources.ts
git commit -m "feat: expose root-cause and CAPA data as new report sources/columns"
```

---

### Task 10: Notification Templates — activate/deactivate

**Files:**
- Create: `infra/db/migrations/041_notification_template_active.sql`
- Modify: `services/notification-service/src/template/template.service.ts`
- Modify: `services/notification-service/src/notification/notification.service.ts`
- Modify: `apps/frontend-portal/src/pages/admin/NotificationTemplates.tsx`

**Interfaces:**
- Produces: `TemplateService.render()` return type gains `isActive: boolean`; `NotificationService.send()` short-circuits (no insert, no email) when `isActive` is false.

**Current state:** latest migration is `040_gateway_join_state.sql`. No active/inactive concept exists anywhere in the stack. `notifications:manage` (already gating the whole admin page's tile visibility in `Launcher.tsx`) is reused as-is — no new permission is introduced, matching the "assignable to managers/team leaders" ask since `manager` already holds that permission.

- [ ] **Step 1: Migration**

```sql
-- Migration 041: Notification template activate/deactivate
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
```

Apply live to the running dev database (seed-file changes do NOT retroactively apply to an already-initialized Postgres volume — see this repo's own precedent):
```bash
docker exec bpm-postgres psql -U bpm -d bpm -c "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;"
```
(Adjust the container name / `-U`/`-d` flags to match `infra/docker-compose.yml` if different — check with `docker ps` and the compose file's `POSTGRES_USER`/`POSTGRES_DB` first.)

- [ ] **Step 2: `TemplateService` — select, persist, and surface `is_active`**

In `findAll` (line 22-28), add `is_active` to the `SELECT`:
```ts
  async findAll(tenantId: string) {
    const r = await this.db.query(
      `SELECT id, name, slug, channel, subject, is_active, created_at FROM notification_templates WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return r.rows;
  }
```

In `render` (lines 39-51), return `isActive`:
```ts
  async render(tenantId: string, slug: string, variables: Record<string, any>): Promise<{ subject: string; body: string; channel: string; isActive: boolean }> {
    const tpl = await this.findBySlug(tenantId, slug);
    const cacheKey = `${tpl.id}:${tpl.updated_at}`;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, Handlebars.compile(tpl.body));
    }
    const subjectTpl = Handlebars.compile(tpl.subject || '');
    return {
      subject: subjectTpl(variables),
      body: this.cache.get(cacheKey)!(variables),
      channel: tpl.channel,
      isActive: tpl.is_active,
    };
  }
```

In `upsert` (lines 53-64), persist `is_active`:
```ts
  async upsert(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      `INSERT INTO notification_templates(tenant_id, name, slug, channel, subject, body, is_active)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(tenant_id,slug) DO UPDATE SET name=EXCLUDED.name, channel=EXCLUDED.channel,
         subject=EXCLUDED.subject, body=EXCLUDED.body, is_active=EXCLUDED.is_active, updated_at=NOW()
       RETURNING *`,
      [tenantId, dto.name, dto.slug, dto.channel || 'in_app', dto.subject || '', dto.body, dto.is_active ?? true],
    );
    this.cache.clear(); // clear render cache
    return r.rows[0];
  }
```

- [ ] **Step 3: `NotificationService.send()` — suppress delivery for inactive templates**

Replace lines 40-51:
```ts
  async send(dto: SendNotificationDto): Promise<void> {
    let rendered: { subject: string; body: string; channel: string; isActive: boolean };
    try {
      rendered = await this.templateSvc.render(dto.tenantId, dto.templateSlug, dto.variables);
    } catch (e) {
      this.logger.warn(`Template '${dto.templateSlug}' not found — using fallback`);
      rendered = {
        subject: dto.variables.subject || 'BPM Notification',
        body: JSON.stringify(dto.variables),
        channel: 'in_app',
        isActive: true,
      };
    }

    if (!rendered.isActive) {
      this.logger.log(`Template '${dto.templateSlug}' is deactivated — notification suppressed`);
      return;
    }

```
(keep the rest of the method — the `db.query` INSERT and email block — unchanged below this point.)

- [ ] **Step 4: Frontend toggle**

In `NotificationTemplates.tsx`, add `Switch` to the MUI import (line 3-7):
```tsx
import {
  Box, Typography, Grid, Card, CardContent, List, ListItemButton, ListItemText,
  TextField, Select, MenuItem, FormControl, InputLabel, Button, Chip, Divider,
  Snackbar, Alert, CircularProgress, Tooltip, Paper, Switch, FormControlLabel,
} from '@mui/material';
```

Extend the form state's default and load effect (lines 67, 82):
```tsx
const [form, setForm] = useState({ name: '', channel: 'in_app', subject: '', body: '', is_active: true });
```
```tsx
useEffect(() => {
  if (current) setForm({ name: current.name || '', channel: current.channel || 'in_app', subject: current.subject || '', body: current.body || '', is_active: current.is_active ?? true });
}, [current?.id, current?.slug]);
```

Extend `dirty` (line 98):
```tsx
const dirty = current && (form.name !== current.name || form.channel !== current.channel || form.subject !== current.subject || form.body !== current.body || form.is_active !== (current.is_active ?? true));
```

Extend the Reset handler (line 166):
```tsx
<Button disabled={!dirty} onClick={() => current && setForm({ name: current.name, channel: current.channel, subject: current.subject, body: current.body, is_active: current.is_active ?? true })}>
```

Add the Switch to the editor form (after the Channel `FormControl`, before the Subject `TextField`, around line 148):
```tsx
                <FormControlLabel
                  control={<Switch checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />}
                  label={form.is_active ? 'Active' : 'Inactive (delivery suppressed)'}
                />
```

Add an "Inactive" indicator chip to each list row (after the existing channel `Chip`, around line 128):
```tsx
                  {!t.is_active && <Chip size="small" label="Inactive" variant="outlined" sx={{ height: 20, ml: 0.5 }} />}
```

- [ ] **Step 5: Verify**

`npx tsc --noEmit` in both `services/notification-service` and `apps/frontend-portal`. Rebuild/restart `notification-service`. Manually: open Notification Templates, toggle a template Inactive, Save, confirm the list shows the "Inactive" chip; trigger an event that fires that template (or call the `send` path directly in a test) and confirm no `notifications` row is inserted and no email is sent while inactive; toggle it back Active and confirm delivery resumes.

- [ ] **Step 6: Commit**

```bash
git add infra/db/migrations/041_notification_template_active.sql services/notification-service/src/template/template.service.ts services/notification-service/src/notification/notification.service.ts apps/frontend-portal/src/pages/admin/NotificationTemplates.tsx
git commit -m "feat: add activate/deactivate control to notification templates, suppressing delivery when inactive"
```

---

### Task 11: Process Studio — fix diagram not rendering

**Files:**
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx`

**Current state:** the `Modeler` mount effect's `importXML(...).then(...)` (lines 407-414) never calls `canvas.zoom('fit-viewport')`. `ProcessInstanceDetail.tsx`'s read-only viewer does exactly this after its own `importXML` (its lines 269-273) and does not have the rendering bug — this is the root cause, confirmed by direct comparison.

- [ ] **Step 1: Add the fit-viewport call**

Replace lines 407-414:
```tsx
      m.importXML(xmlToLoad)
        .then(() => {
          // Baseline validation so the Publish button's disabled state is
          // known immediately, without forcing a manual Checks click first.
          runValidation();
          modelerRef.current?.get('eventBus').on('commandStack.changed', () => setDirty(true));
        })
        .catch((e: any) => setInitError(e.message));
```
with:
```tsx
      m.importXML(xmlToLoad)
        .then(() => {
          // importXML does not auto-fit the viewport — without this, imported
          // diagrams (especially Flowable's auto-generated BFS layout) can
          // render entirely outside the visible canvas area.
          (m.get('canvas') as any).zoom('fit-viewport', 'auto');
          // Baseline validation so the Publish button's disabled state is
          // known immediately, without forcing a manual Checks click first.
          runValidation();
          modelerRef.current?.get('eventBus').on('commandStack.changed', () => setDirty(true));
        })
        .catch((e: any) => setInitError(e.message));
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open several existing processes in Process Studio (including at least one that previously failed to render — reproduce the bug first on the current `main` if unsure which ones, by opening each process and checking whether shapes are visible without manual scroll/zoom), confirm the diagram is now visibly centered and fit to the canvas on open every time.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx
git commit -m "fix: Process Studio diagram not rendering — missing fit-viewport call after importXML"
```

---

### Task 12: Process Studio — Export BPMN

**Files:**
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx`

**Current state:** `modelerRef.current.saveXML({ format: true })` is already used twice (lines 318, 332 — `runValidation` and `save`), so exporting the current canvas state is a matter of reusing the same call and triggering a client-side download.

- [ ] **Step 1: Add an `exportBpmn` handler**

After the `publish` mutation (after line 374, before the mount `useEffect`):
```tsx
  const exportBpmn = async () => {
    if (!modelerRef.current) return;
    const { xml } = await modelerRef.current.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.slug || 'process'}-v${def.version}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  };
```

- [ ] **Step 2: Add the toolbar button and import `DownloadIcon`**

Add to the icon imports (near `import SaveIcon from '@mui/icons-material/Save';`, line 10):
```tsx
import DownloadIcon from '@mui/icons-material/Download';
```

In the toolbar `Box` (after the Save `Tooltip`/`Button`, before the Publish block — after line 458):
```tsx
          <Tooltip title="Download the current canvas as a .bpmn file">
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportBpmn}>
              Export BPMN
            </Button>
          </Tooltip>
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`. Manually: open a process, click Export BPMN, confirm a `.bpmn` file downloads with the expected filename and that opening it (e.g. re-importing into Process Studio via a new process, or inspecting the XML text) shows valid BPMN matching the canvas, including any unsaved edits.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx
git commit -m "feat: add Export BPMN button to Process Studio toolbar"
```

---

### Task 13: File-upload form field, end to end

**Files:**
- Modify: `services/bpm-orchestrator/src/engine/validation.ts`
- Modify: `apps/frontend-portal/src/pages/process-studio/PropertiesPanel.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/startFormHelpers.tsx`
- Create: `services/api-gateway/src/case/attachment.controller.ts`
- Modify: `services/api-gateway/src/case/case.module.ts`
- Modify: `services/api-gateway/package.json` (add `form-data` dependency)
- Modify: `apps/frontend-portal/src/api/client.ts`
- Modify: `apps/frontend-portal/src/pages/cases/CaseDetail.tsx`

**Interfaces:**
- Produces: `attachmentApi.{list,upload,getUrl,remove}` in `client.ts`, consumed by both `startFormHelpers.tsx`'s `DynField` (task/case forms) and `CaseDetail.tsx`'s new Attachments tab.

**Current state:** `'file'` is not a supported form-field type anywhere (`validation.ts`'s `SUPPORTED_FORM_FIELD_TYPES` — text/textarea/number/date/select/checkbox only; `PropertiesPanel.tsx`'s `FormField['type']` union; `startFormHelpers.tsx`'s `FieldDef['type']` union and `DynField`). case-service already has a fully working, generic, entity-agnostic attachment backend (`case-service/src/attachment` — MinIO + Postgres `attachments` table, already migrated in `004_cases.sql`, already registered in `case-service`'s `app.module.ts`) that nothing in frontend-portal calls today. The api-gateway's `ProxyService.forward()` hardcodes `Content-Type: application/json`, so it cannot pass through a multipart upload — a dedicated multipart-aware controller is needed at the gateway.

- [ ] **Step 1: Backend — allow `'file'` as a supported field type**

In `services/bpm-orchestrator/src/engine/validation.ts` (line 51):
```ts
export const SUPPORTED_FORM_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'file']);
```

- [ ] **Step 2: Studio — allow authoring a `'file'` field**

In `PropertiesPanel.tsx`, extend the type union (line 20):
```ts
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'file';
```
Add a menu option to the type `Select` (after line 274, before the closing `</Select>`):
```tsx
                  <MenuItem value="file">File Upload</MenuItem>
```

- [ ] **Step 3: `form-data` dependency for the gateway**

```bash
cd services/api-gateway && npm install form-data
```

- [ ] **Step 4: api-gateway — multipart-forwarding attachment controller**

Create `services/api-gateway/src/case/attachment.controller.ts`:
```ts
import { Controller, Get, Post, Delete, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import axios from 'axios';
import FormData from 'form-data';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';

const CASE_URL = () => process.env.CASE_SERVICE_URL || 'http://case-service:3004';

function hdrs(req: any) {
  return {
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
  };
}

// Bridges frontend-portal to case-service's existing generic attachment
// endpoints. A dedicated controller (not ProxyService.forward, which
// hardcodes Content-Type: application/json) because multipart uploads need
// the file re-packaged into a fresh multipart body for the upstream request.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/attachments')
export class AttachmentController {
  @Get(':entityType/:entityId')
  @RequirePermission('cases:read')
  async list(@Req() req: any, @Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    const res = await axios.get(`${CASE_URL()}/api/${entityType}/${entityId}/attachments`, { headers: hdrs(req) });
    return res.data;
  }

  @Post(':entityType/:entityId')
  @RequirePermission('cases:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @Req() req: any,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const form = new FormData();
    form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const res = await axios.post(`${CASE_URL()}/api/${entityType}/${entityId}/attachments`, form, {
      headers: { ...hdrs(req), ...form.getHeaders() },
    });
    return res.data;
  }

  @Get('file/:id/url')
  @RequirePermission('cases:read')
  async presign(@Req() req: any, @Param('id') id: string) {
    const res = await axios.get(`${CASE_URL()}/api/attachments/${id}/url`, { headers: hdrs(req) });
    return res.data;
  }

  @Delete('file/:id')
  @RequirePermission('cases:update')
  async remove(@Req() req: any, @Param('id') id: string) {
    const res = await axios.delete(`${CASE_URL()}/api/attachments/${id}`, { headers: hdrs(req) });
    return res.data;
  }
}
```

Register it in `services/api-gateway/src/case/case.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CaseController } from './case.controller';
import { AttachmentController } from './attachment.controller';

@Module({ controllers: [CaseController, AttachmentController] })
export class CaseModule {}
```

- [ ] **Step 5: Frontend API client**

In `apps/frontend-portal/src/api/client.ts`, add near `caseApi` (after its closing `};`):
```ts
export const attachmentApi = {
  list:   (entityType: string, entityId: string) => axios.get(`${BASE}/attachments/${entityType}/${entityId}`, { headers: headers() }).then(r => r.data),
  upload: (entityType: string, entityId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return axios.post(`${BASE}/attachments/${entityType}/${entityId}`, form, {
      headers: { ...headers(), 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  getUrl: (id: string) => axios.get(`${BASE}/attachments/file/${id}/url`, { headers: headers() }).then(r => r.data),
  remove: (id: string) => axios.delete(`${BASE}/attachments/file/${id}`, { headers: headers() }).then(r => r.data),
};
```

- [ ] **Step 6: `startFormHelpers.tsx` — `'file'` field type**

Extend `FieldDef['type']` (line 15):
```ts
  type: 'text' | 'number' | 'textarea' | 'select' | 'date' | 'checkbox' | 'file';
```

`DynField`'s `value`/`onChange` are `string`-typed, which doesn't fit a File. Store the uploaded attachment's id as the field's string value once upload completes (empty string = not yet uploaded). Add a `'file'` branch to `DynField` (before the `checkbox` branch, line 189):
```tsx
  if (field.type === 'file') {
    const [uploading, setUploading] = React.useState(false);
    const [fileName, setFileName] = React.useState('');
    return (
      <Box>
        <Typography variant="body2" sx={{ mb: 0.5 }}>{field.label}{field.required && ' *'}</Typography>
        <Button component="label" size="small" variant="outlined" disabled={uploading}>
          {uploading ? 'Uploading…' : value ? `Replace file (${fileName || 'uploaded'})` : 'Choose file'}
          <input type="file" hidden onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            setFileName(f.name);
            try {
              const { attachmentApi } = await import('../../api/client');
              const att = await attachmentApi.upload('form-field-staging', 'pending', f);
              onChange(att.id);
            } finally {
              setUploading(false);
            }
          }} />
        </Button>
      </Box>
    );
  }
```

This stages the upload against a placeholder `entityType`/`entityId` (`'form-field-staging'`/`'pending'`) since a **start**-form file field has no case id yet at fill time — case-service's attachment table is entity-agnostic, so this is a valid (if provisional) `entityType`/`entityId` pair. `Box`, `Button`, `Typography` are already imported in this file; add `import React from 'react'` if the file doesn't already have it as a default import (it does, per the existing `import React from 'react';` at line 5 — the `React.useState` call above is redundant with that but harmless; prefer adding `useState` to the named import instead: change line 5 to `import React, { useState } from 'react';` and use bare `useState` in the new branch instead of `React.useState`).

- [ ] **Step 7: Surface uploaded files on `CaseDetail.tsx`**

Add a 3rd tab, "Attachments", alongside the existing Work Notes / RCA tabs (lines 953-959 area). First, add the query and mutation near the existing `comments` query (around line 200):
```tsx
  const { data: attachments = [] } = useQuery(['case-attachments', id], () => attachmentApi.list('case', id!), { enabled: !!id });
  const uploadMut = useMutation((file: File) => attachmentApi.upload('case', id!, file), {
    onSuccess: () => qc.invalidateQueries(['case-attachments', id]),
  });
```
Import `attachmentApi` alongside the existing `client.ts` imports (line 27):
```tsx
import { caseApi, orgApi, processApi, rcaApi, datahubApi, contractorApi, attachmentApi } from '../../api/client';
```
Add the tab (line 958, after the RCA `Tab`):
```tsx
                <Tab label={`Attachments (${attachments.length})`} />
```
Add its `TabPanel` (after the RCA `TabPanel` closes):
```tsx
            <TabPanel value={tab} index={2}>
              <CardContent>
                <Button component="label" size="small" variant="outlined" disabled={uploadMut.isLoading} sx={{ mb: 2 }}>
                  {uploadMut.isLoading ? 'Uploading…' : 'Upload file'}
                  <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); }} />
                </Button>
                {attachments.length === 0 && <Typography variant="body2" color="text.secondary">No attachments yet.</Typography>}
                {(attachments as any[]).map(a => (
                  <Box key={a.id} display="flex" justifyContent="space-between" alignItems="center" py={1} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box>
                      <Typography variant="body2">{a.filename}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.uploader_name || 'Unknown'} · {format(new Date(a.created_at), 'dd MMM yyyy HH:mm')}
                      </Typography>
                    </Box>
                    <Button size="small" onClick={async () => {
                      const { url } = await attachmentApi.getUrl(a.id);
                      window.open(url, '_blank');
                    }}>
                      Download
                    </Button>
                  </Box>
                ))}
              </CardContent>
            </TabPanel>
```

- [ ] **Step 8: Verify**

`npx tsc --noEmit` in `apps/frontend-portal`, `services/bpm-orchestrator`, and `services/api-gateway`. Rebuild/restart `api-gateway`. Manually: in Process Studio, add a File Upload field to a task form, save/publish; start or work an instance of that process, confirm the file field renders, upload a file, confirm it accepts and stores an attachment id; open any case's detail page, confirm the new Attachments tab lists 0 attachments initially, upload a file there directly, confirm it appears in the list with a working Download link (opens the presigned MinIO URL).

- [ ] **Step 9: Commit**

```bash
git add services/bpm-orchestrator/src/engine/validation.ts apps/frontend-portal/src/pages/process-studio/PropertiesPanel.tsx apps/frontend-portal/src/pages/process-studio/startFormHelpers.tsx services/api-gateway/src/case/attachment.controller.ts services/api-gateway/src/case/case.module.ts services/api-gateway/package.json services/api-gateway/package-lock.json apps/frontend-portal/src/api/client.ts apps/frontend-portal/src/pages/cases/CaseDetail.tsx
git commit -m "feat: add file-upload form field type, wired to case-service's existing attachment backend via a new gateway multipart proxy"
```

---

### Task 14: Process Studio — investigate confusing step/button ordering

**Files:** none pre-determined — this is an investigation task.

**Current state:** the user reported "confusing step/button ordering, some buttons appear too early" without pointing to a specific screen. This is too vague to plan a fix from blind — do the walkthrough after Tasks 1-13 land (the flows will have changed shape anyway), then report findings for confirmation before writing any fix.

- [ ] **Step 1: Walk through Process Studio's toolbar states**

With a `draft` process open, note every button's enabled/visible state (Checks, Save, Publish) at each stage: no changes made yet, changes made but not saved, saved with 0 errors, saved with blocking errors. Repeat with an `active`/published process open (Save should say "Save as new version", Publish should be hidden).

- [ ] **Step 2: Walk through the New Case / New Request wizards**

Open `/cases/new`, step through type selection → form fill → submit, noting any button that is clickable before its precondition is met (e.g. Submit enabled before required fields are filled, Next enabled before a type is selected).

- [ ] **Step 3: Report findings**

Produce a concrete list: `{screen, button, precondition currently not enforced, suggested fix}` per finding. Do not implement fixes in this task — bring the list back for confirmation first, since "confusing" is subjective and the fix approach (disable vs. hide vs. reorder) should be chosen per-case with the user, not guessed.

---

## Verification (whole plan)

- `npx tsc --noEmit` clean in `apps/frontend-portal`, `services/bpm-orchestrator`, `services/notification-service`, and `services/api-gateway`.
- Full Playwright suite green — pay particular attention to any spec that: navigates via old `/apps`-era tile paths or the old flat 4-item sidebar; asserts on `AdminLayout`'s now-removed nav box; opens `/cases` expecting the old 3-tab `CaseDomainNav` instead of the new 4-tab (Service/ITSM/Security/Field) version; or asserts on `Dashboard.tsx`'s now-removed header buttons.
- Manual click-through: every sidebar item and every dropdown child (ctrl-click a sample of them to confirm new-tab behavior); the new Home page layout end to end; all 6 Dashboards destinations from both the sidebar dropdown and the Dashboards tile grid; all 9 Administration destinations; the 3 concrete Process Studio fixes (diagram renders on open for a process that previously failed to; Export BPMN downloads a valid file; a File Upload field can be added to a process form and a file uploaded both from a task form and from Case Detail's new Attachments tab).
- Docker rebuild of `frontend`, `bpm-orchestrator`, `notification-service`, and `api-gateway`, then a full e2e run, as the final gate — matching precedent from prior rollouts in this project.
