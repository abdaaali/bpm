# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared design tokens (color/type/spacing/radius/shadow) and the eight shared component patterns defined in `docs/superpowers/specs/2026-07-12-design-system-foundation-design.md`, across all three frontend apps, with a small proof-of-adoption migration per component so each is verifiably working, not just built and unused.

**Architecture:** Each app keeps its own independent `theme.ts` and component files (no shared package — confirmed in the spec). Every task ends with either a visible page (verifiable in the browser / via an existing Playwright test) or a component with no consumer yet, clearly labeled as such and left for a named follow-up sub-project.

**Tech Stack:** React 18, MUI 5 (`createTheme`, `sx` prop, `styleOverrides`), TypeScript 5.3, Vite. No new dependencies.

## Global Constraints

- No route, permission, API, or business-logic changes — presentation layer only.
- No shared npm package/workspace — parallel per-app files.
- Keep each app's brand hue family (blue / orange / dual); only exact shades change.
- Every color/spacing/radius value introduced must match the token tables in the design spec exactly — no ad hoc new values.
- After this plan ships, tell the user exactly which pages changed visually, so they can check them live (per their explicit request).

---

## Task 1: frontend-portal theme tokens

**Files:**
- Modify: `apps/frontend-portal/src/theme/theme.ts`

**Interfaces:**
- Produces: the same `export const theme` (unchanged shape/name), so every existing `import { theme } from '../theme/theme'` / `ThemeProvider` consumer keeps working unmodified.

- [ ] **Step 1: Replace the token values**

Replace the full file with:

```ts
import { createTheme } from '@mui/material/styles';

// Design System Foundation tokens (docs/superpowers/specs/2026-07-12-design-system-foundation-design.md).
// Same blue brand family as before, refined toward a more muted enterprise-tool
// shade; neutral scale, type scale, and radius/elevation rules now shared
// verbatim with contractor-portal and mobile-pwa (only the primary hue differs).
const NEUTRAL = {
  50: '#f8f9fb', 100: '#f1f3f6', 200: '#e6e9ee', 300: '#d4d8e0', 400: '#a8afbd',
  500: '#7b8494', 600: '#5b6373', 700: '#414957', 800: '#2a303c', 900: '#0f172a',
};
const SEMANTIC = { success: '#1b7a4a', warning: '#b5760f', error: '#c62d3f', info: '#2856c9' };
const RADIUS = { sm: 6, md: 10, lg: 14 };
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

export const theme = createTheme({
  palette: {
    primary:   { main: '#2856c9' },
    secondary: { main: '#9c27b0' },
    success:   { main: SEMANTIC.success },
    warning:   { main: SEMANTIC.warning },
    error:     { main: SEMANTIC.error },
    info:      { main: SEMANTIC.info },
    background: { default: NEUTRAL[50], paper: '#ffffff' },
    divider: NEUTRAL[200],
    text: { primary: NEUTRAL[900], secondary: NEUTRAL[500] },
  },
  shape: { borderRadius: RADIUS.md },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontSize: '1.375rem', fontWeight: 700 },      // page title, 22px
    h5: { fontSize: '1rem', fontWeight: 700 },           // section heading, 16px
    h6: { fontSize: '1rem', fontWeight: 700 },
    body2: { fontSize: '0.8125rem', color: NEUTRAL[500] }, // secondary/meta, 13px
    caption: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' }, // 11px
  },
  transitions: {
    duration: { shortest: 120, shorter: 160, short: 200, standard: 240 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          boxShadow: 'none',
          border: `1px solid ${NEUTRAL[200]}`,
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiCardActionArea: { styleOverrides: { root: { borderRadius: RADIUS.md } } },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          textTransform: 'none',
          fontWeight: 600,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.18)' },
        },
        outlined: { '&:hover': { backgroundColor: 'rgba(40,86,201,0.06)' } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 600 } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: `0 1px 0 ${NEUTRAL[200]}` } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${NEUTRAL[200]}` } } },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, transition: `background-color ${TRANSITION}, color ${TRANSITION}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { transition: `background-color ${TRANSITION}`, '&:hover': { backgroundColor: 'rgba(40,86,201,0.04)' } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: NEUTRAL[200],
          fontSize: '0.8125rem',
          fontVariantNumeric: 'tabular-nums',
        },
        head: { fontWeight: 700, color: NEUTRAL[600], fontSize: '0.6875rem', letterSpacing: '0.04em', textTransform: 'uppercase' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}` },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, transition: `color ${TRANSITION}` } } },
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        root: { '&.Mui-focusVisible': { outline: '2px solid #2856c9', outlineOffset: 2 } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { '&.MuiPaper-elevation1': { boxShadow: '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.06)' } },
      },
    },
  },
});

