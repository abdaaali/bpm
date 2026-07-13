# Frontend-Portal UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 11 UX feedback items approved in the plan-mode session (`C:\Users\a.abdali\.claude\plans\fluffy-greeting-curry.md`): nav-bar/tab visual polish, dedupe of overlapping "My Work"/"My Requests" entry points, a "My Workplace" summary on Home, deletion of the redundant Applications page, emoji→icon cleanup, universal back-button coverage, an Administration IA rework (cards+tabs → persistent settings sub-nav), a shorter case-creation path, and a DataTable visual restyle + representative migration.

**Architecture:** frontend-portal only. All changes are presentation/navigation layer — no API, permission, or business-logic changes. Reuses existing shared components (`BackButton`, `PageHeader`, `KPIStatCard`, `EmptyState`, `DataTable`) built in the prior Design System Foundation work rather than inventing new patterns.

**Tech Stack:** React 18, MUI 5, react-router-dom v6.22 (confirmed — supports nested `<Route>`/`<Outlet>`), TypeScript 5.3, Vite. No new dependencies.

## Global Constraints

- No route, permission, API, or business-logic changes beyond the two explicitly-approved IA changes: deleting `/apps` (item 5) and restructuring the 6 Administration routes under a nested layout (item 8). Every other route keeps its existing path.
- Reuse `BackButton`/`PageHeader` (`apps/frontend-portal/src/components/`) for all new back-navigation — do not hand-roll new back buttons except where explicitly noted (item 7's `ExternalSubmissionReview.tsx` case, which is a state toggle, not a route navigation).
- Tab restyling (filled pill, `bgcolor: primary.main`, `color: white` when selected) must be implemented once at the theme level (`MuiTab`/`MuiTabs` overrides in `theme.ts`), not copy-pasted per file.
- Emoji replacement is scoped to `ManagementDigest.tsx` only, per the user's explicit statement — do not touch the emoji found elsewhere (`CaseDetail.tsx`, `ExternalSubmissionReview.tsx`, `RcaPage.tsx`) in this plan.
- Table migration (item 11) is scoped to restyling `DataTable.tsx` plus 4 named pages (`CaseList.tsx`, `MyRequests.tsx`, `AuditLog.tsx`, `CaseWorkTable.tsx`) — the other ~17 raw-table pages are explicitly out of scope for this plan.
- After this plan ships, tell the user exactly which pages were affected so they can check them live (per their standing instruction from the prior design-system work, which continues to apply).

---

## Task 1: Filled-pill tab styling (theme-level)

**Files:**
- Modify: `apps/frontend-portal/src/theme/theme.ts`

**Interfaces:**
- Produces: token-level `MuiTab`/`MuiTabs` overrides consumed automatically by every existing `<Tabs>/<Tab>` usage in the app (`ModuleNav.tsx`, `Workplace.tsx`, `CaseDomainNav`, `ManagementDigest.tsx`, `MdmPage.tsx`) — no changes needed in those files for this task.

- [ ] **Step 1: Add filled-pill tab overrides**

In `theme.ts`, find the existing `MuiTab` entry inside `components:` (currently `MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, transition: \`color ${TRANSITION}\` } } },`) and replace it with:

```ts
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { display: 'none' },
        flexContainer: { gap: 4 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 40,
          borderRadius: RADIUS.sm,
          transition: `background-color ${TRANSITION}, color ${TRANSITION}`,
          '&:hover': { backgroundColor: 'rgba(40,86,201,0.06)' },
          '&.Mui-selected': {
            backgroundColor: '#2856c9',
            color: '#ffffff',
            '&:hover': { backgroundColor: '#1f43a3' },
          },
        },
      },
    },
```

Keep every other entry in `components:` unchanged. `indicator: { display: 'none' }` removes the default bottom-border indicator since the filled pill itself now carries the selected state.

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/frontend-portal && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Visual smoke check**

Start the dev server, open `/catalog` (ModuleNav tabs), `/workplace` (Workplace tabs), `/cases?domain=service` (CaseDomainNav tabs), `/digest` (ManagementDigest tabs), `/mdm` (MdmPage's Hosts/Lookup tabs). Confirm every tab bar now shows a filled blue pill with white text for the selected tab, and unselected tabs have a subtle hover, with no leftover bottom-border indicator line.

---

## Task 2: Nav bar polish (notifications popover + profile menu + stale hardcoded colors)

**Files:**
- Modify: `apps/frontend-portal/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `EmptyState` (`apps/frontend-portal/src/components/EmptyState.tsx`, already exists).

- [ ] **Step 1: Fix stale hardcoded primary-blue colors**

The sidebar's `ListItemButton` styling (lines 213-224) still hardcodes the OLD pre-design-system primary blue (`rgba(25,118,210,...)`, `#1976d2`'s rgb) instead of the new primary `#2856c9` (rgb `40,86,201`) established in the Design System Foundation work. Replace:

```tsx
                    sx={{
                      borderRadius: 2, mx: 1, my: 0.25, py: 1.25, position: 'relative', pl: active ? 2.25 : 2,
                      '&:hover': { bgcolor: active ? 'rgba(25,118,210,0.14)' : 'rgba(15,23,42,0.045)' },
                      '&.Mui-selected': {
                        bgcolor: 'rgba(25,118,210,0.1)', color: 'primary.main',
```

with:

```tsx
                    sx={{
                      borderRadius: 2, mx: 1, my: 0.25, py: 1.25, position: 'relative', pl: active ? 2.25 : 2,
                      '&:hover': { bgcolor: active ? 'rgba(40,86,201,0.14)' : 'rgba(15,23,42,0.045)' },
                      '&.Mui-selected': {
                        bgcolor: 'rgba(40,86,201,0.1)', color: 'primary.main',
```

- [ ] **Step 2: Restyle the notifications Popover**

Replace the Popover's inner `Box` (lines 153-171) with:

```tsx
            <Box sx={{ width: 360, maxHeight: 440, overflow: 'auto' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={1.5} sx={{ bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                <Button size="small" onClick={() => markAllRead.mutate()} disabled={markAllRead.isLoading}>Mark all read</Button>
              </Box>
              <Divider />
              {(notifList?.data || []).length === 0 && (
                <EmptyState icon={<NotificationsIcon fontSize="inherit" />} title="You're all caught up" description="New notifications will show up here." />
              )}
              {(notifList?.data || []).map((n: any) => (
                <Box key={n.id} px={2} py={1.25} sx={{
                  borderBottom: '1px solid', borderColor: 'divider',
                  bgcolor: n.read_at ? 'transparent' : 'action.hover',
                  transition: 'background-color 160ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Typography variant="body2" fontWeight={n.read_at ? 400 : 600}>{n.subject}</Typography>
                  {n.body && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: n.body }} />}
                  <Typography variant="caption" color="text.secondary">
                    {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
```

Add the import: `import EmptyState from './EmptyState';` near the top of the file with the other local imports.

- [ ] **Step 3: Restyle the profile Menu**

Replace the `Menu` block (lines 180-189) with:

```tsx
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { minWidth: 220 } }}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" fontWeight={700}>{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={logout} sx={{ py: 1.25 }}>Logout</MenuItem>
          </Menu>
```

This replaces the two disabled `MenuItem`s (which rendered as grayed-out even with the `opacity: '1 !important'` override) with a plain non-interactive header block, avoiding the disabled-looking text.

- [ ] **Step 4: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: open the app, click the notification bell (both with and without notifications present) and the profile avatar — confirm both dropdowns render with the new styling and the sidebar's active/hover states now use the new blue.

---

## Task 3: Emoji → icon swap in Management Digest

**Files:**
- Modify: `apps/frontend-portal/src/pages/digest/ManagementDigest.tsx`

- [ ] **Step 1: Read current tab/button lines and replace emoji with icons**

At lines 89-92, replace:

```tsx
        <Tab label="📧 Overview" />
        <Tab label="⚙️ Configuration" />
        <Tab label="👥 Recipients" />
        <Tab label="📜 Run History" />
```

with:

```tsx
        <Tab icon={<MailOutlineIcon fontSize="small" />} iconPosition="start" label="Overview" />
        <Tab icon={<SettingsIcon fontSize="small" />} iconPosition="start" label="Configuration" />
        <Tab icon={<PeopleIcon fontSize="small" />} iconPosition="start" label="Recipients" />
        <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="start" label="Run History" />
```

At line 119, replace:

```tsx
                    👁️ Generate Preview
```

with (adjust surrounding `Button`'s `startIcon` prop if the button already has one — read the actual button element first; if it doesn't already have a `startIcon`, add `startIcon={<VisibilityIcon />}` to the `Button` and just use the text `Generate Preview` here):

```tsx
                    Generate Preview
```

Add imports at the top of the file:

```tsx
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
```

- [ ] **Step 2: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Grep the file for any remaining emoji: confirm no `📧`/`⚙️`/`👥`/`📜`/`👁️` characters remain in `ManagementDigest.tsx`.

---

## Task 4: Home page rebuild — "My Workplace" summary + quick-create shortcuts

**Files:**
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx`

**Interfaces:**
- Consumes: `KPIStatCard` (`apps/frontend-portal/src/components/KPIStatCard.tsx`), `caseApi.getMyWork`, `approvalApi.listPending`, `caseApi.list` (all already used identically in `Workplace.tsx`/`ToDo.tsx`/`ServiceCatalog.tsx` — same queries, not new endpoints).

- [ ] **Step 1: Replace `HomePage` with a version that adds a My Workplace summary and quick-create buttons**

Replace the current `HomePage` function (lines 98-115) with:

```tsx
function WorkplaceSummary() {
  const navigate = useNavigate();
  const { data: myWork = [] } = useQuery('my-work', caseApi.getMyWork);
  const { data: approvals } = useQuery('my-approvals', () => approvalApi.listPending(1, 50));
  const { user } = useAuth();
  const { data: myRequestsData } = useQuery(
    ['my-requests-count', user?.id],
    () => caseApi.list({ requesterId: user?.id, status: OPEN_CASE_STATUSES.join(',') }, 1, 1),
    { staleTime: 30_000, enabled: !!user },
  );

  const mineCases = (myWork as any[]).filter((c: any) => c.mine);
  const teamCases = (myWork as any[]).filter((c: any) => !c.mine);
  const toDoCount = mineCases.length + (approvals?.data?.length || 0);

  return (
    <Card sx={{ mb: 3, cursor: 'pointer' }} onClick={() => navigate('/workplace')}>
      <CardActionArea sx={{ p: 2.5 }} onClick={() => navigate('/workplace')}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight={700}>My Workplace</Typography>
          <Box display="flex" alignItems="center" gap={0.5} color="primary.main">
            <Typography variant="body2" fontWeight={600}>Go to My Workplace</Typography>
            <ChevronRightIcon fontSize="small" />
          </Box>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <KPIStatCard label="To Do" value={toDoCount} color="#2856c9" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <KPIStatCard label="My Requests" value={myRequestsData?.total ?? 0} color="#1b7a4a" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <KPIStatCard label="Team Queue" value={teamCases.length} color="#b5760f" />
          </Grid>
        </Grid>
      </CardActionArea>
    </Card>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <Box>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>{greeting}{user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}</Typography>
          <Typography variant="body2" color="text.secondary">Pick an application to get started, or jump to what needs your attention.</Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button variant="outlined" size="large" startIcon={<StoreIcon />} onClick={() => navigate('/catalog')}>New Request</Button>
          <Button variant="contained" size="large" startIcon={<BugReportIcon />} onClick={() => navigate('/cases/new')}>New Case</Button>
        </Box>
      </Box>
      <WorkplaceSummary />
      <TileGrid title="Applications" tiles={APPLICATIONS} />
    </Box>
  );
}
```

`Grid`, `Card`, `CardActionArea`, and `ChevronRightIcon` are already imported in this file (lines 3-4) — the new code above reuses them as-is. Add only these genuinely new imports at the top of the file:

```tsx
import { useQuery } from 'react-query';
import { caseApi, approvalApi } from '../../api/client';
import { OPEN_CASE_STATUSES } from '../catalog/ServiceCatalog'; // Task 4 Step 2 confirms/adds this export
import KPIStatCard from '../../components/KPIStatCard';
```

- [ ] **Step 2: Confirm `OPEN_CASE_STATUSES` is importable**

Read `apps/frontend-portal/src/pages/catalog/ServiceCatalog.tsx` to find where `OPEN_CASE_STATUSES` is defined (referenced in this plan's Task 6 too). If it's not currently exported from that file, add `export` to its declaration (a one-line change, safe — it's a plain constant array, exporting it doesn't change its behavior for existing consumers in `ServiceCatalog.tsx` itself).

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: open `/home`, confirm the greeting header now shows "New Request"/"New Case" buttons, a "My Workplace" summary card with 3 stat numbers appears above the Applications tile grid, and clicking the summary card (or "Go to My Workplace") navigates to `/workplace`.

---

## Task 5: Delete Applications page

**Files:**
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx`
- Modify: `apps/frontend-portal/src/App.tsx`
- Modify: `apps/frontend-portal/src/components/Layout.tsx`

**Interfaces:**
- Consumes: Task 4 must be complete first (`HomePage` already renders the `APPLICATIONS` tile grid, so no functionality is lost by removing the separate page).

- [ ] **Step 1: Remove `ApplicationsPage` from `Launcher.tsx`**

Delete this line (currently line 94):
```tsx
export function ApplicationsPage() { return <TileGrid title="Applications" subtitle="Choose an area to work in" tiles={APPLICATIONS} />; }
```

- [ ] **Step 2: Remove the `/apps` route from `App.tsx`**

Change the import (currently line 30):
```tsx
import { HomePage, ApplicationsPage, DashboardsPage, AdministrationPage } from './pages/launcher/Launcher';
```
to:
```tsx
import { HomePage, DashboardsPage, AdministrationPage } from './pages/launcher/Launcher';
```

Delete this route (currently line 66):
```tsx
          <Route path="/apps" element={<ApplicationsPage />} />
```

- [ ] **Step 3: Remove "Applications" from the sidebar `NAV` array in `Layout.tsx`**

Change (currently lines 60-66):
```tsx
const NAV: NavItem[] = [
  { label: 'Home',           icon: <HomeIcon />,      path: '/home',      match: ['/home'] },
  { label: 'My Work',        icon: <WorkIcon />,      path: '/workplace', match: ['/workplace', '/inbox', '/tasks', '/requests', '/my-requests'] },
  { label: 'Applications',   icon: <AppsIcon />,      path: '/apps',      match: ['/apps', '/catalog', '/cases', '/contractors', '/processes', '/rca', '/approvals'] },
  { label: 'Dashboards',     icon: <DashboardIcon />, path: '/dashboards', match: ['/dashboards', '/dashboard', '/reports', '/digest'], perm: 'cases:read' },
  { label: 'Administration', icon: <SettingsIcon />,  path: '/admin',     match: ['/admin', '/org', '/mdm', '/audit'], perm: 'org:read' },
];
```
to:
```tsx
const NAV: NavItem[] = [
  { label: 'Home',           icon: <HomeIcon />,      path: '/home',      match: ['/home', '/catalog', '/cases', '/contractors', '/processes', '/rca', '/approvals'] },
  { label: 'My Work',        icon: <WorkIcon />,      path: '/workplace', match: ['/workplace', '/inbox', '/tasks', '/requests', '/my-requests'] },
  { label: 'Dashboards',     icon: <DashboardIcon />, path: '/dashboards', match: ['/dashboards', '/dashboard', '/reports', '/digest'], perm: 'cases:read' },
  { label: 'Administration', icon: <SettingsIcon />,  path: '/admin',     match: ['/admin', '/org', '/mdm', '/audit'], perm: 'org:read' },
];
```

(Home's `match` array absorbs the paths that used to make "Applications" the highlighted sidebar item, so navigating into e.g. `/cases` still highlights a sidebar entry — now "Home" instead of a deleted "Applications".) The now-unused `AppsIcon` import can stay (harmless) or be removed — remove it if nothing else in the file uses `AppsIcon` (grep to confirm before removing).

- [ ] **Step 4: Grep for stray `/apps` references**

Run: `grep -rn "'/apps'" apps/frontend-portal/src` (or use the Grep tool) — confirm no remaining `navigate('/apps')` or `to="/apps"` exists anywhere else in the app. If any are found, repoint them to `/home`.

- [ ] **Step 5: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: confirm sidebar no longer shows "Applications", `/apps` returns the catch-all redirect (or 404-equivalent — check `App.tsx`'s `<Route path="*">` still catches it gracefully), and `/home` still shows the full Applications tile grid.

---

## Task 6: Service Catalog dedup — remove redundant "My Requests" button, add count badge to the ModuleNav tab

**Files:**
- Modify: `apps/frontend-portal/src/pages/catalog/ServiceCatalog.tsx`
- Modify: `apps/frontend-portal/src/components/ModuleNav.tsx`

- [ ] **Step 1: Remove the page-level "My Requests" button from `ServiceCatalog.tsx`**

Replace (currently lines 122-142):
```tsx
      {/* ── Header ── */}
      <Box sx={{ mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2}>
          <Box>
            <Typography variant="h4" fontWeight={700}>Service Catalog</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              Browse available services and submit requests
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ListAltIcon />}
            onClick={() => navigate('/my-requests')}
          >
            My Requests
            {(myRequestsData?.total ?? 0) > 0 && (
              <Chip label={myRequestsData!.total} size="small" color="primary"
                sx={{ ml: 1, height: 18, fontSize: 11 }} />
            )}
          </Button>
        </Box>
```
with:
```tsx
      {/* ── Header ── */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" fontWeight={700}>Service Catalog</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Browse available services and submit requests
          </Typography>
        </Box>
```

`myRequestsData` is still used elsewhere in Task 4's `WorkplaceSummary` (a separate component in a separate file with its own identical query) — within THIS file, if `myRequestsData`/`OPEN_CASE_STATUSES`'s query (lines 95-101) is no longer referenced anywhere else in `ServiceCatalog.tsx`, remove that `useQuery` block too (check the rest of the file first — grep for `myRequestsData` within this file to confirm no other usage before deleting the query).

Also mark the `OPEN_CASE_STATUSES` constant/array `export`ed (needed by Task 4's `Launcher.tsx` import) if not already exported — check its declaration.

- [ ] **Step 2: Add a request-count badge to ModuleNav's "My Requests" tab**

In `ModuleNav.tsx`, the `Service Catalog` group's tab render currently comes from the generic `pages.map(p => <Tab key={p.path} label={p.label} onClick={() => navigate(p.path)} sx={{ textTransform: 'none', minHeight: 44 }} />)` (line 93). Add a count fetch and conditionally append a small `Chip`/`Badge` to the "My Requests" tab's label specifically:

```tsx
import { useQuery } from 'react-query';
import { caseApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Chip } from '@mui/material';
```

Inside `ModuleNav()`, before the `return` for the main group renderer (after `const pages = group.pages.filter(p => can(p.perm));`), add:

```tsx
  const { user } = useAuth();
  const { data: myRequestsCount } = useQuery(
    ['module-nav-my-requests-count', user?.id],
    () => caseApi.list({ requesterId: user?.id, status: 'new,open,in_progress,pending_approval' }, 1, 1),
    { staleTime: 30_000, enabled: !!user && group.label === 'Service Catalog' },
  );
```

Then change the `Tab` render (line 93) from:
```tsx
        {pages.map(p => <Tab key={p.path} label={p.label} onClick={() => navigate(p.path)} sx={{ textTransform: 'none', minHeight: 44 }} />)}
```
to:
```tsx
        {pages.map(p => (
          <Tab key={p.path} onClick={() => navigate(p.path)} sx={{ textTransform: 'none', minHeight: 44 }}
            label={p.label === 'My Requests' && (myRequestsCount?.total ?? 0) > 0
              ? <Box display="flex" alignItems="center" gap={0.75}>{p.label}<Chip label={myRequestsCount!.total} size="small" sx={{ height: 18, fontSize: 11 }} /></Box>
              : p.label} />
        ))}
```

Add `Box` to the existing `@mui/material` import at the top of `ModuleNav.tsx` if not already imported (check current import line — it currently imports `{ Box, Tabs, Tab }`, so `Box` is already available; no change needed there).

Use the SAME status list as `ServiceCatalog.tsx`'s `OPEN_CASE_STATUSES` — if that constant is now exported (Task 6 Step 1), import and reuse it here (`import { OPEN_CASE_STATUSES } from '../pages/catalog/ServiceCatalog';`) instead of the inline string `'new,open,in_progress,pending_approval'` shown above, to avoid the two count queries silently drifting out of sync.

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: open `/catalog` — confirm the page header no longer shows a "My Requests" button, and the "My Requests" tab (in the sub-tab bar above the page) shows a small count chip when the user has open requests.

---

## Task 7: Shorten case-creation flow — auto-redirect after Service Catalog submission

**Files:**
- Modify: `apps/frontend-portal/src/pages/catalog/NewRequest.tsx`

- [ ] **Step 1: Auto-navigate to CaseDetail instead of showing the manual "Track My Request" screen**

Replace the `submitMut`'s `onSuccess` handler (currently lines 131-134):
```tsx
      onSuccess: (c: any) => {
        setSubmittedId(c.id);
        setSubmittedKey(c.case_number || bizKey);
      },
```
with:
```tsx
      onSuccess: (c: any) => {
        navigate(`/cases/${c.id}`, { state: { justSubmitted: true, businessKey: c.case_number || bizKey } });
      },
```

Remove the now-unused `submittedId`/`submittedKey` state (lines 99-100) and the `SubmittedScreen` component (lines 71-89) and its usage (lines 148-150), since the flow no longer shows an interstitial confirmation screen — it navigates straight to the case.

- [ ] **Step 2: Show a brief success indicator on CaseDetail instead**

Read `apps/frontend-portal/src/pages/cases/CaseDetail.tsx` to find where it reads route state (or add this if it doesn't currently use `useLocation`). Add a `Snackbar`/`Alert` that shows "Request submitted successfully" when `location.state?.justSubmitted` is true, auto-dismissing after a few seconds — reuse whatever snackbar/toast pattern is already established elsewhere in `CaseDetail.tsx` (check for an existing `Snackbar` in the file first; if the file already has toast infrastructure for other actions, reuse it rather than adding a second one).

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run e2e: `cd e2e && npx playwright test --project=main-portal service-catalog-new-request.spec.ts` — this spec exists and directly exercises this flow; it may assert on the old `SubmittedScreen`'s "Track My Request" button, so read the spec first and update its assertions to match the new auto-redirect behavior if needed (the spec's intent — verifying a submitted request is trackable — doesn't change, only the exact UI path does).

---

## Task 8: Back-button pass, batch 1 — swap 4 ad-hoc back controls for the shared component

**Files:**
- Modify: `apps/frontend-portal/src/pages/catalog/NewRequest.tsx`
- Modify: `apps/frontend-portal/src/pages/cases/CreateCase.tsx`
- Modify: `apps/frontend-portal/src/pages/inbox/WorkItemDetail.tsx`
- Modify: `apps/frontend-portal/src/pages/contractors/ExternalSubmissionReview.tsx`

**Interfaces:**
- Consumes: `BackButton` (`to: string`, `label: string`, `sx?: object`).

- [ ] **Step 1: `NewRequest.tsx`** — replace (lines 156-158, adjusted for Task 7's removal of the submitted-screen branch above it):
```tsx
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/catalog')} sx={{ mb: 2 }}>
        Service Catalog
      </Button>
```
with:
```tsx
      <BackButton to="/catalog" label="Back to Service Catalog" sx={{ mb: 2 }} />
```
Add `import BackButton from '../../components/BackButton';`. Remove the now-unused `ArrowBackIcon` import if nothing else in the file uses it.

- [ ] **Step 2: `CreateCase.tsx`** — two back controls, both stay ad-hoc since neither is a plain route navigation (the first cancels back to `/cases`, matching `BackButton`'s pattern; the second resets in-component wizard state, which `BackButton`'s "always navigate to an explicit route" design explicitly does not support — see `BackButton.tsx`'s doc comment). Migrate only the first one:

Replace (lines 235-237):
```tsx
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/cases')} sx={{ mb: 2 }}>
          Back to Cases
        </Button>
```
with:
```tsx
        <BackButton to="/cases" label="Back to Cases" sx={{ mb: 2 }} />
```
Add `import BackButton from '../../components/BackButton';`. Leave the second control (lines 279-281, "Change Type") exactly as-is — it's an in-page state reset (`setSelectedType(null)`), not a route change, and is out of scope for the shared `BackButton` component by design.

- [ ] **Step 3: `WorkItemDetail.tsx`** — replace the icon-only back control (lines 252-254) with the shared component for label consistency with the rest of the app:
```tsx
        <Tooltip title="Back to Workplace">
          <IconButton onClick={() => navigate(backTo)} size="small"><ArrowBackIcon /></IconButton>
        </Tooltip>
```
with:
```tsx
        <BackButton to={backTo} label="Back to Workplace" />
```
Add `import BackButton from '../../components/BackButton';`. Remove the now-unused `Tooltip`/`IconButton`/`ArrowBackIcon` imports only if nothing else in the file uses them (check first — `IconButton` in particular is likely reused by the adjacent "Refresh" control on the same line, so it probably stays).

- [ ] **Step 4: `ExternalSubmissionReview.tsx`** — this one stays ad-hoc (it's a local-state toggle — `setSelectedId('')` — not a route navigation, so it's outside `BackButton`'s designed scope same as `CreateCase.tsx`'s "Change Type"). Just restyle it to match `BackButton`'s visual language (icon + label, not a plain text arrow) for consistency:

Replace (line 203):
```tsx
        <Button variant="text" onClick={() => setSelectedId('')} sx={{ mb: 2 }}>← Back to list</Button>
```
with:
```tsx
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => setSelectedId('')} sx={{ mb: 2 }}>Back to list</Button>
```
Add `import ArrowBackIcon from '@mui/icons-material/ArrowBack';` if not already imported (check first).

- [ ] **Step 5: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: spot-check all 4 pages' back controls render and navigate correctly.

---

## Task 9: Back-button pass, batch 2 — add BackButton to 6 top-level module pages (Workplace, Dashboards, Service Catalog, Cases, Processes)

**Files:**
- Modify: `apps/frontend-portal/src/pages/workplace/Workplace.tsx`
- Modify: `apps/frontend-portal/src/pages/dashboard/Dashboard.tsx`
- Modify: `apps/frontend-portal/src/pages/dashboard/OpsDashboard.tsx`
- Modify: `apps/frontend-portal/src/pages/catalog/ServiceCatalog.tsx`
- Modify: `apps/frontend-portal/src/pages/cases/CaseList.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessList.tsx`

**Interfaces:**
- Consumes: `BackButton` (`to: string`, `label: string`, `sx?: object`).

- [ ] **Step 1: `Workplace.tsx`** — this file's current top block (lines 42-47) is:
```tsx
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>My Workplace</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What needs your action, the requests you raised, and work you can pick up — in one place.
      </Typography>
```
Add a `BackButton` immediately before the `Typography variant="h4"` line, targeting `/home`:
```tsx
  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Typography variant="h4" fontWeight={700} gutterBottom>My Workplace</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What needs your action, the requests you raised, and work you can pick up — in one place.
      </Typography>
```
Add `import BackButton from '../../components/BackButton';`.

- [ ] **Step 2: `Dashboard.tsx`, `OpsDashboard.tsx`, `ServiceCatalog.tsx`, `CaseList.tsx`, `ProcessList.tsx`**

For each of these 5 files: read the file, find its top-level page heading (the first `Typography variant="h4"` or equivalent page title near the start of the returned JSX), and insert `<BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />` immediately before it, adding the `BackButton` import (path depth depends on the file's location — `../../components/BackButton` for files two levels under `pages/`, matching the pattern in Step 1). Do not change anything else in these files — this is purely additive.

For `ServiceCatalog.tsx` specifically: place the `BackButton` above the header `Box` that Task 6 already modified — do not re-modify the header content itself, just prepend the back button above it.

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: spot check 2-3 of these pages show a working "Back to Home" button.

---

## Task 10: Back-button pass, batch 3 — Governance, Reports, Digest, remaining Process Studio pages

**Files:**
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessInstances.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessAnalytics.tsx`
- Modify: `apps/frontend-portal/src/pages/reports/ReportBuilder.tsx`
- Modify: `apps/frontend-portal/src/pages/digest/ManagementDigest.tsx`
- Modify: `apps/frontend-portal/src/pages/approvals/ApprovalPolicies.tsx`
- Modify: `apps/frontend-portal/src/pages/approvals/ApprovalInstances.tsx`

**Interfaces:**
- Consumes: `BackButton` (`to: string`, `label: string`, `sx?: object`).

- [ ] **Step 1: `ProcessInstances.tsx` and `ProcessAnalytics.tsx`** — both are part of the same `ModuleNav` "Process Studio" group (`Studio` / `Process Monitor` / `Process Performance`, per `ModuleNav.tsx`'s `GROUPS`). Target their `BackButton` at `/processes` (the Studio landing page, i.e. their sibling in the same group) rather than `/home`, since they're clearly nested under that module: `<BackButton to="/processes" label="Back to Process Studio" sx={{ mb: 1 }} />`, inserted immediately before each file's top-level page heading. Add the import.

- [ ] **Step 2: `ReportBuilder.tsx`, `ManagementDigest.tsx`** — both are standalone under the "Dashboards" sidebar group with no sibling `ModuleNav` group (check `ModuleNav.tsx`'s `GROUPS` — neither appears there, confirming they're not grouped with anything). Target `/home`: `<BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />`, inserted before each file's top-level page heading. For `ManagementDigest.tsx`, this task should be done AFTER Task 3 (emoji swap) lands on the same file — read the current file state first since Task 3 already touched its tab section.

- [ ] **Step 3: `ApprovalPolicies.tsx` and `ApprovalInstances.tsx`** — both are the "Governance" `ModuleNav` group (`Policies & Controls` / `Approval Instances`). Since both pages are siblings in the same group with no clear "parent," target `/home` for both: `<BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />`.

- [ ] **Step 4: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.

---

## Task 11: Back-button pass, batch 4 — Org, Audit, MDM, RCA, External Workforce pages

**Files:**
- Modify: `apps/frontend-portal/src/pages/org/OrgStructure.tsx`
- Modify: `apps/frontend-portal/src/pages/audit/AuditLog.tsx`
- Modify: `apps/frontend-portal/src/pages/mdm/MdmPage.tsx`
- Modify: `apps/frontend-portal/src/pages/rca/RcaPage.tsx`
- Modify: `apps/frontend-portal/src/pages/contractors/ExternalCompanyRegistry.tsx`
- Modify: `apps/frontend-portal/src/pages/contractors/ExternalUserManager.tsx`
- Modify: `apps/frontend-portal/src/pages/contractors/WorkOrderDispatch.tsx`
- Modify: `apps/frontend-portal/src/pages/contractors/ExternalSubmissionReview.tsx` (list view only — the detail-view back control was already handled in Task 8 Step 4; add a SEPARATE `BackButton` for when the list itself is showing, i.e. when `!assignmentId && !selectedId`)
- Modify: `apps/frontend-portal/src/pages/contractors/ContractorDashboard.tsx`

**Interfaces:**
- Consumes: `BackButton` (`to: string`, `label: string`, `sx?: object`).

- [ ] **Step 1: `OrgStructure.tsx`, `AuditLog.tsx`, `MdmPage.tsx`, `RcaPage.tsx`** — these are the "Administration"/standalone group pages. NOTE: this task should be sequenced AFTER Task 15 (Administration IA rework) if that task has already landed, since `AdminLayout.tsx` (created in Task 15) will provide its OWN persistent sub-nav for `OrgStructure.tsx`/`MdmPage.tsx`/`AuditLog.tsx` — check whether Task 15 is already done before starting; if `AdminLayout.tsx` exists, SKIP adding a `BackButton` to `OrgStructure.tsx`/`MdmPage.tsx`/`AuditLog.tsx` here (the sub-nav already provides equivalent navigation) and only handle `RcaPage.tsx` in this step (standalone, not part of Administration): `<BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />` before its top-level heading.

- [ ] **Step 2: External Workforce pages** — `ExternalCompanyRegistry.tsx`, `ExternalUserManager.tsx`, `WorkOrderDispatch.tsx`, `ExternalSubmissionReview.tsx` (list view), `ContractorDashboard.tsx` are all one `ModuleNav` group ("External Workforce": Companies / External Workers / Dispatch / Submission Review / Performance & KPIs). Since they're peer tabs within the same group (not nested under one another), target each at `/home`: `<BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />`, inserted before each file's top-level page heading.

For `ExternalSubmissionReview.tsx` specifically: read the file's full structure first — the list view and detail view share this one component (toggling on `assignmentId`/`selectedId`), so the new `BackButton` should render only in the LIST branch (alongside, not replacing, the existing detail-view "Back to list" `Button` from Task 8 Step 4, which is a different control for a different sub-state).

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal` and `--project=contractor-portal` — confirm nothing that navigates through these pages breaks (none of the existing specs are expected to assert against the absence of a back button, but confirm no unrelated regression).

---

## Task 12: DataTable.tsx visual restyle

**Files:**
- Modify: `apps/frontend-portal/src/components/DataTable.tsx`

**Interfaces:**
- Produces: same `DataTableColumn<T>`/props interface as before (purely visual change, no interface change) — `ProcessInstances.tsx` (already migrated in the prior Design System Foundation work) must keep working unmodified.

- [ ] **Step 1: Add row height, header background, and refined hover to the table markup**

Read the current `DataTable.tsx` (created in the prior Design System Foundation plan). Update the `TableHead`/`TableRow`/`TableCell` rendering to add:
- A header row background: wrap the `<TableHead>`'s `<TableRow>` cells or add `sx={{ bgcolor: 'grey.50' }}` to the `<TableHead>` element itself.
- Explicit row padding for a slightly taller, easier-to-scan row: add `sx={{ '& .MuiTableCell-root': { py: 1.5 } }}` to the `<Table>` element (or per-`TableRow`, whichever reads cleaner given the current structure).
- Confirm the hover state (already present via the app-wide `MuiTableRow` theme override from the Design System Foundation work) still applies cleanly on top of the new header background — no code change needed here if it already does, just confirm visually.

Do not change the component's props/interface — `columns`, `rows`, `rowKey`, `onRowClick`, `loading`, `emptyState`, `page`/`pageSize`/`total`/`onPageChange` all stay exactly as defined.

- [ ] **Step 2: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: open `/processes/instances` (the one page already using `DataTable`) and confirm the header now has a subtle background and rows read as slightly taller/easier to scan, with no regression to sorting/pagination/row-click.

---

## Task 13: Migrate CaseList.tsx and MyRequests.tsx to DataTable

**Files:**
- Modify: `apps/frontend-portal/src/pages/cases/CaseList.tsx`
- Modify: `apps/frontend-portal/src/pages/catalog/MyRequests.tsx`

**Interfaces:**
- Consumes: `DataTable<T>`, `DataTableColumn<T>` (`apps/frontend-portal/src/components/DataTable.tsx`), `EmptyState` (already used in `MyRequests.tsx`? check first).

- [ ] **Step 1: `CaseList.tsx`** — read the current file in full (it already imports `CASE_TYPE_COLORS`/`CASE_PRIORITY_COLORS`/`CASE_STATUS_COLORS` from `statusColors.tsx`, per the prior Design System Foundation work — keep that import). Find its raw `<Table>`/`<TableHead>`/`<TableBody>`/`<TablePagination>` block and migrate it to `<DataTable>` following the exact pattern already used in `ProcessInstances.tsx` (read that file as the reference implementation): define a `columns: DataTableColumn<any>[]` array matching `CaseList.tsx`'s existing column set (case number, type, title, status, priority, assignee, created date — whatever the actual current columns are), preserve row-click-to-navigate (`/cases/:id`) and any existing filters/search exactly as they are today. Remove now-unused raw `Table`-family imports if nothing else in the file needs them.

- [ ] **Step 2: `MyRequests.tsx`** — same pattern: read the file in full, migrate its raw table to `DataTable`, preserving the existing status filter, search, and the summary count cards (`In Progress`/`Completed`/`Total`, already present per the prior design-system exploration) exactly as they are. If the file doesn't yet have an `EmptyState` for its no-results case, add one (reusing `apps/frontend-portal/src/components/EmptyState.tsx`) as the `DataTable`'s `emptyState` prop.

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal case-assignee-reassignment.spec.ts my-requests-flow.spec.ts` — both specs directly exercise `CaseList.tsx`/`MyRequests.tsx` and must still pass unchanged in behavior.

---

## Task 14: Migrate AuditLog.tsx and CaseWorkTable.tsx to DataTable

**Files:**
- Modify: `apps/frontend-portal/src/pages/audit/AuditLog.tsx`
- Modify: `apps/frontend-portal/src/pages/workplace/CaseWorkTable.tsx`

**Interfaces:**
- Consumes: `DataTable<T>`, `DataTableColumn<T>`.

- [ ] **Step 1: `AuditLog.tsx`** — read the file in full, migrate its raw table to `DataTable` following the same pattern as Task 13, preserving all existing filters/columns/pagination exactly.

- [ ] **Step 2: `CaseWorkTable.tsx`** — this is a SHARED table component used by `ToDo.tsx` (and potentially other Workplace tabs — grep for its usages first: `grep -rn "CaseWorkTable" apps/frontend-portal/src`). Migrating this ONE file's internals to `DataTable` automatically updates every page that renders it — read it in full, confirm its exact props interface (used by its callers) stays unchanged, and migrate only its internal raw-table markup to `DataTable`.

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal` (full main-portal project) — `CaseWorkTable.tsx` is exercised indirectly by several specs through the Workplace/To Do flow; confirm nothing regresses.

---

## Task 15: Administration IA rework — persistent settings-style sub-nav

**Files:**
- Create: `apps/frontend-portal/src/components/AdminLayout.tsx`
- Modify: `apps/frontend-portal/src/pages/launcher/Launcher.tsx` (remove `AdministrationPage`'s card-grid rendering, keep the `ADMINISTRATION` data array)
- Modify: `apps/frontend-portal/src/App.tsx` (nest the 6 admin routes under `AdminLayout`)
- Modify: `apps/frontend-portal/src/components/ModuleNav.tsx` (remove the redundant `Administration` group)
- Modify: `apps/frontend-portal/src/components/Layout.tsx` (sidebar's "Administration" nav item)

**Interfaces:**
- Produces: `AdminLayout` renders a persistent left sub-nav for the 6 admin sections plus a `react-router-dom` `<Outlet/>` for whichever is active.

- [ ] **Step 1: Create `AdminLayout.tsx`**

```tsx
import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useAccess } from '../auth/useAccess';
import { ADMINISTRATION } from '../pages/launcher/Launcher';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAccess();
  const items = ADMINISTRATION.filter(t => can(t.perm));

  return (
    <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      <Box sx={{ width: 240, flexShrink: 0 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ pl: 2 }}>Administration</Typography>
        <List dense sx={{ mt: 0.5 }}>
          {items.map(t => {
            const active = location.pathname === t.path || location.pathname.startsWith(t.path + '/');
            return (
              <ListItem key={t.path} disablePadding>
                <ListItemButton
                  selected={active}
                  onClick={() => navigate(t.path)}
                  sx={{
                    borderRadius: 2, mx: 1, my: 0.25, position: 'relative',
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
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>{t.icon}</ListItemIcon>
                  <ListItemText primary={t.title} primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500 }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
```

This reuses the exact `Tile` shape (`title`, `icon`, `path`, `perm`) already exported from `Launcher.tsx`'s `ADMINISTRATION` array — no new data structure.

- [ ] **Step 2: Remove `AdministrationPage`'s card-grid rendering in `Launcher.tsx`**

Change (currently line 96):
```tsx
export function AdministrationPage() { return <TileGrid title="Administration" subtitle="Platform configuration and master data" tiles={ADMINISTRATION} />; }
```
Delete this line entirely — `AdminLayout` (Step 1) now serves this role via nested routes, not a standalone page component. `ADMINISTRATION` itself stays exported (consumed by `AdminLayout.tsx`).

- [ ] **Step 3: Nest the 6 admin routes under `AdminLayout` in `App.tsx`**

Update the import (currently line 30):
```tsx
import { HomePage, DashboardsPage, AdministrationPage } from './pages/launcher/Launcher';
```
to:
```tsx
import { HomePage, DashboardsPage } from './pages/launcher/Launcher';
```
(assuming Task 5 already removed `ApplicationsPage` from this import list — if Task 5 hasn't run yet, remove `ApplicationsPage` too in this same edit.)

Add near the top with other imports:
```tsx
import AdminLayout from './components/AdminLayout';
```

Replace the standalone admin routes (currently line 68 and lines 93-99 in the original file — locations may have shifted if earlier tasks already changed this file; find them by their `element=` values):
```tsx
          <Route path="/admin" element={<AdministrationPage />} />
```
and
```tsx
          <Route path="/org" element={<OrgStructure />} />
          ...
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin/connectors" element={<ConnectorAdmin />} />
          <Route path="/admin/notification-templates" element={<NotificationTemplates />} />
          <Route path="/admin/datahub" element={<DataHub />} />
          <Route path="/admin/sla" element={<SlaPolicies />} />
```

**Note before implementing:** `/org`, `/mdm`, `/audit` are NOT prefixed with `/admin` in the current route table (only `/admin/sla`, `/admin/connectors`, `/admin/notification-templates` are). A single `<Route path="/admin" element={<AdminLayout/>}>` parent with nested child routes only works when children share that path prefix — react-router v6 can't nest `/org` under a `/admin` parent route by path alone. So instead of a layout ROUTE, wrap each of the 6 routes' `element` directly in the `AdminLayout` COMPONENT (passed as `children`, not via `<Outlet/>`):

```tsx
          <Route path="/org" element={<AdminLayout><OrgStructure /></AdminLayout>} />
          <Route path="/mdm" element={<AdminLayout><MdmPage /></AdminLayout>} />
          <Route path="/audit" element={<AdminLayout><AuditLog /></AdminLayout>} />
          <Route path="/admin/sla" element={<AdminLayout><SlaPolicies /></AdminLayout>} />
          <Route path="/admin/connectors" element={<AdminLayout><ConnectorAdmin /></AdminLayout>} />
          <Route path="/admin/notification-templates" element={<AdminLayout><NotificationTemplates /></AdminLayout>} />
          <Route path="/admin" element={<Navigate to="/org" replace />} />
```

Keep `/admin/datahub` (`DataHub.tsx`) exactly where it already is, UNCHANGED — it is not part of the `ADMINISTRATION` array (it belongs to the Applications tile grid's "Operational DataHub" tile) and stays a plain standalone route outside `AdminLayout`.

This requires changing `AdminLayout.tsx` (Step 1) to accept `children: React.ReactNode` instead of using `<Outlet/>`:

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ...same body as Step 1, except the final Box uses {children} instead of <Outlet />:
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {children}
      </Box>
```

- [ ] **Step 4: Remove the redundant `Administration` group from `ModuleNav.tsx`**

Delete this entry from the `GROUPS` array (currently lines 36-43):
```tsx
  { label: 'Administration', pages: [
    { label: 'Organization', path: '/org', perm: 'org:read' },
    { label: 'Master Data', path: '/mdm', perm: 'mdm:read' },
    { label: 'SLA Policies', path: '/admin/sla', perm: 'cases:read' },
    { label: 'Integrations', path: '/admin/connectors', perm: 'connectors:manage' },
    { label: 'Notification Templates', path: '/admin/notification-templates', perm: 'notifications:manage' },
    { label: 'Audit & Compliance', path: '/audit', perm: 'audit:read' },
  ] },
```
`AdminLayout`'s own sub-nav (Step 1) now serves this exact purpose, so `ModuleNav` returning its tab bar on these routes would be the redundant "cards+tabs" duplication the user explicitly flagged (item 8) — removing it here is the fix, not an unrelated cleanup.

- [ ] **Step 5: Update the sidebar's "Administration" entry in `Layout.tsx`**

The `NAV` array's Administration entry currently points at `path: '/admin'`. Since Step 3 makes `/admin` itself redirect to `/org`, this still works correctly with no change needed — verify this is true after Step 3 lands (visit `/admin` in the browser, confirm it lands on Organization Structure with the new sub-nav visible).

- [ ] **Step 6: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Visual: click "Administration" in the sidebar — confirm it goes straight to a page showing the persistent left sub-nav (Organization/Master Data/SLA Policies/Integrations/Notification Templates/Audit & Compliance) with `OrgStructure` content on the right, NOT a card grid. Click each of the 6 sub-nav items — confirm each swaps the right-hand content without a full page reload and without a duplicate tab bar appearing above it (the `ModuleNav` bar should no longer render on these routes).
Run: `cd e2e && npx playwright test --project=main-portal` — check for any spec that navigates to `/admin` expecting the old card grid (search spec files for `/admin` first) and update its assertions if found.

---

## Task 16: Full regression + rebuild + report affected pages

- [ ] **Step 1**: `cd apps/frontend-portal && npx tsc --noEmit` — clean.
- [ ] **Step 2**: `cd infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend` — rebuild and confirm healthy.
- [ ] **Step 3**: `cd e2e && npx playwright test` — full suite green. Pay close attention to any spec touching `/apps`, `/admin`, Service Catalog's "My Requests" button, or the NewRequest submission flow (Task 5, Task 15, Task 6, Task 7 respectively) — these are the four places most likely to break an existing assertion, per the Global Constraints section.
- [ ] **Step 4**: Report to the user the exact list of pages whose appearance or navigation changed: nav bar (notifications + profile dropdown), every tab bar app-wide (filled pill style), Home (new workplace summary + quick-create buttons, Applications tile grid unchanged), Applications page (deleted — sidebar entry gone), Management Digest (icons instead of emoji), Service Catalog (My Requests button removed, count moved to the tab), New Request submission (now auto-redirects to the case instead of showing a confirmation screen), ~24 pages gaining a back button (list them), Administration (entirely new layout — card grid replaced by persistent sub-nav), Cases list / My Requests / Audit Log / Workplace To-Do table (new DataTable styling).
