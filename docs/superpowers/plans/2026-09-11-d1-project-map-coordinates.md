# D1 Project Map Coordinates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the REA Project Map use authoritative project latitude/longitude from Cloudflare D1 and never fabricate a site pin.

**Architecture:** Add a read-only, REA-admin-authenticated Worker endpoint that returns the current D1 project portfolio including coordinates. Add a focused client data adapter that fetches that endpoint with the existing cloud session token, normalizes D1 records into the Project Map model, and resolves valid coordinates as `[longitude, latitude]`. Preserve the existing map drill-down and visual design while replacing centroid/jitter pin placement with projection of stored coordinates.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Cloudflare Workers, Cloudflare D1.

**Spec:** `docs/superpowers/specs/2026-09-11-d1-project-map-coordinates-design.md`

## Global Constraints

- D1 `projects.latitude` and `projects.longitude` are the source of truth for project pins.
- `GET /api/rea/projects` is read-only and requires an authenticated `rea_admin` session.
- Missing, non-finite, or out-of-range GPS coordinates must not produce a project pin.
- Preserve Nigeria -> State -> LGA -> project drill-down, filters, status colours, animations, controls, and project drawer.
- Do not change Field Officer geofence behavior or unrelated dashboard design.
- Existing D1 demo coordinates remain labelled by their existing `data_source`; this work does not claim they are surveyed coordinates.

---

### Task 1: D1 REA project portfolio endpoint

**Files:**
- Modify: `worker/index.js`
- Create: `tests/rea-projects-route.test.mjs`

**Interfaces:**
- Consumes: existing `authenticatedDatabaseUser(request, env)` and `env.DB` D1 binding.
- Produces: `GET /api/rea/projects` JSON `{ projects, serverTime }`, where each project includes `id`, `name`, `programme`, `component`, `contractor`, `consultantFirm`, `state`, `lga`, `community`, `reportingMonth`, `status`, `installedCapacityKw`, `households`, `verified`, `latitude`, `longitude`, `geofenceRadiusMetres`, `dataSource`, and `updatedAt`.

- [ ] **Step 1: Write the failing route tests**

Create tests that instantiate the Worker with a stub D1 binding and assert: no bearer token returns 401; a valid non-REA user returns 403; a valid REA user returns 200 and the project JSON contains the exact stored latitude/longitude and geofence radius.

- [ ] **Step 2: Run the focused route test and verify RED**

Run: `node --test tests/rea-projects-route.test.mjs`
Expected: FAIL because `/api/rea/projects` does not exist yet.

- [ ] **Step 3: Implement the minimal endpoint**

Add `reaProjectsResponse(request, env)` beside the existing authenticated Worker helpers. Authenticate with `authenticatedDatabaseUser`; reject unauthenticated requests with 401 and non-`rea_admin` users with 403. Query only the project columns defined above, alias snake_case fields to camelCase, order by state/name, and return `{ projects: result.results || [], serverTime: new Date().toISOString() }`.

Route `GET /api/rea/projects` in `fetch()` before `handleFieldApi`; return 405 for other methods and catch/log route failures without exposing internals.

- [ ] **Step 4: Run focused route tests and verify GREEN**

Run: `node --test tests/rea-projects-route.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: expose REA D1 project portfolio`

---

### Task 2: Project Map D1 data adapter and coordinate contract

**Files:**
- Create: `client/lib/rea-project-map-data.ts`
- Create: `client/lib/rea-project-map-data.test.ts`
- Modify: `client/components/ReaProjectMap.coordinates.spec.ts`

**Interfaces:**
- Consumes: `AuthSession.apiToken`, `GET /api/rea/projects`, and the existing `Project`/Map Project field expectations.
- Produces: `fetchReaMapProjects(apiToken: string): Promise<ReaMapProjectRecord[]>` and `resolveProjectCoordinate(project): [number, number] | null`.

- [ ] **Step 1: Write failing adapter tests**

