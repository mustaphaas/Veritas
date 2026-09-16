# VIIRS Night-time Light Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe VIIRS night-time light comparison to the existing Veritas project detail panel, grounded only in real D1 project identities and coordinates.

**Architecture:** Keep the current Project Map layout unchanged. Ground the programme map in the existing authenticated `/api/rea/projects` D1 feed, add a dedicated Cloudflare Worker route that resolves project metadata and cache state, and call a small authenticated Google Cloud Python service for Earth Engine analysis. Historic results are cached in D1; the browser never calls Earth Engine or Google Cloud directly.

**Tech Stack:** React 18 + TypeScript + Vite, Cloudflare Workers + D1, Node test runner/Vitest, Python 3.11+, Google Cloud Functions/Cloud Run functions, Google Earth Engine Python API, NASA VIIRS Black Marble VNP46A2.

**Spec:** `docs/superpowers/specs/2026-09-16-viirs-night-light-impact-design.md`

## Global Constraints

- Preserve the current Project Map visual design, controls, zoom behavior, filters, markers, and detail-panel layout; only add the new card and real-data grounding required for correctness.
- D1 `projects.id`, `projects.latitude`, and `projects.longitude` are authoritative. Never query VIIRS from a synthetic map ID or jittered display coordinate.
- Use dataset `NASA/VIIRS/002/VNP46A2`, band `Gap_Filled_DNB_BRDF_Corrected_NTL`, and a 750 metre analysis radius.
- Commissioning comparison uses 90 days before completion and 90 days after a 30-day post-completion gap.
- Without a trustworthy completion/commissioning date, return `comparisonType: "historical_trend"`; do not call it a before/after project-impact comparison.
- Never claim satellite brightness proves project causation. UI language must say the evidence is consistent with increased/decreased illumination around the project location.
- Suppress percentage change when the baseline is zero or near zero; show absolute change instead.
- The browser must never call the Google service directly and must never receive Earth Engine or Google credentials.
- Google service authentication uses a shared HMAC request signature secret held only in Google Secret Manager/runtime configuration and Cloudflare Worker secrets. Do not commit the secret.
- Do not deploy Veritas production until a live Earth Engine smoke query succeeds with plausible values and non-zero valid-observation counts.

---

### Task 1: Ground the programme map in real D1 project identities

**Files:**
- Modify: `client/components/ReaProjectMapProgramme.tsx`
- Reuse: `client/lib/rea-project-map-data.ts`
- Test: `client/components/ReaProjectMapProgramme.spec.tsx`
- Preserve regression tests: `tests/project-map-satellite-click-zoom.test.mjs`, `tests/project-map-satellite-shared-state.test.mjs`

**Interfaces:**
- Consumes: `useAuth().session.apiToken`, `fetchReaMapProjects(apiToken)`, `resolveProjectCoordinate(record)`.
- Produces: `MapProject` records with the real D1 `id`, `latitude`, `longitude`, `lga`, and existing dashboard display fields. Synthetic `REA-${programme}-...` IDs are no longer used for satellite-capable project selection.

- [ ] **Step 1: Write a failing component/data-grounding test**

Add assertions that a D1 record such as `FCT-MG-DURUMI-001` remains that exact ID in the selected map project and that valid stored coordinates are retained. Also assert that a record with invalid coordinates cannot expose the satellite action.

```tsx
it("keeps the authoritative D1 project id and coordinates", async () => {
  fetchReaMapProjectsMock.mockResolvedValue([
    {
      id: "FCT-MG-DURUMI-001",
      name: "Durumi Solar Mini Grid Demo",
      programme: "DARES",
      component: "Mini Grid",
      contractor: "Veritas Demo Contractor",
      consultantFirm: "Supreme Way",
      state: "FCT",
      lga: "Abuja Municipal Area Council",
      community: "Durumi",
      reportingMonth: "2026-09",
      status: "In progress",
      installedCapacityKw: 100,
      households: 200,
      verified: false,
      latitude: 9.0232043,
      longitude: 7.4518017,
      geofenceRadiusMetres: 250,
      dataSource: "d1",
      updatedAt: "2026-09-16T00:00:00.000Z"
    }
  ]);
  // Render Project Map and drill into the project.
  // Assert the detail panel contains FCT-MG-DURUMI-001 and the satellite action is eligible.
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run client/components/ReaProjectMapProgramme.spec.tsx
```

