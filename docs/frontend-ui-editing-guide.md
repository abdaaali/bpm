# Frontend UI Editing Guide

> Every command and path below was verified against this repository on 2026-07-12 — including actually starting the dev server, editing a real file, watching HMR fire, and confirming the API proxy reaches a live backend. Not generic React advice.

There are **three separate frontend apps**, each with its own `package.json`, dev server, and port:

| App | Path | Dev port | Purpose |
|---|---|---|---|
| `frontend-portal` | `apps/frontend-portal` | **5173** | Main internal portal — Process Studio lives here |
| `contractor-portal` | `apps/contractor-portal` | **5174** | External contractor portal |
| `mobile-pwa` | `apps/mobile-pwa` | **5175** | Dual-mode mobile PWA |

This guide focuses on `frontend-portal` (where Process Studio lives) but the workflow is identical for the other two.

## 1–4. Versions, install, dev command, URL

- **Node**: no `.nvmrc`/`engines` field is pinned in this repo; the Docker build images use `node:20-alpine`, so Node 20.x is the target. This session ran successfully against Node v26.4.0/npm 11.17.0 too — no version-specific syntax is used, but if you hit a strange build error, try Node 20 first.
- **Package manager**: npm (every app has a `package-lock.json`, no `yarn.lock`/`pnpm-lock.yaml` anywhere in `apps/*`).
- **Install**: `cd apps/frontend-portal && npm install`
- **Dev command**: `npm run dev` → runs `vite` (from `package.json`'s `"dev": "vite"` script)
- **Local URL**: `http://localhost:5173`

## 5. Required backend services for Process Studio

Process Studio needs, at minimum, the containers that serve `/api/v1/processes/*`:

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres kafka keycloak org-service approval-service bpm-orchestrator case-service api-gateway
```

`api-gateway` (port 3000, published in the **base** compose file — no dev overlay needed for this one) is what the frontend actually talks to; it proxies to `bpm-orchestrator`, `approval-service`, `org-service`, and `case-service` internally. Keycloak (port 8443) is required for login.

## 6. Environment files required for local development

`apps/frontend-portal/.env.local` (gitignored, create it yourself — there's no committed `.env.example` for this app specifically):

```
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8443
VITE_KEYCLOAK_REALM=bpm
VITE_KEYCLOAK_CLIENT_ID=bpm-frontend
```

These are only read at **build time** (`vite build`, for the Docker image) via `import.meta.env`. Running `npm run dev` doesn't strictly need this file for basic UI work since API calls go through the Vite dev proxy (see below), but Keycloak login (`AuthContext.tsx`) does read `VITE_KEYCLOAK_URL`/`VITE_KEYCLOAK_REALM`/`VITE_KEYCLOAK_CLIENT_ID` directly — without `.env.local`, those fall back to `keycloak-js` defaults which won't match this realm, so **create the file above if you need to log in while running `npm run dev`.**

## 7–8. Hot Module Replacement — how it works, and what needs a restart

Verified live in this session: editing `apps/frontend-portal/src/pages/process-studio/ProcessList.tsx` while `npm run dev` was running produced this in the terminal within one second of saving, with no manual refresh:

```
7:02:14 PM [vite] hmr update /src/pages/process-studio/ProcessList.tsx
```

**Appears without restarting** (Vite's React Fast Refresh swaps the module in-place, usually preserving component state):
- Any edit inside a `.tsx`/`.ts` file under `src/` — JSX markup, styles, component logic, new imports of already-installed packages.
- Edits to `src/theme/theme.ts` (MUI theme tokens) — the whole app re-renders with the new theme live.

**Requires a manual dev-server restart** (`Ctrl+C`, then `npm run dev` again):
- Editing `vite.config.ts` itself (proxy rules, port, plugins).
- Adding a **new** dependency to `package.json` (needs `npm install` first, then Vite's dependency pre-bundling step — you'll see `✨ new dependencies optimized` / `✨ optimized dependencies changed. reloading` in the log, which sometimes triggers a full page reload rather than a hot patch).
- Editing `index.html`.
- Editing `.env.local` (Vite only reads env files at server start).

## 9. Where routes are defined

`apps/frontend-portal/src/App.tsx` — a single `<Routes>` tree using `react-router-dom` v6. Process Studio's routes: `/processes` (list), `/processes/:id/studio` (canvas), `/processes/instances` (monitor), `/processes/instances/:id` (detail), `/processes/analytics`.

## 10. Where the global layout is defined

`apps/frontend-portal/src/components/Layout.tsx` — the AppBar + sidebar shell every authenticated route renders inside (wraps the `<Outlet/>`).

## 11–13. Sidebar, top navigation, page tabs

- **Sidebar navigation items**: also in `Layout.tsx` — a static array of `{ label, path, icon, permission }` entries rendered as the drawer's `ListItemButton`s.
- **Top bar**: the `AppBar` in the same file (search box, user menu, notifications).
- **Page-level tabs**: each page owns its own tabs where present (e.g. `ProcessInstanceDetail.tsx` uses MUI `<Tabs>` internally) — there is no shared/global tab component; see the navigation audit in this session's final report for the current inventory of every tab/nav entry.

## 14. Design tokens — typography, spacing, colors, borders, shadows, breakpoints

`apps/frontend-portal/src/theme/theme.ts` — a single `createTheme()` call. It defines:
- `RADIUS`/`TRANSITION` constants used across `components.styleOverrides`
- Palette (`primary` `#1976d2`, `secondary` `#9c27b0`)
- `MuiCard`, `MuiButton`, `MuiChip`, `MuiAppBar`, `MuiDrawer`, `MuiListItemButton`, `MuiTableRow`, `MuiTableCell`, `MuiOutlinedInput`, `MuiTab`, `MuiButtonBase` style overrides

MUI's default breakpoints (`xs`/`sm`/`md`/`lg`/`xl`) are used as-is — not overridden in this file. Change spacing/color/radius here, not with inline `sx` magic numbers scattered across pages, to keep the app visually consistent.

## 15. Process Studio layout and Properties Panel styles

- `apps/frontend-portal/src/pages/process-studio/ProcessStudio.tsx` — the toolbar (`Paper` at the top), the canvas/panel split (`Box sx={{ display: 'flex' }}` containing the bpmn-js container `Box` and the Properties `Paper`), and the validation findings drawer.
- `apps/frontend-portal/src/pages/process-studio/PropertiesPanel.tsx` — every per-element-type section (User Task, Start Event, Sequence Flow, Gateway, Service Task), the shared `FormFieldEditor`, `OptionsEditor`, and `ConditionBuilder` sub-components.
- The canvas/panel proportions are controlled directly in `ProcessStudio.tsx`: canvas is `flexGrow: 1`, the Properties Panel is a fixed `width: 360` `Paper`. To make the panel resizable, that's the exact `sx` to change.

## 16. Editing the BPMN canvas toolbar and palette

The toolbar (Back/Checks/Save/Publish buttons, version/status chips) is plain MUI JSX at the top of `ProcessStudio.tsx` — edit it like any other component.

The BPMN **palette** (the floating left-side tool tray for dragging new elements onto the canvas) comes from `bpmn-js` itself, not this codebase — it's rendered by the `Modeler` instantiated in `ProcessStudio.tsx`'s `useEffect` (`new Modeler({ container: containerRef.current })`). To restrict which element types the palette offers (e.g. hiding `scriptTask`/`subProcess` now that [`docs/bpmn-compatibility-contract.md`](bpmn-compatibility-contract.md) documents them as unsupported by the runtime), you'd need to pass a custom palette module to the `Modeler` constructor (`bpmn-js`'s module override mechanism) — not attempted in this pass; currently the palette is the stock `bpmn-js` default and unsupported elements are caught by validation at Checks/Publish time instead of being hidden from the palette.