export const NEUTRAL_SCALE = NEUTRAL;
export const SEMANTIC_COLORS = SEMANTIC;
export const RADIUS_SCALE = RADIUS;
```

Exporting `NEUTRAL_SCALE`/`SEMANTIC_COLORS`/`RADIUS_SCALE` lets later tasks (StatusColors, DataTable, etc.) reference the same tokens instead of re-declaring hex values.

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/frontend-portal && npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 3: Visual smoke check**

Start the dev server (`npm run dev`), open `http://localhost:5173`, confirm the app loads with the new (slightly deeper blue, slightly cooler gray) palette and nothing is visually broken (unreadable text, invisible borders). This is the most widely visible change in the whole plan — every page is affected.

---

## Task 2: contractor-portal theme tokens

**Files:**
- Modify: `apps/contractor-portal/src/theme/theme.ts`

- [ ] **Step 1: Replace the token values**, mirroring Task 1's structure exactly but with the orange primary and contractor-portal's existing `secondary`/`background` intent preserved:

```ts
import { createTheme } from '@mui/material/styles';

// Design System Foundation tokens — same shape as apps/frontend-portal/src/theme/theme.ts,
// orange brand family refined toward a warmer, less "traffic-cone" shade.
// Red stays reserved for MUI's semantic `error` (danger/overdue/critical) — never decorative.
const NEUTRAL = {
  50: '#f8f9fb', 100: '#f1f3f6', 200: '#e6e9ee', 300: '#d4d8e0', 400: '#a8afbd',
  500: '#7b8494', 600: '#5b6373', 700: '#414957', 800: '#2a303c', 900: '#0f172a',
};
const SEMANTIC = { success: '#1b7a4a', warning: '#b5760f', error: '#c62d3f', info: '#2856c9' };
const RADIUS = { sm: 6, md: 10, lg: 14 };
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

const theme = createTheme({
  palette: {
    primary: { main: '#c65a13', light: '#e8813f', dark: '#8f3e0a' },
    secondary: { main: '#1565c0', light: '#5e92f3', dark: '#003c8f' },
    success:   { main: SEMANTIC.success },
    warning:   { main: SEMANTIC.warning },
    error:     { main: SEMANTIC.error },
    info:      { main: SEMANTIC.info },
    background: { default: NEUTRAL[50], paper: '#ffffff' },
    divider: NEUTRAL[200],
    text: { primary: NEUTRAL[900], secondary: NEUTRAL[500] },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h4: { fontSize: '1.375rem', fontWeight: 700 },
    h5: { fontSize: '1rem', fontWeight: 700 },
    h6: { fontSize: '1rem', fontWeight: 700 },
    body2: { fontSize: '0.8125rem', color: NEUTRAL[500] },
    caption: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' },
  },
  shape: { borderRadius: RADIUS.md },
  transitions: { duration: { shortest: 120, shorter: 160, short: 200, standard: 240 } },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          border: `1px solid ${NEUTRAL[200]}`,
          boxShadow: 'none',
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.sm,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(198,90,19,0.25)',
          '&:hover': { boxShadow: '0 4px 14px rgba(198,90,19,0.32)' },
        },
        outlined: { '&:hover': { backgroundColor: 'rgba(198,90,19,0.06)' } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 600, transition: `background-color ${TRANSITION}, color ${TRANSITION}` } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: `0 1px 0 ${NEUTRAL[200]}` } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${NEUTRAL[200]}` } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: RADIUS.sm, transition: `background-color ${TRANSITION}, color ${TRANSITION}` } } },
    MuiTableRow: { styleOverrides: { root: { transition: `background-color ${TRANSITION}`, '&:hover': { backgroundColor: 'rgba(198,90,19,0.045)' } } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: NEUTRAL[200], fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' },
        head: { fontWeight: 700, color: NEUTRAL[600], fontSize: '0.6875rem', letterSpacing: '0.04em', textTransform: 'uppercase' },
      },
    },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: RADIUS.sm, transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}` } } },
    MuiButtonBase: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: '2px solid #c65a13', outlineOffset: 2 } } },
    },
  },
});

export const NEUTRAL_SCALE = NEUTRAL;
export const SEMANTIC_COLORS = SEMANTIC;
export const RADIUS_SCALE = RADIUS;
export default theme;
```