Expected: FAIL because `ReaProjectMapProgramme.tsx` currently creates synthetic IDs and jittered display positions from static `dashboard-data`.

- [ ] **Step 3: Replace synthetic project identity construction with the existing D1 feed without redesigning the UI**

Import `useAuth`, `fetchReaMapProjects`, `reaRecordToDashboardProject`, and `resolveProjectCoordinate`. Inside `ProjectMap`, load `/api/rea/projects` when a valid REA `apiToken` exists and map each returned record to the existing display shape while retaining authoritative metadata:

```ts
type MapProject = Project & {
  id: string;
  lga: string;
  latitude?: number;
  longitude?: number;
  satelliteEligible: boolean;
};

const { session } = useAuth();
const [portfolioProjects, setPortfolioProjects] = useState<MapProject[]>([]);

useEffect(() => {
  if (!session?.apiToken) return;
  let cancelled = false;
  fetchReaMapProjects(session.apiToken)
    .then((records) => {
      if (cancelled) return;
      setPortfolioProjects(records.map((record) => {
        const dashboard = reaRecordToDashboardProject(record);
        const coordinate = resolveProjectCoordinate(record);
        return {
          ...dashboard,
          id: record.id,
          lga: record.lga,
          latitude: coordinate?.[1],
          longitude: coordinate?.[0],
          satelliteEligible: Boolean(coordinate),
        };
      }));
    })
    .catch(() => {
      if (!cancelled) setPortfolioProjects([]);
    });
  return () => { cancelled = true; };
}, [session?.apiToken]);
```

Use the D1-backed list as `mappedProjects`. Keep the existing state/LGA rendering, filters, color rules, and panel markup unchanged.

- [ ] **Step 4: Run focused map tests**

Run:

```bash
npx vitest run client/components/ReaProjectMapProgramme.spec.tsx client/components/ProjectMapSatelliteEnhancer.spec.ts
node --test --test-concurrency=1 tests/project-map-satellite-click-zoom.test.mjs tests/project-map-satellite-shared-state.test.mjs
```

Expected: PASS and no map-control/zoom regression.

- [ ] **Step 5: Commit**

```bash
git add client/components/ReaProjectMapProgramme.tsx client/components/ReaProjectMapProgramme.spec.tsx
git commit -m "fix: ground project map identity in D1"
```

---

### Task 2: Add the D1 satellite-analysis cache and pure analysis helpers

**Files:**
- Create: `migrations/0006_night_light_impact_cache.sql`
- Create: `worker/night-light-analysis.js`
- Create: `tests/night-light-analysis.test.mjs`
- Test: `tests/night-light-migration.test.mjs`

**Interfaces:**
- Produces: `ANALYSIS_VERSION`, `extractCompletionDate(reportJson)`, `validateCoordinates(latitude, longitude)`, `cacheFingerprint(project)`, `shouldSuppressPercentChange(beforeRadiance)`, and `normalizeNightLightPayload(payload)`.
- Consumed by: `worker/night-light-api.js` in Task 3.

- [ ] **Step 1: Write failing helper and migration tests**

Cover exact allowlisted completion-date keys only:

```js
assert.equal(extractCompletionDate({ completionDate: "2026-06-30" }), "2026-06-30");
assert.equal(extractCompletionDate({ projectDetails: { commissioningDate: "2026-07-15" } }), "2026-07-15");
assert.equal(extractCompletionDate({ submittedAt: "2026-08-01" }), null);
assert.equal(extractCompletionDate({ updatedAt: "2026-08-01" }), null);
assert.equal(shouldSuppressPercentChange(0), true);
assert.equal(shouldSuppressPercentChange(0.0005), true);
assert.equal(shouldSuppressPercentChange(0.25), false);
```

Allowed report-json paths are exactly:

- root: `completionDate`, `commissioningDate`, `dateOfCompletion`
- `project`: the same three keys
- `projectDetails`: the same three keys
- `statusDates`: the same three keys
- `statusAndDates`: the same three keys

The migration test must assert the table and composite key exist.

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test tests/night-light-analysis.test.mjs tests/night-light-migration.test.mjs
```

Expected: FAIL because files do not yet exist.

- [ ] **Step 3: Create the cache migration**

Use this schema:

```sql
CREATE TABLE IF NOT EXISTS night_light_impact_cache (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_version TEXT NOT NULL,
  comparison_type TEXT NOT NULL,
  completion_date TEXT,
  completion_date_source TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  before_start TEXT NOT NULL,
  before_end TEXT NOT NULL,
  before_radiance REAL,
  before_observations INTEGER NOT NULL,
  after_start TEXT NOT NULL,
  after_end TEXT NOT NULL,
  after_radiance REAL,
  after_observations INTEGER NOT NULL,
  absolute_change REAL,
  percent_change REAL,
  radius_meters INTEGER NOT NULL,
  dataset TEXT NOT NULL,
  band TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  project_fingerprint TEXT NOT NULL,
  PRIMARY KEY (project_id, analysis_version)
);
CREATE INDEX IF NOT EXISTS idx_night_light_cache_calculated_at
  ON night_light_impact_cache(calculated_at);
```

- [ ] **Step 4: Implement pure helper functions**

Set:

```js
export const ANALYSIS_VERSION = "viirs-vnp46a2-750m-90d-v1";
export const NEAR_ZERO_RADIANCE = 0.001;
```

`cacheFingerprint()` must include project ID, latitude, longitude, trusted completion date, and `ANALYSIS_VERSION`. `normalizeNightLightPayload()` must reject non-finite radiance values, negative observation counts, unexpected dataset/band/radius, and missing date windows.

- [ ] **Step 5: Run tests**

```bash
node --test tests/night-light-analysis.test.mjs tests/night-light-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add migrations/0006_night_light_impact_cache.sql worker/night-light-analysis.js tests/night-light-analysis.test.mjs tests/night-light-migration.test.mjs
git commit -m "feat: add night-light analysis cache primitives"
```

---

### Task 3: Build the authenticated Cloudflare Worker route

**Files:**
- Create: `worker/night-light-api.js`
- Modify: `worker/entry.js`
- Create: `tests/night-light-api.test.mjs`

**Interfaces:**
- Consumes: `env.DB`, `env.EARTH_ENGINE_FUNCTION_URL`, `env.EARTH_ENGINE_SHARED_SECRET`, helpers from `worker/night-light-analysis.js`.
- Produces: `handleNightLightApi(request, env)` and `GET /api/rea/projects/:id/night-light-impact`.

- [ ] **Step 1: Write failing route tests**

Required cases:

```js
// 401 without Bearer token
// 403 for non-REA role
// 404 project not found
// 422 invalid/missing coordinates
// completion date from explicit report_json key
// unrelated submitted_at/updated_at not treated as completion
// historical_trend fallback when no trusted completion date exists
// cache hit skips upstream fetch
// coordinate/date/version fingerprint change invalidates cache
// 502 Earth Engine timeout/unavailable
// 502 malformed upstream payload
// 422 insufficient observations
// percentChange null for near-zero baseline
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test --test-concurrency=1 tests/night-light-api.test.mjs
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement REA authentication and project lookup using existing Worker conventions**

