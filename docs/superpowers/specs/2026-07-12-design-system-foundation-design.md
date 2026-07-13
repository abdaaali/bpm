# Design System Foundation — Design Spec

## Context

The BPM platform's three frontend apps (`frontend-portal`, `contractor-portal`, `mobile-pwa`) each grew their own MUI theme independently. Each is internally reasonably consistent (all three already use a shared `RADIUS`/`TRANSITION`-constant pattern, established in an earlier redesign session), but there is no single source of truth across apps: hex values for the "same" brand color differ slightly between apps, gray/neutral tones are hand-picked ad hoc per file, status/priority color mappings exist only in `contractor-portal` and `mobile-pwa` (not `frontend-portal`), and every list page reimplements its own table/pagination/empty-state wiring from scratch.

The user asked for a redesign informed by seven reference products — Camunda 8 Tasklist, Retool, Kissflow, Pipefy, SaaSFrame table examples, a generic "Workflow Dashboard UI" style, and AuraQuantic's employee portal — combined into one consistent system, explicitly **not** a decorative reskin: it must stay practical for dense enterprise data, long forms, and everyday operational use, and must preserve all existing APIs, permissions, routes, auth, and business logic.

This spec covers the **foundation only**: the shared design tokens and shared component patterns that five follow-up sub-projects (Task Management, Data Administration, Process Creation, Enterprise Navigation, Mobile Employee Portal) will each consume. Decomposed this way because the full request spans six genuinely independent subsystems — one spec covering all of them would be too diffuse to implement well. Each follow-up gets its own spec → plan → implementation cycle.

## Goals

- One documented set of design tokens (color, typography, spacing, radius, shadow) that all three apps implement identically, parameterized only by each app's own brand hue.
- A small set of shared, reusable component patterns (data table, detail panel, status/priority chip, task card, split-view layout, KPI stat card, page header, empty state) that replace each page's current ad hoc implementation of the same thing.
- Zero change to routes, permissions, API calls, authentication, or business logic — this is presentation-layer only.

## Non-goals