- [ ] **Step 2: Verify**: `cd apps/contractor-portal && npx tsc --noEmit` → clean.
- [ ] **Step 3: Visual smoke check**: `npm run dev`, open `http://localhost:5174`, confirm the orange palette reads correctly and nothing broke.

---

## Task 3: mobile-pwa theme + connection colors (must match Tasks 1–2 exactly)

**Files:**
- Modify: `apps/mobile-pwa/src/connection.ts`
- Modify: `apps/mobile-pwa/src/theme.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: same `getTheme(mode)`/`modeMeta(mode)` exports, unchanged signatures.

- [ ] **Step 1: Update `MODES` colors in `connection.ts`** to exactly match Task 1's frontend-portal primary and Task 2's contractor-portal primary, so mobile-pwa's two modes are hex-identical to the other two apps' brand colors, not just close:

```ts
export const MODES: { mode: Mode; title: string; subtitle: string; color: string; gradient: string }[] = [
  { mode: 'bpm', title: 'BPM Platform', subtitle: 'Cases, SLA & alerts for operators', color: '#2856c9', gradient: 'linear-gradient(135deg, #2856c9 0%, #163a8f 100%)' },
  { mode: 'contractor', title: 'Contractor Portal', subtitle: 'Work orders for external field teams', color: '#c65a13', gradient: 'linear-gradient(135deg, #c65a13 0%, #8f3e0a 100%)' },
];
```

(Only the `color`/`gradient` values change — `mode`/`title`/`subtitle` and every other line in this file stay exactly as-is.)

- [ ] **Step 2: Add the shared neutral/radius tokens to `theme.ts`**, keeping `buildTheme(primary)`'s signature and every existing component override untouched (mobile-pwa's radius/shadow choices were already deliberately pushed further than the other two apps for touch ergonomics — that stays), only swapping the flat background color for the shared neutral-50 and adding the exported scale constants for consistency with Tasks 1–2:

```ts
// Add near the top, after the MODES import:
const NEUTRAL_50 = '#f8f9fb';
```

Then change line 12 (`background: { default: '#f3f5fa', paper: '#ffffff' },`) to:
```ts
      background: { default: NEUTRAL_50, paper: '#ffffff' },
```

- [ ] **Step 3: Verify**: `cd apps/mobile-pwa && npx tsc --noEmit` → clean.
- [ ] **Step 4: Visual smoke check**: `npm run dev`, open `http://localhost:5175`, check both BPM and Contractor connect-screen modes render with the refined colors.

---

## Task 4: Shared status/priority color utility for frontend-portal + 2-page proof migration