Follow the same Bearer-token SHA-256 session lookup pattern already used by `worker/claims-api.js`. Query the project plus the newest relevant assignment report:

```sql
SELECT p.id,p.latitude,p.longitude,a.report_json AS reportJson
FROM projects p
LEFT JOIN assignments a ON a.project_id=p.id
WHERE p.id=?
ORDER BY COALESCE(a.verified_at,a.approved_at,a.submitted_at,a.updated_at,p.updated_at) DESC
LIMIT 1
```

Do not derive a completion date from `submitted_at`, `approved_at`, `verified_at`, `created_at`, or `updated_at`.

- [ ] **Step 4: Implement cache lookup and invalidation**

Commissioning comparisons may be reused indefinitely while the fingerprint and analysis version match. Historical-trend cache entries expire after 30 days so the most recent complete observation window can advance.

- [ ] **Step 5: Implement HMAC-authenticated upstream call**

The Worker sends JSON:

```json
{
  "projectId": "FCT-MG-DURUMI-001",
  "latitude": 9.0232043,
  "longitude": 7.4518017,
  "completionDate": "2026-06-30",
  "comparisonType": "commissioning",
  "radiusMeters": 750,
  "analysisVersion": "viirs-vnp46a2-750m-90d-v1"
}
```

Use headers `X-Veritas-Timestamp` and `X-Veritas-Signature`. Signature input is `${timestamp}.${rawBody}` and signature is lowercase hex HMAC-SHA256 using `EARTH_ENGINE_SHARED_SECRET`. Abort the fetch after 15 seconds.

- [ ] **Step 6: Normalize, cache, and return the stable API response**

Return the spec contract plus `cached`. If `beforeObservations < 5` or `afterObservations < 5`, reject as insufficient observations instead of presenting a misleading result.

- [ ] **Step 7: Wire the route ahead of the generic Worker**

`worker/entry.js` becomes:

```js
import worker from './index.js';
import { handleClaimsApi } from './claims-api.js';
import { handleNightLightApi } from './night-light-api.js';

export default {
  async fetch(request, env, ctx) {
    const nightLightResponse = await handleNightLightApi(request, env);
    if (nightLightResponse) return nightLightResponse;
    const claimsResponse = await handleClaimsApi(request, env);
    if (claimsResponse) return claimsResponse;
    return worker.fetch(request, env, ctx);
  },
};
```

- [ ] **Step 8: Run Worker tests and syntax checks**

```bash
node --check worker/night-light-analysis.js
node --check worker/night-light-api.js
node --check worker/entry.js
node --test --test-concurrency=1 tests/night-light-analysis.test.mjs tests/night-light-api.test.mjs tests/rea-projects-route.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add worker/night-light-api.js worker/entry.js tests/night-light-api.test.mjs
git commit -m "feat: add authenticated night-light impact API"
```

---

### Task 4: Implement the Google Earth Engine Python service

**Files:**
- Create: `earth-engine-function/main.py`
- Create: `earth-engine-function/requirements.txt`
- Create: `earth-engine-function/tests/test_main.py`
- Create: `earth-engine-function/DEPLOY.md`

**Interfaces:**
- Consumes: signed POST body from the Worker and `EARTH_ENGINE_SHARED_SECRET` from runtime environment.
- Produces: normalized VIIRS statistics consumed by `worker/night-light-api.js`.

- [ ] **Step 1: Write failing unit tests for date windows, signature verification, no-data handling, and normalization**

```py
def test_commissioning_windows():
    windows = build_windows("2026-06-30", today=date(2026, 9, 17))
    assert windows["before"] == (date(2026, 4, 1), date(2026, 6, 29))
    assert windows["after"] == (date(2026, 7, 30), date(2026, 10, 27))


def test_historical_windows_use_complete_90_day_periods():
    windows = build_historical_windows(date(2026, 9, 17))
    assert (windows["after"][1] - windows["after"][0]).days == 89
```

