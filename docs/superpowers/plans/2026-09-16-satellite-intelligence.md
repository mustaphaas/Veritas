# Satellite Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable satellite-image analysis and historical change detection to Veritas using each project's authoritative D1 coordinates, Esri World Imagery/Wayback, and the existing AI provider layer.

**Architecture:** Add a dedicated `worker/satellite-api.js` module so imagery retrieval, Wayback metadata, vision prompting, persistence, RBAC and review logic remain isolated from the main Worker. Persist results in D1, surface them through a small client API plus a Project Map satellite-intelligence panel, and add a compact satellite summary to the existing Veritas AI database context. Keep the current Project Map basemap behavior intact.

**Tech Stack:** Cloudflare Workers, D1 SQLite, React 18, TypeScript, Esri World Imagery + World Imagery Wayback, Gemini/OpenRouter multimodal APIs, Node test runner, GitHub Actions, Wrangler.

**Spec:** `docs/superpowers/specs/2026-09-16-satellite-intelligence-design.md`

## Global Constraints

- Project coordinates are always re-read from D1 by project ID; browser-supplied coordinate overrides are not authoritative.
- Satellite evidence never automatically changes a project to Verified or Rejected.
- Esri Wayback release date and actual image capture date are separate fields and must never be conflated.
- REA staff can run/review analyses; consultant admins can only read analyses for projects in their own consultant firm; field officers have no administrative satellite-analysis access.
- AI findings are observations with confidence/limitations, not conclusions of fraud, abandonment, completion, or non-existence.
- Preserve existing Project Map layout, imagery provider switch, filters, zoom and project-pin behavior.
- Commit directly to `main` and deploy through the existing Cloudflare production workflow.

---

### Task 1: Define regression contracts

**Files:**
- Create: `tests/satellite-intelligence-migration.test.mjs`
- Create: `tests/satellite-intelligence-api.test.mjs`
- Create: `tests/satellite-intelligence-ui.test.mjs`
- Create: `tests/satellite-intelligence-ai.test.mjs`

**Interfaces:**
- Produces contract expectations for `satellite_analysis_runs`, `/api/projects/:projectId/satellite-analysis`, `/compare`, review routes, Project Map UI and AI context.

- [ ] Write failing assertions for authoritative D1 coordinates, Esri current imagery, Wayback configuration/metadata, Gemini/OpenRouter multimodal handling, persistence, manual-review flags, RBAC, audit events and no project-status mutation.
- [ ] Write UI assertions for `Satellite Intelligence`, latest-analysis history, current analysis, historical comparison and provider/capture-date display.
- [ ] Write AI assertions for a `satelliteIntelligence` context section and explicit uncertainty safeguards.
- [ ] Run the new tests and verify RED before implementation.
- [ ] Commit with `test: define satellite intelligence contracts`.

### Task 2: Add D1 schema

**Files:**
- Create: `migrations/0007_satellite_intelligence.sql`

**Interfaces:**
- Produces table `satellite_analysis_runs` with project/user foreign keys, analysis type, provider, authoritative coordinates, image/release dates, source references, quality/observation/change JSON, confidence, review state, model metadata and timestamps.

- [ ] Create SQLite-compatible table and indexes on project/time, review status and requested user.
- [ ] Restrict `analysis_type` to `current` / `historical_compare` and `review_status` to `unreviewed` / `accepted` / `needs_followup` / `dismissed`.
- [ ] Run migration contract test and verify PASS.
- [ ] Commit with `feat: add satellite intelligence schema`.

### Task 3: Build satellite provider and analysis API

**Files:**
- Create: `worker/satellite-api.js`
- Modify: `worker/entry.js`
- Test: `tests/satellite-intelligence-api.test.mjs`

**Interfaces:**
- Produces `handleSatelliteApi(request, env)`.
- Routes:
  - `POST /api/projects/:projectId/satellite-analysis`
  - `POST /api/projects/:projectId/satellite-analysis/compare`
  - `GET /api/projects/:projectId/satellite-analysis`
  - `GET /api/satellite-analysis/:analysisId`
  - `PATCH /api/satellite-analysis/:analysisId/review`