frontend-portal has 12 files independently duplicating case/priority/process-status color maps (`CaseList.tsx`, `CaseDetail.tsx`, `ProcessInstances.tsx`, `ProcessInstanceDetail.tsx`, `Dashboard.tsx`, `CaseWorkTable.tsx`, `WorkItemDetail.tsx`, `CreateCase.tsx`, `ExternalSubmissionReview.tsx`, `SlaPolicies.tsx`, `NotificationTemplates.tsx`, `ProcessAnalytics.tsx`). This task creates the one shared file and migrates 2 of the 12 as proof; the rest are migrated by the Task Management and Data Administration follow-up sub-projects (per the spec's rollout sequence), not here.

**Files:**
- Create: `apps/frontend-portal/src/utils/statusColors.tsx`
- Modify: `apps/frontend-portal/src/pages/cases/CaseList.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessInstances.tsx`

**Interfaces:**
- Produces: `CASE_STATUS_COLORS: Record<string, MuiColor>`, `PROCESS_INSTANCE_STATUS_COLORS: Record<string, MuiColor>`, `CASE_PRIORITY_COLORS: Record<string, MuiColor>`, `CASE_TYPE_COLORS: Record<string, MuiColor>`, where `MuiColor = 'default'|'primary'|'secondary'|'error'|'info'|'success'|'warning'`.

- [ ] **Step 1: Create the shared utility**, using the exact vocab already live in `CaseList.tsx:17-19` and `ProcessInstances.tsx:19-21` (confirmed by reading both files — this is a consolidation, not new taxonomy):

```tsx
// apps/frontend-portal/src/utils/statusColors.tsx
/**
 * Single source of truth for case/process/priority chip colors — previously
 * duplicated independently across CaseList.tsx, ProcessInstances.tsx, and
 * 10 other files. Same values as were already live in CaseList.tsx/
 * ProcessInstances.tsx; only consolidated so future changes happen in one place.
 */
export type MuiChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

export const CASE_TYPE_COLORS: Record<string, MuiChipColor> = {
  incident: 'error', problem: 'warning', change: 'info', request: 'success', alarm: 'secondary',
};

export const CASE_PRIORITY_COLORS: Record<string, MuiChipColor> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

export const CASE_STATUS_COLORS: Record<string, MuiChipColor> = {
  new: 'info', open: 'primary', in_progress: 'warning', resolved: 'success',
  closed: 'default', cancelled: 'default', pending_approval: 'secondary',
};

export const PROCESS_INSTANCE_STATUS_COLORS: Record<string, MuiChipColor> = {
  active: 'primary', completed: 'success', suspended: 'warning', terminated: 'error',
};
```

- [ ] **Step 2: Migrate `CaseList.tsx`**

Replace line 17-19:
```ts
const TYPE_COLORS: Record<string, any> = { incident: 'error', problem: 'warning', change: 'info', request: 'success', alarm: 'secondary' };
const PRIORITY_COLORS: Record<string, any> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };
const STATUS_COLORS: Record<string, any> = { new: 'info', open: 'primary', in_progress: 'warning', resolved: 'success', closed: 'default', cancelled: 'default', pending_approval: 'secondary' };
```
with:
```ts
import { CASE_TYPE_COLORS as TYPE_COLORS, CASE_PRIORITY_COLORS as PRIORITY_COLORS, CASE_STATUS_COLORS as STATUS_COLORS } from '../../utils/statusColors';
```
(placed with the other imports near the top of the file; aliased so every existing `TYPE_COLORS[...]`/`PRIORITY_COLORS[...]`/`STATUS_COLORS[...]` reference in the rest of the file needs zero further changes).

- [ ] **Step 3: Migrate `ProcessInstances.tsx`**

Replace its local `STATUS_COLORS` const (line 19-21) with:
```ts
import { PROCESS_INSTANCE_STATUS_COLORS as STATUS_COLORS } from '../../utils/statusColors';
```

- [ ] **Step 4: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal case-assignee-reassignment.spec.ts my-requests-flow.spec.ts` → both still pass (these exercise CaseList/case status chips indirectly).

---

## Task 5: EmptyState component for frontend-portal and contractor-portal

**Files:**
- Create: `apps/frontend-portal/src/components/EmptyState.tsx`
- Create: `apps/contractor-portal/src/components/EmptyState.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessInstances.tsx` (proof migration — it already has an inline empty-state row)

**Interfaces:**
- Produces: `<EmptyState icon={ReactNode} title={string} description?={string} action?={ReactNode} />`

- [ ] **Step 1: Create `apps/frontend-portal/src/components/EmptyState.tsx`**, matching the shape already established in `apps/mobile-pwa/src/components/ui.tsx`'s `EmptyState`:

```tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

export default function EmptyState({
  icon, title, description, action,
}: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary' }}>
      <Box sx={{ fontSize: 40, mb: 1.5, opacity: 0.4, display: 'flex', justifyContent: 'center' }}>{icon}</Box>
      <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: description ? 0.5 : 2 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ mb: 2 }}>{description}</Typography>}
      {action}
    </Box>
  );
}
```

- [ ] **Step 2: Create the identical component at `apps/contractor-portal/src/components/EmptyState.tsx`** (same code, same file — parallel-files pattern per the spec).

- [ ] **Step 3: Migrate `ProcessInstances.tsx`'s empty-state table row** (currently `<TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No requests found</Typography></TableCell>`) to use it:

```tsx
import InboxIcon from '@mui/icons-material/Inbox';
import EmptyState from '../../components/EmptyState';
// ...
{!data?.data?.length && (
  <TableRow>
    <TableCell colSpan={6}>
      <EmptyState icon={<InboxIcon fontSize="inherit" />} title="No requests found" description="Try a different filter, or start a new request from the Service Catalog." />
    </TableCell>
  </TableRow>
)}
```

- [ ] **Step 4: Verify**: `npx tsc --noEmit` in both apps → clean.

---

## Task 6: PageHeader shared component + migrate 3 detail pages

**Files:**
- Create: `apps/frontend-portal/src/components/PageHeader.tsx`
- Modify: `apps/frontend-portal/src/pages/cases/CaseDetail.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessInstanceDetail.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx`

**Interfaces:**
- Consumes: `BackButton` (`apps/frontend-portal/src/components/BackButton.tsx`, already exists from a prior session).
- Produces: `<PageHeader backTo={string} backLabel={string} title={string} chips?={ReactNode} actions?={ReactNode} />`

- [ ] **Step 1: Create `PageHeader.tsx`**

```tsx
import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from './BackButton';