- No shared npm package / workspace — each app keeps its own independent `theme.ts` and component files, written to match this one spec (confirmed with the user: the codebase already has no monorepo tooling, and introducing one is a bigger architectural change than this task implies).
- No structural rework of Process Studio (toolbar hierarchy, validation panel, Properties Panel layout) or the sidebar/launcher/ModuleNav navigation architecture — both were deliberately built and audited in an immediately prior session and are harmonized onto the new tokens, not redesigned.
- No new font — Roboto stays (already loaded, zero new dependency, matches MUI's default metrics).
- No dark mode — out of scope unless raised later.

## Design tokens

### Color

Existing per-app hues are kept but refined toward a more muted, "enterprise tool" feel (closer to Retool/Linear's desaturated palettes than default MUI blue/orange):

| Token | frontend-portal | contractor-portal | mobile-pwa |
|---|---|---|---|
| `primary` | `#2856c9` (was `#1976d2`) | `#c65a13` (was `#e65100`) | BPM mode = frontend-portal's `#2856c9`; Contractor mode = contractor-portal's `#c65a13` — exact hex match, not just "close," so the three apps are provably one product family |

**Neutral scale** — one 10-step gray scale, identical across all three apps, replacing each app's current hand-picked grays (`#f5f5f5`, `#fafafa`, `#e0e0e0`, etc. chosen ad hoc per file):

```
neutral-50  #f8f9fb   (page background)
neutral-100 #f1f3f6
neutral-200 #e6e9ee   (borders, dividers)
neutral-300 #d4d8e0
neutral-400 #a8afbd   (disabled text)
neutral-500 #7b8494   (secondary/meta text)
neutral-600 #5b6373
neutral-700 #414957
neutral-800 #2a303c
neutral-900 #0f172a   (primary text)
```

**Semantic status colors** — one shared mapping across all three apps and every use (case status, task priority, validation severity, SLA breach state):

```
success  #1b7a4a
warning  #b5760f
error    #c62d3f
info     #2856c9   (== frontend-portal primary)
```

This is `contractor-portal/utils/statusColors.tsx`'s existing `PRIORITY_COLORS`/`STATUS_META` pattern, extended to become the one canonical mapping every app uses (frontend-portal currently has no equivalent file at all and will gain one).

**Known impact**: because the neutral scale is new and shared, borders/backgrounds shift by a few shades in all three apps even outside primary-color areas, not just where the primary hue appears. Confirmed acceptable with the user.

### Typography

Roboto stays. An explicit scale replaces today's ad hoc per-page `variant="h4"`/weight tweaks:

| Role | Size / weight |
|---|---|
| Page title | 22px / 700 |
| Section heading | 16px / 700 |
| Body | 14px / 400 |
| Secondary/meta text | 13px / 400, `neutral-500` |
| Table/data | 13px / 500, `font-variant-numeric: tabular-nums` |
| Caption/label (eyebrows, badge text) | 11px / 600, letter-spacing `0.04em` |

### Spacing, radius, shadow

- **Spacing**: explicit 4px base grid rule (MUI's `theme.spacing(1) = 8px` already implies this; today's scattered non-grid values like `sx={{ p: 1.7 }}` are the actual inconsistency being fixed — new code should snap to the grid).
- **Radius**: a 3-step scale replaces each app's single hardcoded `RADIUS` constant — `sm=6px` (chips, inputs), `md=10px` (cards), `lg=14px` (panels, dialogs).
- **Elevation**: two levels only — `resting` (1px `neutral-200` border, no shadow — most enterprise tables/cards use this) and `raised` (a soft shadow, reserved for popovers/menus/dragged items).

## Shared component patterns

Each is a per-app component (per the "parallel files, one spec" decision), reusing existing code where it already exists rather than being redesigned from scratch:

| Component | Reuses | Replaces |
|---|---|---|
| **DataTable** | MUI `Table`/`TableHead`/`TableBody`/`TablePagination`, already used ad hoc in `ProcessInstances.tsx`, `AuditLog.tsx`, etc. | Each list page's own hand-rolled table/pagination/filter wiring — becomes one component per app with sortable headers, a filter-bar slot, row-hover action icons, optional batch-select + bulk-action bar, a consistent empty state, and a loading skeleton. |
| **DetailPanel** | New — a right-anchored MUI `Drawer` | Nothing existing; net-new pattern for lightweight CRUD (connectors, org units, notification templates) that today either has no dedicated UI or is jammed into a modal. Reserved for genuinely simple records — `CaseDetail`/`ProcessInstanceDetail` stay full pages. |
| **StatusChip / PriorityChip** | `contractor-portal/utils/statusColors.tsx`, `mobile-pwa/components/ui.tsx` — **already correct, extends verbatim** | frontend-portal gaining an equivalent file instead of inventing a new shape. |
| **TaskCard** | Existing card patterns in `mobile-pwa/pages/Home.tsx` | Ad hoc row rendering in Workplace's To Do/Team Queue tabs. Consistent shape: status/priority indicator, title, `process · assignee · due` meta line, due chip. |
| **SplitView** | New | Nothing existing; net-new layout (fixed-width list pane + flexible detail pane) for the Task Management sub-project's Camunda-style inbox. Collapses to list-only with drill-in below a defined breakpoint. |
| **KPIStatCard** | `ProcessAnalytics.tsx`'s existing raw `StatCard` | Formalized into the shared pattern (big number, label, optional trend, icon), same visual job, reusable across Dashboard/Analytics pages. |
| **PageHeader** | Inline patterns already in `CaseDetail`/`ProcessStudio`/`ProcessInstanceDetail`, and last session's `BackButton` | Each page's hand-rolled `Back + title + chips + actions` row — pulled into one shared component. |
| **EmptyState** | `mobile-pwa/components/ui.tsx` | frontend-portal/contractor-portal's ad hoc "no data" messages. |

## Navigation (applies existing tokens, no structural change)

Sidebar rail, tile-launcher pages, and `ModuleNav`'s contextual tab bar are kept exactly as architected (confirmed duplicate-free in a prior session's audit). Changes are token application only: active-state and tile styling onto the new neutral scale/radius/shadow rules; `Launcher.tsx` tiles gain lightweight category grouping using `ModuleNav.tsx`'s existing `GROUPS` domain data (presentation of existing data, not new taxonomy); `ModuleNav`'s tab styling aligns with `PageHeader`'s tab treatment instead of its current bespoke styling.

## Mobile Employee Portal (applies existing tokens, refines existing screens)

mobile-pwa's existing dual-theme (blue/orange) Connect/Login/Home redesign becomes the foundation's mobile expression rather than being rebuilt. Its blue/orange now exactly match frontend-portal's/contractor-portal's refined hex values (today they're close but not identical). AuraQuantic's specific contribution: simpler task-list rows (one visible primary action, secondary actions behind a menu) and larger bottom-nav tap targets — refinement, not restructuring. The shared `TaskCard`/`StatusChip`/`EmptyState` patterns above are mobile-pwa's own existing `ui.tsx` conventions extended to the other two apps, not the reverse.

## Constraints (all confirmed with the user)

- Preserve all existing APIs, permissions, workflows, route behavior, authentication, and business logic — presentation-layer only.
- No shared package/workspace; parallel per-app `theme.ts` files matching this spec.
- Keep each app's brand hue family (blue / orange / dual); refine exact shades only.
- Harmonize Process Studio and the navigation architecture onto new tokens; do not restructure either.
- After each follow-up sub-project ships, tell the user exactly which pages were affected so they can check them live.

## Rollout sequence (follow-up specs, not detailed here)

1. Task Management (Workplace/inbox → Camunda-style split-view)
2. Data Administration (org/contractor/connector/audit admin screens → Retool-style tables + side-panel CRUD)
3. Process Creation (Process Studio → re-skinned onto foundation tokens)
4. Enterprise Navigation (token application to sidebar/launcher/ModuleNav)
5. Mobile Employee Portal (mobile-pwa refinement)

Each will get its own brainstorming pass before implementation, per the user's request to review affected pages after each one lands.