Mock Earth Engine calls in unit tests; normal unit tests must not require network access.

- [ ] **Step 2: Run Python tests and verify failure**

```bash
python -m pytest earth-engine-function/tests -q
```

Expected: FAIL because implementation is absent.

- [ ] **Step 3: Implement constants and request authentication**

Use:

```py
DATASET = "NASA/VIIRS/002/VNP46A2"
BAND = "Gap_Filled_DNB_BRDF_Corrected_NTL"
RADIUS_METERS = 750
MIN_OBSERVATIONS = 5
```

Verify `X-Veritas-Timestamp` is within 300 seconds and compare HMAC signatures with `hmac.compare_digest`.

- [ ] **Step 4: Implement VIIRS quality masking and aggregation**

Build a 750 m `ee.Geometry.Point([longitude, latitude]).buffer(750)`. Filter VNP46A2 by date and bounds, mask poor-quality/cloud-contaminated observations using the product QA bands, select `Gap_Filled_DNB_BRDF_Corrected_NTL`, compute the median image, and reduce it over the buffer. Independently count valid observations contributing to each window.

Return raw radiance in the dataset's documented units and do not rescale twice.

- [ ] **Step 5: Implement commissioning and historical window construction**

Commissioning:

```py
before_end = completion - timedelta(days=1)
before_start = before_end - timedelta(days=89)
after_start = completion + timedelta(days=30)
after_end = after_start + timedelta(days=89)
```

Historical trend: use the latest fully complete 90-day period ending at least 7 days before the current date, and compare it to the same calendar period two years earlier. This avoids comparing incomplete recent ingestion against a complete historic period.

- [ ] **Step 6: Implement HTTP response normalization**

Return:

```json
{
  "comparisonType": "commissioning",
  "before": {"startDate":"2026-04-01","endDate":"2026-06-29","medianRadiance":0.21,"validObservations":73},
  "after": {"startDate":"2026-07-30","endDate":"2026-10-27","medianRadiance":0.47,"validObservations":81},
  "radiusMeters":750,
  "dataset":"NASA/VIIRS/002/VNP46A2",
  "band":"Gap_Filled_DNB_BRDF_Corrected_NTL"
}
```

Do not compute percent change in Python; keep percentage policy centralized in the Worker helper.

- [ ] **Step 7: Write deployment documentation**

`DEPLOY.md` must include:

```bash
gcloud functions deploy veritas-night-light-impact \
  --gen2 \
  --runtime python311 \
  --region us-central1 \
  --source earth-engine-function \
  --entry-point night_light_impact \
  --trigger-http \
  --service-account veritas-earth-engine@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-secrets EARTH_ENGINE_SHARED_SECRET=veritas-earth-engine-shared-secret:latest
```

The function may accept public HTTP ingress because Cloudflare cannot present a native GCP workload identity, but the application handler must reject every request without a valid timestamped HMAC signature. Earth Engine service-account credentials remain in GCP and are never copied into Cloudflare.

Document a small local signing helper or Python command that sends a known-coordinate smoke request and verifies a 200 response.

- [ ] **Step 8: Run unit tests**

```bash
python -m pytest earth-engine-function/tests -q
```

Expected: PASS offline with Earth Engine mocked.

- [ ] **Step 9: Commit**

```bash
git add earth-engine-function
git commit -m "feat: add Earth Engine VIIRS analysis service"
```

---

### Task 5: Add the Night-time Light Impact card without redesigning the map

**Files:**
- Modify: `client/components/ReaProjectMapProgramme.tsx`
- Create: `client/lib/night-light-impact.ts`
- Create: `client/lib/night-light-impact.test.ts`
- Modify/Test: `client/components/ReaProjectMapProgramme.spec.tsx`

**Interfaces:**
- Consumes: selected real D1 project ID and `session.apiToken`.
- Produces: UI states `idle | loading | success | error` and display copy for commissioning vs historical-trend results.