export default function PageHeader({
  backTo, backLabel, title, chips, actions,
}: { backTo: string; backLabel: string; title: string; chips?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <BackButton to={backTo} label={backLabel} sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>{title}</Typography>
        {chips}
        {actions && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Migrate `CaseDetail.tsx`**

Replace the existing breadcrumb block (`<Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/cases')} sx={{ mb: 2 }}>Back to Cases</Button>` at line 431, plus whatever title `Typography` immediately follows it) with:

```tsx
<PageHeader backTo="/cases" backLabel="Back to Cases" title={`Case ${c.case_number}`} />
```

(Exact title expression depends on the surrounding variable name for the loaded case — use whatever local variable already holds `case_number` at that point in the component; do not introduce a new query.)

- [ ] **Step 3: Migrate `ProcessInstanceDetail.tsx`**

Replace the header `Paper`'s inner `Box` (the `BackButton` + `Typography variant="h6"` + status `Chip` row) with:

```tsx
<PageHeader
  backTo="/processes/instances"
  backLabel="Back to Process Monitor"
  title={inst.definition_name}
  chips={<Chip label={inst.status} size="small" color={STATUS_COLORS[inst.status] || 'default'} />}
  actions={/* existing Suspend/Resume/Terminate buttons, unchanged */}
/>
```

Keep the existing `canControl`/`isActive`/`isSuspended` conditional logic around the action buttons exactly as it is today — only their container changes from inline JSX to `PageHeader`'s `actions` prop.

- [ ] **Step 4: Migrate `ProcessStudio.tsx`**

Replace the `BackButton` + `Typography variant="h6"` + version/status `Chip`s at the start of the toolbar `Paper` with:

```tsx
<PageHeader
  backTo="/processes"
  backLabel="Back to Process List"
  title={def.name}
  chips={<>
    <Chip label={`v${def.version}`} size="small" variant="outlined" />
    <Chip label={def.status} size="small" color={def.status === 'active' ? 'success' : 'warning'} />
    {dirty && <Chip label="Unsaved changes" size="small" sx={{ fontStyle: 'italic' }} />}
  </>}
/>
```

Keep the Checks/Save/Publish button group exactly as built in the prior session — it stays inside the toolbar `Paper`, below or beside `PageHeader`, not inside its `actions` prop (that toolbar has its own validated layout/logic with `errorCount`/`dirty`/`validating` state that should not be disturbed).

- [ ] **Step 5: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal` → full main-portal suite still green (exercises CaseDetail, ProcessStudio, ProcessInstanceDetail via `case-assignee-reassignment.spec.ts`, `process-studio-start-event-fields.spec.ts`, `process-studio-validation.spec.ts`).

---

## Task 7: KPIStatCard shared component + migrate ProcessAnalytics

**Files:**
- Create: `apps/frontend-portal/src/components/KPIStatCard.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessAnalytics.tsx`

- [ ] **Step 1: Create `KPIStatCard.tsx`**, formalizing `ProcessAnalytics.tsx`'s existing inline `StatCard` (same props, same visual job, now shared):

```tsx
import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

export default function KPIStatCard({
  label, value, sub, color = '#2856c9',
}: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h3" sx={{ color, fontWeight: 700, lineHeight: 1 }}>{value ?? '—'}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{label}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: In `ProcessAnalytics.tsx`**, delete the local `function StatCard(...)` definition (lines 18-30) and add:

```tsx
import KPIStatCard from '../../components/KPIStatCard';
```

Then find-and-replace every JSX usage of `<StatCard` with `<KPIStatCard` in this file (props are identical, no other change needed).

- [ ] **Step 3: Verify**: `npx tsc --noEmit` → clean. Visually open `/processes/analytics` in the browser, confirm the stat cards render identically to before (this is a pure extraction, not a redesign).

---

## Task 8: DataTable shared component + migrate ProcessInstances.tsx

**Files:**
- Create: `apps/frontend-portal/src/components/DataTable.tsx`
- Modify: `apps/frontend-portal/src/pages/process-studio/ProcessInstances.tsx`

**Interfaces:**
- Consumes: `EmptyState` (Task 5).
- Produces:
```ts
interface DataTableColumn<T> { key: string; label: string; render: (row: T) => React.ReactNode; align?: 'left'|'right'|'center'; }
interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState: React.ReactNode;
  page: number; pageSize: number; total: number;
  onPageChange: (page: number) => void;
}
```

- [ ] **Step 1: Create `DataTable.tsx`**

```tsx
import React from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell, TablePagination, Box, CircularProgress } from '@mui/material';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export default function DataTable<T>({
  columns, rows, rowKey, onRowClick, loading, emptyState, page, pageSize, total, onPageChange,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState: React.ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      {loading ? (
        <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {columns.map(c => <TableCell key={c.key} align={c.align}>{c.label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={rowKey(row)} hover={!!onRowClick} sx={onRowClick ? { cursor: 'pointer' } : undefined}
                onClick={() => onRowClick?.(row)}>
                {columns.map(c => <TableCell key={c.key} align={c.align}>{c.render(row)}</TableCell>)}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={columns.length}>{emptyState}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[pageSize]}
      />
    </>
  );
}
```

- [ ] **Step 2: Migrate `ProcessInstances.tsx`'s table** to use it — replace the `<Table>...</Table>` and `<TablePagination>` block with:

```tsx
import DataTable, { DataTableColumn } from '../../components/DataTable';
import InboxIcon from '@mui/icons-material/Inbox';
import EmptyState from '../../components/EmptyState';

// ...inside the component, define once:
const columns: DataTableColumn<any>[] = [
  { key: 'process', label: 'Process', render: r => <Typography variant="body2" fontWeight={500}>{r.definition_name}</Typography> },
  { key: 'ref', label: 'Reference', render: r => <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{r.business_key || '—'}</Typography> },
  { key: 'status', label: 'Status', render: r => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} /> },
  { key: 'submitted', label: 'Submitted', render: r => <Typography variant="body2">{format(new Date(r.started_at), 'dd MMM HH:mm')}</Typography> },
  { key: 'completed', label: 'Completed', render: r => r.completed_at ? <Typography variant="body2">{format(new Date(r.completed_at), 'dd MMM HH:mm')}</Typography> : <Typography variant="caption" color="text.secondary">—</Typography> },
  { key: 'actions', label: 'Actions', align: 'right', render: r => (
    <>
      <Tooltip title="View Details"><IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/processes/instances/${r.id}`); }}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
      {['terminated', 'completed'].includes(r.status) && (
        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDeleteInst({ id: r.id, name: r.business_key || r.definition_name }); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      )}
    </>
  ) },
];

