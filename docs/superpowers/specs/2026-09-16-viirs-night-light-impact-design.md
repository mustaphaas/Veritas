# VIIRS Night-time Light Impact Design

## Goal

Add a production-safe Night-time Light Impact capability to the existing Veritas project map without changing the current map layout or interaction model. The feature should compare satellite-observed night-time radiance around each project location and present the result as supporting evidence, not as standalone proof of project impact.

## User experience

When a user clicks an existing project pin, the current project detail panel remains unchanged except for one additional card titled **Night-time Light Impact**.

The card has four states:

1. **Not checked** — shows a `Check` action.
2. **Loading** — shows that satellite analysis is running.
3. **Completed with commissioning date** — shows Before, After, Change, valid-observation counts, analysis radius, source, and a concise interpretation.
4. **Completed without commissioning date** — the card is labeled **Historical Light Trend** and explicitly states that a true before/after project comparison is unavailable because no structured completion/commissioning date was found.

The map itself, basemap controls, existing project markers, filter layout, colours, zoom behaviour, and other project detail content must not be redesigned by this feature.

## Architecture

The subsystem has three runtime layers:

1. `earth-engine-function/` — a Google Cloud Python service that owns the Earth Engine dependency and performs the VIIRS query.
2. `worker/night-light-api.js` — a Cloudflare Worker module that authenticates the request, reads project coordinates/date metadata from D1, checks a D1 cache, calls the Google service when needed, validates the response, stores the result, and returns a stable API contract to the UI.
3. `client/components/ReaProjectMapProgramme.tsx` — the existing project detail panel renders the card and calls the Worker endpoint for the selected project.

The Cloudflare Worker must never contain Earth Engine credentials or Earth Engine SDK logic. The browser must never call the Google Cloud service directly.

## Satellite data and analysis method

Use Earth Engine collection:

`NASA/VIIRS/002/VNP46A2`

Primary radiance band:

`Gap_Filled_DNB_BRDF_Corrected_NTL`

The analysis geometry is a **750 metre radius** around the actual project latitude/longitude stored in Veritas.

When a trustworthy commissioning/completion date is available:

- Before window: 90 days ending immediately before the commissioning/completion date.
- After window: 90 days beginning 30 days after the commissioning/completion date. The 30-day gap reduces the chance that construction/commissioning transients are treated as sustained impact.
- For each window, apply VNP46A2 quality/cloud screening before computing the median radiance over the 750 m project buffer.
- Return the number of valid observations used in each window.

When a commissioning/completion date is not available:

- Do not describe the result as project impact or before/after commissioning.
- Calculate a historical trend using a comparable 90-day period approximately two years earlier versus the most recent complete 90-day period supported by the dataset.
- Return `comparisonType: "historical_trend"` and UI copy that visibly says the project completion date is unavailable.

## Percentage-change rules

The Worker returns both absolute change and percentage change.

Percentage change is only displayed when the baseline radiance is sufficiently above zero. If the baseline is zero or near-zero, return `percentChange: null` and show the absolute radiance change instead. This prevents misleading infinite or extreme percentage values.

No UI or AI copy may claim that a positive VIIRS change proves the REA project caused the observed change. Preferred wording is that satellite evidence is **consistent with increased or decreased night-time illumination around the project location**.

## API contract

Endpoint:

`GET /api/rea/projects/:id/night-light-impact`

Success response shape:

```json
{
  "projectId": "string",
  "comparisonType": "commissioning" ,
  "before": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "medianRadiance": 0.21,
    "validObservations": 73
  },
  "after": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "medianRadiance": 0.47,
    "validObservations": 81
  },
  "absoluteChange": 0.26,
  "percentChange": 123.81,
  "radiusMeters": 750,
  "dataset": "NASA/VIIRS/002/VNP46A2",
  "band": "Gap_Filled_DNB_BRDF_Corrected_NTL",
  "completionDate": "YYYY-MM-DD",
  "completionDateSource": "project_column",
  "cached": false,
  "calculatedAt": "ISO-8601 timestamp"
}
```

For historical fallback, `comparisonType` is `historical_trend`, `completionDate` is `null`, and `completionDateSource` records why no structured date could be trusted.