- [ ] **Step 1: Write failing API-client and UI tests**

Test that the client calls:

```ts
fetch(`/api/rea/projects/${encodeURIComponent(projectId)}/night-light-impact`, {
  headers: { Authorization: `Bearer ${apiToken}` },
});
```

UI assertions:

- idle card title `Night-time Light Impact` and `Check` button;
- loading state disables repeated requests;
- commissioning result shows Before, After, Change, observation counts, `750 m`, and `NASA VIIRS Black Marble`;
- historical fallback title changes to `Historical Light Trend` and visibly states it is not a commissioning before/after comparison;
- `percentChange: null` displays absolute radiance change only;
- missing coordinates shows `Satellite analysis unavailable — this project has no valid mapped coordinates.`;
- failed upstream shows `Night-time light analysis is temporarily unavailable.`.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npx vitest run client/lib/night-light-impact.test.ts client/components/ReaProjectMapProgramme.spec.tsx
```

- [ ] **Step 3: Implement typed client helper**

Create `NightLightImpactResult` and `fetchNightLightImpact(projectId, apiToken)` with strict response checks sufficient for UI safety.

- [ ] **Step 4: Add card-local state and reset it when selected project changes**

```ts
const [nightLightState, setNightLightState] = useState<NightLightState>({ status: "idle" });

useEffect(() => {
  setNightLightState({ status: "idle" });
}, [selectedProject?.id]);
```

- [ ] **Step 5: Insert one new card between verification status and the existing View Inspections/View Reports buttons**

Do not change the surrounding panel width, padding, color system, button grid, map controls, or existing cards. Use the existing rounded-border card language.

Preferred interpretation copy:

```ts
const interpretation = result.absoluteChange > 0
  ? "Satellite evidence is consistent with increased night-time illumination around this project location."
  : result.absoluteChange < 0
    ? "Satellite evidence is consistent with decreased night-time illumination around this project location."
    : "Satellite evidence shows no material change in night-time illumination around this project location.";
```

- [ ] **Step 6: Run UI and map regressions**

```bash
npx vitest run client/lib/night-light-impact.test.ts client/components/ReaProjectMapProgramme.spec.tsx client/components/ProjectMapSatelliteEnhancer.spec.ts
node --test --test-concurrency=1 tests/project-map-satellite-click-zoom.test.mjs tests/project-map-satellite-shared-state.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/lib/night-light-impact.ts client/lib/night-light-impact.test.ts client/components/ReaProjectMapProgramme.tsx client/components/ReaProjectMapProgramme.spec.tsx
git commit -m "feat: add VIIRS impact card to project map"
```

---

### Task 6: Wire deployment configuration and CI validation

**Files:**
- Modify: `scripts/provision-cloudflare.mjs`
- Modify: `.env.example`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Create: `tests/night-light-provisioning.test.mjs`

**Interfaces:**
- Consumes: deployment-time Cloudflare variable/secret configuration.
- Produces: Worker runtime access to `EARTH_ENGINE_FUNCTION_URL` while keeping `EARTH_ENGINE_SHARED_SECRET` as a Cloudflare secret.

- [ ] **Step 1: Write failing provisioning test**

Assert the generated Wrangler config passes through `EARTH_ENGINE_FUNCTION_URL` from process environment but never serializes `EARTH_ENGINE_SHARED_SECRET`.

- [ ] **Step 2: Implement configuration**

Extend `scripts/provision-cloudflare.mjs`:

```js
const earthEngineFunctionUrl = process.env.EARTH_ENGINE_FUNCTION_URL || "";
// config.vars includes EARTH_ENGINE_FUNCTION_URL only when non-empty.
```

`.env.example` contains:

```dotenv
EARTH_ENGINE_FUNCTION_URL=https://REGION-PROJECT.cloudfunctions.net/veritas-night-light-impact
# EARTH_ENGINE_SHARED_SECRET is a deployment secret; never commit a real value.
```

The actual secret is configured with:

```bash
npx wrangler secret put EARTH_ENGINE_SHARED_SECRET --config wrangler.generated.json
```

- [ ] **Step 3: Add CI syntax/contract checks but do not create a fake live Earth Engine test**

Add:

```yaml
- name: Validate Night-time Light Impact contracts
  run: |
    node --check worker/night-light-analysis.js
    node --check worker/night-light-api.js
    node --test --test-concurrency=1 tests/night-light-analysis.test.mjs tests/night-light-api.test.mjs tests/night-light-migration.test.mjs tests/night-light-provisioning.test.mjs