// ...in the JSX, inside the existing <Card><CardContent sx={{ p: 0 }}> wrapper:
<DataTable
  columns={columns}
  rows={data?.data || []}
  rowKey={r => r.id}
  onRowClick={r => navigate(`/processes/instances/${r.id}`)}
  loading={isLoading}
  emptyState={<EmptyState icon={<InboxIcon fontSize="inherit" />} title="No requests found" description="Try a different filter, or start a new request from the Service Catalog." />}
  page={page}
  pageSize={pageSize}
  total={data?.total || 0}
  onPageChange={setPage}
/>
```

Remove the now-unused `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell`, `TablePagination` imports if nothing else in the file still uses them (check the delete-confirmation `Dialog` and filter `Select`s don't need them — they don't).

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Run: `cd e2e && npx playwright test --project=main-portal` → full suite green (no spec targets `ProcessInstances.tsx` directly today, but `process-studio-validation.spec.ts` and others navigate through `/processes/instances` indirectly — confirm nothing regresses).
Manual: open `/processes/instances`, confirm sorting/pagination/row-click/delete all behave identically to before.

---

## Task 9: DetailPanel, TaskCard, SplitView — build only, no migration yet

These three have no natural consumer until the Data Administration and Task Management follow-up sub-projects (per the spec's rollout sequence) — built now so those specs can reference working, typed components instead of designing them from scratch later.

**Files:**
- Create: `apps/frontend-portal/src/components/DetailPanel.tsx`
- Create: `apps/frontend-portal/src/components/TaskCard.tsx`
- Create: `apps/frontend-portal/src/components/SplitView.tsx`

- [ ] **Step 1: `DetailPanel.tsx`**

```tsx
import React from 'react';
import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function DetailPanel({
  open, onClose, title, width = 480, children,
}: { open: boolean; onClose: () => void; title: string; width?: number; children: React.ReactNode }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6">{title}</Typography>
        <IconButton size="small" onClick={onClose} aria-label={`Close ${title}`}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>{children}</Box>
    </Drawer>
  );
}
```

- [ ] **Step 2: `TaskCard.tsx`**

```tsx
import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