## 17. Testing desktop, tablet, and mobile layouts

No project-specific responsive testing tooling exists. Use your browser's built-in device toolbar:
- Chrome/Edge DevTools → `Ctrl+Shift+M` → set width to 1440 / 1024 / 768 / 390 manually (there's no saved device preset matching these exact breakpoints by default — add one, or just drag the viewport width).
- Process Studio itself is desktop-oriented by design (a BPMN canvas isn't realistically editable on a 390px phone) — verify it degrades gracefully rather than becoming interactive-but-broken at narrow widths.

## 18. Running frontend unit tests

**None exist.** Confirmed via `package.json`: `frontend-portal`, `contractor-portal`, and `mobile-pwa` all have zero `"test"` script and no `@testing-library`/`vitest`/`jest` devDependency. If you need one, `vitest` is the natural fit (same author as Vite, zero extra config for a Vite project) — not added in this pass since none of the three apps has any existing frontend unit test convention to extend.

## 19. Running browser / Playwright tests

The E2E suite lives in `e2e/` (a separate npm package, its own `node_modules`/`package.json`), covering all three frontend apps plus backend-only diagnostics:

```bash
cd e2e
npm install                                    # first time only
npx playwright test                            # full suite
npx playwright test --project=main-portal      # frontend-portal only
npx playwright test --project=contractor-portal
npx playwright test --project=mobile-pwa
npx playwright test --project=backend-workflow # API-only, no browser
npx playwright show-report                     # view the last HTML report
```

Run these from **`e2e/`**, not the repo root — running from the wrong directory has previously caused an unrelated Jest test file elsewhere in the repo to be picked up by mistake.

## 20. Why a UI change might not appear

| Symptom | Likely cause |
|---|---|
| Edited a file, nothing changes in the browser | **Wrong app** — you're editing `apps/contractor-portal` but have `apps/frontend-portal`'s dev server open (or vice versa). Check the terminal's `Local: http://localhost:XXXX` line against which app you started. |
| Browser still shows old content after a hard change (e.g. new route) | **Stale dev server** — some structural changes (new files matched by a glob, `vite.config.ts` edits) need `Ctrl+C` + `npm run dev` again, not just a save. |
| Styles look unchanged after clearing cache | **Stale browser cache** for a *production* build you're comparing against — if you're viewing `http://localhost:8080` (the Docker `frontend` container's nginx-served build) instead of `http://localhost:5173` (Vite dev server), you're looking at whatever was last `docker compose build`'d, not your live edit. Confirm the port in your address bar. |
| A route change doesn't show | Check `App.tsx` — the route might not be registered, or you're hitting a route guarded by a permission your logged-in user doesn't have (silently redirects). |
| CSS override doesn't apply | **Theme override wins** — MUI's `theme.ts` component `styleOverrides` beat inline `sx` in some specificity edge cases (e.g. `!important`-equivalent slot overrides); check `theme.ts` for a matching override before assuming your `sx` prop is broken. |
| `sx={{ borderRadius: N }}` renders way bigger/smaller than expected | MUI's numeric shorthand **multiplies by `theme.shape.borderRadius`** (14 in this theme) — `borderRadius: 5` renders as 70px, not 5px. Use an explicit px string (`'24px'`) for a literal value. Bit this project before (see `PropertiesPanel.tsx`/`ProcessInstanceDetail.tsx` history). |
| API calls fail as 404/HTML-instead-of-JSON in dev | **Vite proxy target mismatch** — `vite.config.ts`'s `server.proxy` must target `http://localhost:PORT`, never a Docker-internal hostname like `api-gateway` or `external-api`, since the Vite dev server runs on your host machine, outside the `bpm-net` Docker network. `frontend-portal`'s config had exactly this bug (fixed in this session — it pointed at `http://api-gateway:3000`, which only resolves inside Docker); `contractor-portal` and `mobile-pwa` were already correct. If you ever see this class of bug again, compare against those two files. |
| Docker volume / container confusion | This repo does **not** bind-mount source into the frontend containers — `apps/*`'s Docker images are built (`npm run build` → static `dist/` served by nginx), not run with `vite dev` + a live-reload volume mount. There is no "edit a file and the container picks it up" workflow; container rebuilds are for production-parity checks only, not day-to-day UI editing. |
| Editing the wrong package | Double-check you're not editing a file under `apps/frontend-portal/dist/` (build output, regenerated and overwritten on every build) instead of `apps/frontend-portal/src/`. |

## Fastest workflow for editing and seeing UI changes live

```bash
# 1. One-time: bring up the backend this app talks to (already running? skip this)
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres kafka keycloak org-service approval-service bpm-orchestrator case-service api-gateway

# 2. One-time per machine: create the env file (see section 6)
cat > ../apps/frontend-portal/.env.local <<'EOF'
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8443
VITE_KEYCLOAK_REALM=bpm
VITE_KEYCLOAK_CLIENT_ID=bpm-frontend
EOF

# 3. Start the dev server
cd ../apps/frontend-portal
npm install    # first time, or after a git pull that touched package.json
npm run dev

# 4. Open http://localhost:5173 in your browser, log in.
# 5. Edit any file under src/ — save — the browser updates in under a second, no refresh needed.
#    Watch the terminal for "[vite] hmr update /src/....tsx" to confirm the edit was picked up.
```

For Process Studio specifically: the canvas is `ProcessStudio.tsx`, the right-hand panel is `PropertiesPanel.tsx`. Both hot-reload exactly like any other page — there is nothing BPMN-specific about the edit-and-see-it-live loop, since `bpmn-js` itself is just another React-managed DOM container.