- [ ] Add bearer-token authentication by hashing the token and joining `sessions` to `users`.
- [ ] Add project loader that reads latitude/longitude from D1 and rejects missing/out-of-range values; never consume client coordinates.
- [ ] Add Web Mercator tile calculation at zoom 18 and request a 3x3 tile neighborhood around the project coordinate.
- [ ] Current imagery uses Esri World Imagery tiles: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
- [ ] Historical imagery fetches Esri Wayback config from `https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json`, selects the newest valid release and a baseline at least ~180 days older when available, and uses each release's `itemURL` template.
- [ ] Query Wayback metadata at the project coordinate using the release `metadataLayerUrl`, layer id `23 - zoom`, fields `SRC_DATE2,NICE_DESC,SRC_DESC,SAMP_RES,SRC_ACC`, and preserve release date separately from capture date.
- [ ] Fetch image tiles as bytes, convert to base64, and send labelled image parts to Gemini multimodal (`generateContent`) when `GEMINI_API_KEY` exists. Add OpenRouter image-data-url fallback when configured.
- [ ] Require a strict JSON result containing `summary`, `observations`, `visibleInfrastructure`, `changeCategories`, `confidenceLevel`, `confidenceScore`, `limitations`, `reviewRequired`.
- [ ] If no vision provider succeeds, return a clear 503 and do not fabricate findings.
- [ ] Persist successful runs in D1, write `satellite-analysis-run` / `satellite-analysis-reviewed` audit events, and never update `projects.verified` or assignment status.
- [ ] Allow REA to run/review; consultant admin GET only for matching `consultant_firm`; reject field officers.
- [ ] Register `handleSatelliteApi` before the main worker in `worker/entry.js`.
- [ ] Run API tests and `node --check worker/satellite-api.js worker/entry.js`.
- [ ] Commit with `feat: add satellite intelligence API`.

### Task 4: Add Project Map satellite-intelligence client

**Files:**
- Create: `client/lib/satellite-intelligence.ts`
- Modify: `client/components/ProjectMapSatelliteEnhancer.tsx`
- Test: `tests/satellite-intelligence-ui.test.mjs`

**Interfaces:**
- Produces typed `SatelliteAnalysisRecord`, `fetchSatelliteAnalyses`, `runSatelliteAnalysis`, `compareSatelliteImagery`, `reviewSatelliteAnalysis`.

- [ ] Add bearer-authenticated fetch helpers and defensive error messages.
- [ ] Preserve the existing Map/Satellite switch, Esri/Google imagery behavior, filters, markers and click-to-zoom.
- [ ] When a satellite project marker is selected, store the actual selected D1 project object and open a compact right-side `Satellite Intelligence` panel.
- [ ] Show project name, authoritative coordinates, latest provider, Wayback release/capture dates, confidence, review state, summary, limitations and analysis history.
- [ ] Add `Analyse latest imagery` and `Compare historical imagery` actions for REA sessions.
- [ ] Show `Manual review required` when the record says so and never render a verification/rejection action in this panel.
- [ ] Keep the map usable if analysis API fails; errors remain inside the panel.
- [ ] Run UI contract test and client build.
- [ ] Commit with `feat: add satellite intelligence project map panel`.

### Task 5: Ground Veritas AI in stored satellite results

**Files:**
- Create: `scripts/patch-satellite-intelligence-ai.mjs`
- Modify via patch: `worker/index.js`
- Test: `tests/satellite-intelligence-ai.test.mjs`

**Interfaces:**
- Produces `satelliteIntelligence` inside `liveDatabaseContext`.

- [ ] Query the latest bounded satellite-analysis rows joined to projects.
- [ ] Add deterministic aggregates: analysis count, projects analysed, manual-review count, average confidence, by-analysis-type, by-review-status, recent findings.
- [ ] Add prompt rules that distinguish provider facts, model observations, human review and management interpretation; prohibit converting uncertainty into fraud/non-existence/completion claims.
- [ ] Keep recent rows bounded so the normal AI context does not balloon.
- [ ] Run AI context test and Worker syntax checks.
- [ ] Commit with `feat: ground Veritas AI in satellite findings`.

### Task 6: Wire CI, migrate and deploy

**Files:**
- Modify: `.github/workflows/deploy-cloudflare.yml`

**Interfaces:**
- Ensures the satellite AI patch is applied before Worker checks/build and all new tests run before deployment.

- [ ] Add `Apply satellite intelligence AI context` step running `node --check scripts/patch-satellite-intelligence-ai.mjs` and the patch.
- [ ] Add `Validate satellite intelligence` step running the four new Node tests.
- [ ] Extend Worker syntax validation to include `worker/satellite-api.js`.
- [ ] Keep the existing remote D1 migration and Wrangler deploy steps unchanged.
- [ ] Push the final workflow commit to `main` and inspect the fresh GitHub Actions production run.
- [ ] Confirm new tests, client build, D1 migration, Worker deployment and active production deployment inspection all succeed before reporting completion.
- [ ] Commit with `ci: validate and deploy satellite intelligence`.