export default function TaskCard({
  title, meta, statusChip, dueChip, onClick,
}: { title: string; meta: string; statusChip?: React.ReactNode; dueChip?: React.ReactNode; onClick?: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5,
        border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mb: 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 160ms ease, background-color 160ms ease',
        '&:hover': onClick ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : undefined,
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{title}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{meta}</Typography>
      </Box>
      {statusChip}
      {dueChip}
    </Box>
  );
}
```

- [ ] **Step 3: `SplitView.tsx`**

```tsx
import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';

/** Camunda-Tasklist-style list+detail layout. Collapses to list-only (detail
 * shown via drill-in navigation, handled by the caller) below the `md` breakpoint. */
export default function SplitView({
  list, detail, listWidth = 380, showDetailOnMobile = false,
}: { list: React.ReactNode; detail: React.ReactNode; listWidth?: number; showDetailOnMobile?: boolean }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));

  if (isNarrow) {
    return <Box>{showDetailOnMobile ? detail : list}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', gap: 2, height: '100%', minHeight: 0 }}>
      <Box sx={{ width: listWidth, flexShrink: 0, overflowY: 'auto' }}>{list}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto' }}>{detail}</Box>
    </Box>
  );
}
```

- [ ] **Step 4: Verify**: `npx tsc --noEmit` → clean. No visual check needed (unused so far) — confirm each file exports cleanly by importing and rendering it once in a throwaway test render if `vitest`/RTL existed (it doesn't — see the design spec's non-goals); a `tsc` clean pass plus visual confirmation once a follow-up sub-project actually renders them is the practical bar here.

---

## Task 10: Full regression + rebuild

- [ ] **Step 1**: `cd apps/frontend-portal && npx tsc --noEmit`, `cd apps/contractor-portal && npx tsc --noEmit`, `cd apps/mobile-pwa && npx tsc --noEmit` — all three clean.
- [ ] **Step 2**: `cd infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend contractor-frontend mobile-pwa` — all three rebuild and report healthy.
- [ ] **Step 3**: `cd e2e && npx playwright test` — full suite green (baseline before this plan: 43 passed, 1 pre-existing skip; expect the same count after, since this plan changes presentation only).
- [ ] **Step 4**: Report to the user the exact list of pages whose appearance changed, per their explicit request to be told after each piece of work — for this plan: **every page in all three apps** (theme tokens cascade globally), with named specific changes on: Cases list, Case detail, Process Studio, Process Monitor (instances list), Process Instance detail, Process Analytics.

---

## Self-Review Notes

- **Spec coverage**: color/type/spacing/radius/shadow tokens (Tasks 1-3), DataTable (Task 8), DetailPanel (Task 9), StatusChip/PriorityChip (Task 4 — implemented as color-map utility matching the app's existing MUI-semantic-color convention, not a new component, since frontend-portal already renders these via plain `<Chip color=.../>`, unlike contractor-portal's tinted-hex approach), TaskCard (Task 9), SplitView (Task 9), KPIStatCard (Task 7), PageHeader (Task 6), EmptyState (Task 5) — all eight covered.
- **Not covered here, intentionally** (per the spec's rollout sequence, each is its own follow-up spec): wiring DataTable/DetailPanel/TaskCard/SplitView into the Data Administration and Task Management screens; Process Studio structural changes (none planned — harmonization only, done in Task 6); navigation/launcher tile restyling (Enterprise Navigation sub-project); mobile-pwa screen-level refinement beyond the color/token sync in Task 3 (Mobile Employee Portal sub-project).
- **Type consistency checked**: `PageHeader`'s `backTo`/`backLabel` match `BackButton`'s existing `to`/`label` props exactly (confirmed by reading `BackButton.tsx` from the prior session). `DataTable<T>`'s `columns`/`rows`/`rowKey` shape is generic and doesn't assume any one page's data shape.