Error responses must distinguish at least: project not found, missing/invalid coordinates, unauthorized request, Earth Engine unavailable, insufficient valid satellite observations, and malformed upstream response.

## Completion-date extraction

The Worker first uses a structured project completion/commissioning field if one exists in the current schema.

If no structured field exists, a narrowly defined parser may inspect known `report_json` keys that explicitly represent completion/commissioning date. The parser must not guess from unrelated timestamps such as report submission, verification, creation, or last-updated dates.

If no trustworthy project date is found, the feature must use historical-trend mode.

## D1 cache

Add a dedicated cache table for satellite impact results. A cached record is keyed by project ID plus an analysis-version identifier so methodology changes cannot silently reuse stale results.

Recommended fields:

- `project_id`
- `analysis_version`
- `comparison_type`
- `completion_date`
- `latitude`
- `longitude`
- `before_start`
- `before_end`
- `before_radiance`
- `before_observations`
- `after_start`
- `after_end`
- `after_radiance`
- `after_observations`
- `absolute_change`
- `percent_change`
- `radius_meters`
- `dataset`
- `band`
- `calculated_at`

A cache entry is invalid when project coordinates or the trusted completion date no longer match the current project record, or when `analysis_version` changes.

## Google Cloud service security

The Python service runs as the dedicated `veritas-earth-engine` Google service account with Earth Engine access.

The service must require authenticated requests. The Cloudflare Worker calls it using a server-side credential/configuration mechanism; the public browser must not have direct access to the service.

Deployment documentation must include a direct health/query test using a known Nigerian project coordinate before Veritas is pointed at the service.

## Configuration

Cloudflare environment configuration should include only non-secret service location/configuration values in source-controlled examples. Any bearer token, service-account material, or equivalent credential remains outside the repository and is injected through deployment secrets.

The Worker should use an environment variable such as `EARTH_ENGINE_FUNCTION_URL` for the upstream base URL.

## Error handling and user messaging

The UI must not fabricate results if Earth Engine is unavailable or returns insufficient data.

Examples:

- Missing coordinates: `Satellite analysis unavailable — this project has no valid mapped coordinates.`
- Upstream unavailable: `Night-time light analysis is temporarily unavailable.`
- Insufficient observations: `Not enough quality satellite observations were available for a reliable comparison.`
- Historical fallback: `Historical Light Trend — project completion date is unavailable, so this is not a commissioning before/after comparison.`

## Testing requirements

Tests must cover:

- authentication/authorization on the Worker route;
- project not found;
- valid coordinate lookup from D1;
- invalid/missing coordinates;
- structured completion date;
- explicit completion date parsed from known `report_json` keys;
- refusal to treat unrelated timestamps as completion dates;
- historical-trend fallback;
- D1 cache hit without an upstream Earth Engine call;
- cache invalidation when coordinates/date/version change;
- Earth Engine timeout/failure;
- malformed upstream payload;
- insufficient valid observations;
- zero/near-zero baseline suppressing percentage change;
- stable rendering of the new card without changing map controls or marker behaviour.

The Python service needs unit tests for date-window construction, quality-mask composition, geometry/radius handling, output normalization, and no-data cases. A live Earth Engine smoke test is required during deployment but must not be part of the normal offline unit test suite.

## Deployment gate

The feature is not production-ready merely because the code builds.

Before production deployment:

1. Deploy the Google Cloud service under `veritas-earth-engine`.
2. Run the documented direct query test against a known valid Nigerian coordinate.
3. Confirm plausible radiance values and non-zero valid-observation counts.
4. Configure the Cloudflare secret/service URL.
5. Run Worker integration tests against the deployed service.
6. Verify the project-map card on at least one project with a completion date and one project without one.
7. Only then merge/deploy the Veritas changes.

## Non-goals

This feature does not:

- redesign the project map;
- replace field inspection evidence;
- prove causation from satellite brightness alone;
- create live satellite imagery;
- use contractor-submitted imagery as the VIIRS source;
- automatically approve, reject, verify, or authorize payment for a project.

## Success criteria

The feature is successful when a Veritas user can select a mapped project, run a reproducible VIIRS analysis using the project's true coordinates, understand whether the result is a commissioning comparison or only a historical trend, see the underlying observation quality/counts, and receive no fabricated result when the upstream data or project metadata is inadequate.