```

Pass `EARTH_ENGINE_FUNCTION_URL` to the provisioning step from a GitHub environment variable or secret only when configured.

- [ ] **Step 4: Run provisioning and test checks locally**

```bash
node --test tests/night-light-provisioning.test.mjs
node --check scripts/provision-cloudflare.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/provision-cloudflare.mjs .env.example .github/workflows/deploy-cloudflare.yml tests/night-light-provisioning.test.mjs
git commit -m "chore: wire VIIRS deployment configuration"
```

---

### Task 7: Verify the complete branch before any production merge

**Files:**
- No feature code changes unless verification exposes a defect.
- Update: `earth-engine-function/DEPLOY.md` only if smoke-test instructions need correction.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that offline code is correct and a separate live-service deployment gate.

- [ ] **Step 1: Run the complete JavaScript/TypeScript suite**

```bash
npm test
npm run typecheck
npm run build:client
```

Record any pre-existing failures separately. Do not describe the feature as verified if a new failure remains.

- [ ] **Step 2: Run the Earth Engine service unit suite**

```bash
python -m pytest earth-engine-function/tests -q
```

Expected: PASS.

- [ ] **Step 3: Verify no map regression**

```bash
node --test --test-concurrency=1 tests/project-map-satellite-click-zoom.test.mjs tests/project-map-satellite-shared-state.test.mjs
npx vitest run client/components/ProjectMapSatelliteEnhancer.spec.ts client/components/ReaProjectMapProgramme.spec.tsx
```

Expected: PASS.

- [ ] **Step 4: Deploy only the Google service and run the live smoke gate**

Follow `earth-engine-function/DEPLOY.md`. Use a known real Nigerian project coordinate already present in D1, such as the Durumi demo coordinate only if the production project record still contains it. Verify:

- HTTP 200;
- correct dataset/band/radius;
- finite median radiance values;
- at least 5 valid observations in each period;
- date windows match the requested comparison type.

If this gate fails, stop. Do not merge/deploy the Veritas Worker/UI portion.

- [ ] **Step 5: Configure Cloudflare runtime values and test the Worker endpoint against the deployed Google service**

Set `EARTH_ENGINE_FUNCTION_URL` and `EARTH_ENGINE_SHARED_SECRET`, apply migration `0006`, then call the Worker endpoint with a valid REA session. Verify first call returns `cached: false` and second identical call returns `cached: true` with the same radiance values.

- [ ] **Step 6: Perform two browser acceptance checks**

1. One project with a trustworthy completion date must display `Night-time Light Impact` and commissioning windows.
2. One project without a completion date must display `Historical Light Trend` and the explicit non-commissioning disclaimer.

Also verify that filters, layer toggles, map zoom, satellite basemap behavior, pin selection, View Inspections, and View Reports behave exactly as before.

- [ ] **Step 7: Commit any verification-only documentation adjustment**

```bash
git add earth-engine-function/DEPLOY.md
git commit -m "docs: finalize VIIRS deployment verification"
```

Skip this commit if no documentation changed.

- [ ] **Step 8: Merge/deploy only after all gates pass**

Do not bypass the Google live smoke test. The feature may be merged to `main` and allowed into the existing Cloudflare deployment workflow only after the live query and Worker integration checks are successful.