Test that `resolveProjectCoordinate({ latitude: 9.0232043, longitude: 7.4518017 })` returns `[7.4518017, 9.0232043]`; null/missing/out-of-range values return `null`; and the fetch adapter sends `Authorization: Bearer <token>` and preserves returned D1 coordinates.

- [ ] **Step 2: Run focused adapter tests and verify RED**

Run: `npx vitest --run client/lib/rea-project-map-data.test.ts client/components/ReaProjectMap.coordinates.spec.ts`
Expected: FAIL because the adapter/coordinate implementation does not exist.

- [ ] **Step 3: Implement the adapter**

Define the D1 map record type with the endpoint fields. Implement coordinate validation with finite-number checks and bounds `-90 <= latitude <= 90`, `-180 <= longitude <= 180`. Implement the authenticated fetch and throw a concise error when the response is not OK.

- [ ] **Step 4: Run focused adapter tests and verify GREEN**

Run: `npx vitest --run client/lib/rea-project-map-data.test.ts client/components/ReaProjectMap.coordinates.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat: add D1 project map data adapter`

---

### Task 3: Replace synthetic Project Map pins with D1 coordinates

**Files:**
- Modify: `client/components/ReaProjectMap.tsx`
- Test: `client/components/ReaProjectMap.coordinates.spec.ts`

**Interfaces:**
- Consumes: `useAuth().session.apiToken`, `fetchReaMapProjects`, `resolveProjectCoordinate`, existing GeoJSON projectors.
- Produces: Project Map pin layers projected from authoritative D1 `[longitude, latitude]` coordinates.

- [ ] **Step 1: Extend the regression test to reject synthetic placement**

Assert the coordinate helper returns null for missing GPS rather than a centroid/jitter fallback. Keep the known Durumi coordinate assertion.

- [ ] **Step 2: Run the focused regression test and verify RED before implementation**

Run: `npx vitest --run client/components/ReaProjectMap.coordinates.spec.ts`
Expected: FAIL against the pre-change map implementation.

- [ ] **Step 3: Wire the component to D1**

Import `useAuth`, `fetchReaMapProjects`, and `resolveProjectCoordinate`. Fetch the project portfolio once a usable REA `apiToken` is available. Replace the static `projects` source in `enrichProjects` with the fetched records, preserving actual D1 `id`, `lga`, `community`, consultant, status, capacity/households, verification state, latitude/longitude, and data source. Preserve existing derived presentation-only fields where D1 has no equivalent.

Remove `jitterWithin` from project pin positioning. For national, state, and LGA project layers, call `resolveProjectCoordinate(project)` and project the returned `[longitude, latitude]` with the relevant projector. Missing/invalid GPS projects remain in counts/filtering but are absent from pin maps.

- [ ] **Step 4: Add missing-GPS visibility without redesigning the map**

Compute the filtered missing-GPS count and show a compact `Missing GPS` indicator alongside the existing map header statistics when nonzero. Update explanatory copy from “plotted inside” to language that states pins use stored project coordinates. Do not change the surrounding visual structure.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest --run client/components/ReaProjectMap.coordinates.spec.ts client/lib/rea-project-map-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Commit message: `fix: plot REA projects from D1 coordinates`

---

### Task 4: Full verification and integration

**Files:**
- Review: all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: completed endpoint, adapter, and map integration.
- Produces: verified branch suitable for PR review and merge to `main`.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`
Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run TypeScript verification**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run production client build**

Run: `npm run build:client`
Expected: exit 0.

- [ ] **Step 4: Validate Worker syntax**

Run: `node --check worker/index.js`
Expected: exit 0.

- [ ] **Step 5: Review the branch diff against the spec**

Verify no unrelated UI redesign, geofence change, credential exposure, synthetic pin fallback, or modification outside the planned files.

- [ ] **Step 6: Update PR #48 and complete final review**

Ensure PR #48 targets `main`, describes D1 as the location source of truth, and records test/typecheck/build evidence. Merge/deploy only after the user-authorized integration step and clean verification.
