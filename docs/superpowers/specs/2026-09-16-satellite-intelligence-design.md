# Veritas Satellite Intelligence — Design Specification

Date: 2026-09-16
Status: Approved design direction, pending implementation plan

## Purpose

Satellite Intelligence will become a first-class Veritas verification capability. It will use each project's real GPS coordinates from the authoritative D1 project record to retrieve and analyse satellite imagery, compare imagery across dates where available, and present auditable findings to REA reviewers as supporting evidence.

The feature must not replace field inspection or independently determine fraud, project existence, completion, or compliance. Satellite findings are evidence for review, not an automatic final decision.

## Goals

1. Analyse satellite imagery at a project's real latitude and longitude.
2. Support current-image analysis and historical image comparison/change detection.
3. Store the imagery provenance, coordinates, analysis outputs, confidence, review state, and model/provider metadata in D1.
4. Surface findings inside the existing Project Map and project verification workflow without redesigning unrelated areas.
5. Make the findings available to Veritas AI for grounded management analysis.
6. Preserve a complete audit trail of analysis runs and human review decisions.
7. Make imagery providers replaceable without changing the rest of the application.

## Non-goals

- Automatically verifying or rejecting a project from satellite imagery alone.
- Claiming continuous real-time or live satellite coverage.
- Inferring misconduct, fraud, or non-performance solely from image appearance.
- Fabricating coordinates when a project lacks valid GPS coordinates.
- Treating map display tiles as proof of image capture date unless the provider exposes authoritative temporal metadata.

## Existing Veritas Foundation

Veritas already has an Esri World Imagery basemap in `client/components/ProjectMapSatelliteEnhancer.tsx`. The map reads project records from D1 through the existing REA map data API and places satellite-view project markers using stored project latitude and longitude.

This design keeps that map experience and adds a separate analysis subsystem behind it.

## Architecture

### 1. Coordinate Authority

Satellite analysis must always start from the authoritative project record in D1.

The backend must:
- load the project by ID;
- validate latitude and longitude numerically;
- reject missing, malformed, or out-of-range coordinates;
- record the exact coordinates used for every analysis run;
- never accept browser-supplied replacement coordinates as authoritative for an existing project.

A request may identify a project, but the backend re-reads the coordinates from D1 before analysis.

### 2. Provider Adapter Layer

Create a provider-neutral satellite imagery interface so Veritas can use the current Esri imagery for display while supporting dated imagery providers for analysis and historical comparison.

The adapter contract should expose:
- provider name;
- acquisition/capture date when actually available;
- image or tile source reference;
- bounding box / centre coordinates;
- zoom or ground-resolution metadata when available;
- licensing/attribution metadata;
- cloud/quality metadata when the provider exposes it.

A provider that does not expose a reliable image date must return the date as unknown rather than infer one.

### 3. Satellite Analysis Service

Add a backend service responsible for:
- loading the authoritative project;
- requesting imagery around the project coordinates;
- selecting an appropriate analysis footprint around the site;
- constructing a vision-analysis request using project metadata;
- storing the resulting structured findings;
- returning a safe, review-oriented result.

The analysis should consider project component and programme context so observations can be relevant to mini-grid, solar-home-system, grid-extension, education, public-sector solarisation, or other project types.

### 4. Current Image Analysis

For a current/latest available image, the structured result should support observations such as:
- visible built or cleared project footprint;
- visible solar-panel-like arrays where image quality allows;
- road/access visibility;
- nearby buildings or settlement footprint;
- visible construction/site-development indicators;
- visible linear infrastructure corridors where reasonably detectable;
- image-quality limitations.

The AI must use cautious language. Example: `A rectangular array-like footprint is visible near the project coordinate` is acceptable. `The project is complete` is not an acceptable satellite-only conclusion.

### 5. Historical Comparison and Change Detection

When two or more dated images are available, Veritas should compare a baseline image and a newer image for the same project footprint.

The result should capture:
- baseline acquisition date;
- comparison acquisition date;
- visible-change summary;
- change categories;
- confidence;
- image-quality limitations;
- whether manual review is required.

Potential change categories include:
- site clearing;
- new built footprint;
- new array-like footprint;
- access-road change;
- settlement/building change;
- vegetation/land-cover change;
- no clear visible change;
- inconclusive.

The system must distinguish `no clear visible change` from `no project exists`.

### 6. D1 Data Model

Add a durable `satellite_analysis_runs` table with fields conceptually equivalent to:

- `id`
- `project_id`
- `requested_by_user_id`
- `analysis_type` (`current`, `historical_compare`)
- `provider`
- `latitude_used`
- `longitude_used`
- `footprint_json`
- `baseline_image_date`
- `comparison_image_date`
- `baseline_source_ref`
- `comparison_source_ref`
- `quality_json`
- `observations_json`
- `change_json`
- `confidence_score`
- `review_required`
- `review_status` (`unreviewed`, `accepted`, `needs_followup`, `dismissed`)
- `reviewed_by_user_id`
- `reviewed_at`
- `review_note`
- `model_provider`
- `model_name`
- `created_at`
- `updated_at`

If image snapshots are persisted, store object references rather than large image blobs in D1. Binary imagery should use object storage or a provider reference according to licensing and retention constraints.

### 7. API Surface

Add authenticated endpoints conceptually equivalent to:

- `POST /api/projects/:projectId/satellite-analysis`
  - starts current/latest-image analysis.
- `POST /api/projects/:projectId/satellite-analysis/compare`
  - runs historical comparison.
- `GET /api/projects/:projectId/satellite-analysis`
  - lists analysis history for a project.
- `GET /api/satellite-analysis/:analysisId`
  - retrieves a complete analysis record.
- `PATCH /api/satellite-analysis/:analysisId/review`
  - records the REA human review decision.

REA roles can run and review analyses. Consultant access should be read-only only where existing project/consultant tenancy allows it, and should not expose cross-consultant project information. Field officers should not receive administrative satellite-review privileges.

### 8. Project Map Experience

Keep the existing Map/Satellite switch.

When a project marker is selected in satellite mode, add a compact `Satellite Intelligence` action in the project detail experience. It should:
- focus the map on the project's real D1 coordinate;
- show the last analysis state;
- allow authorised users to run a new current analysis;
- allow historical comparison when dated imagery is available;
- show image dates, provider, confidence, review state, and limitations.

The map must continue to work even when the AI analysis provider is unavailable.

### 9. Project Verification Integration

Add a `Satellite Intelligence` evidence section to the project verification detail.

The reviewer should see:
- coordinate used;
- provider;
- acquisition dates;
- latest structured findings;
- historical change summary where available;
- confidence;
- manual-review requirement;
- reviewer decision/history.

Satellite evidence must not change a project's verification state automatically. REA verification remains an explicit human/system workflow action.

### 10. AI Integration

Add a compact satellite-intelligence summary to Veritas AI's live database context.

The AI should be able to answer questions such as:
- Which projects have inconclusive satellite evidence?
- Which projects show visible site change between available image dates?
- Which projects have field evidence that appears inconsistent with satellite findings?
- Summarise projects requiring manual satellite review.
- Compare satellite-analysis outcomes by programme or state.

The AI must clearly separate:
1. recorded satellite/provider facts;
2. model observations;
3. human review decisions;
4. management interpretation.

It must not transform an uncertain visual observation into an allegation of fraud, abandonment, non-existence, or non-performance.

### 11. Confidence and Review Rules

Use explicit confidence/quality states rather than free-form certainty.

Recommended result levels:
- `high`: image quality and visible features strongly support the observation;
- `medium`: observation is plausible but limited by image resolution/date/context;
- `low`: image is weak, stale, obstructed, or ambiguous;
- `inconclusive`: no defensible observation can be made.

Set `review_required = true` when:
- imagery is stale relative to the project milestone under review;
- acquisition date is unknown and timing matters;
- cloud/obstruction/low resolution prevents a reliable read;
- current and historical images are not comparable;
- AI observation conflicts materially with field evidence;
- the analysis confidence is low or inconclusive.

### 12. Audit Trail

Every run and review action must create an audit event containing:
- project ID;
- analysis ID;
- user/actor;
- timestamp;
- analysis type;
- provider;
- coordinates used;
- review action when applicable.

Do not place image payloads or model-sensitive data in the audit log.

### 13. Error Handling

Return clear, non-destructive states for:
- project has no valid coordinates;
- imagery provider unavailable;
- no dated historical image available;
- image date unknown;
- image quality unsuitable;
- AI/vision provider unavailable;
- provider rate limit/quota reached;
- storage failure.

The existing Project Map must remain usable during all of these failures.

### 14. Security and Privacy

- Require authenticated role checks for every satellite-analysis endpoint.
- Re-read project tenancy and role scope server-side.
- Do not permit arbitrary coordinates to be analysed through an authenticated project endpoint without a matching authorised project.
- Never expose provider keys to the client.
- Avoid feeding unrelated personal information into the vision model.
- Store only the metadata required for reproducibility and review.

### 15. Licensing and Imagery Provenance

The implementation must preserve the provider's attribution and comply with imagery licensing/retention terms.

Veritas must not imply that Esri display tiles provide historical timestamps unless an authoritative imagery metadata source confirms them. Historical comparison should use a provider/data source that exposes suitable dated imagery and permits the required analysis workflow.

### 16. Testing

Add regression coverage for:
- authoritative D1 coordinate use;
- invalid/missing-coordinate rejection;
- no arbitrary client coordinate override;
- role and consultant tenancy isolation;
- current analysis persistence;
- historical comparison persistence;
- unknown imagery date handling;
- low-confidence/manual-review logic;
- AI context inclusion without overclaiming;
- audit event creation;
- Project Map remains functional when analysis fails;
- satellite findings never auto-set project status to Verified or Rejected.

### 17. Rollout

Phase 1 of implementation should deliver the complete auditable workflow, not a mock visual:
- schema and migrations;
- provider adapter;
- analysis endpoints;
- current image analysis;
- dated historical comparison when provider support exists;
- D1 persistence;
- Project Map/project-detail UI;
- verification integration;
- AI context;
- tests and production deployment verification.

Where a historical provider requires credentials or a paid account that is not yet configured, the architecture should ship with a clean provider adapter and an explicit `historical imagery unavailable` state rather than using fabricated image dates or pretending the Esri display layer is historical imagery.

## Acceptance Criteria

The feature is complete when an authorised REA user can select a real Veritas project, run satellite analysis against that project's D1 coordinates, inspect the provider/image-date provenance and AI observations, compare dated imagery where supported, review the finding, see the record in the audit trail, and ask Veritas AI grounded questions about stored satellite findings — without the satellite subsystem being able to independently verify/reject the project or fabricate coordinates, image dates, or conclusions.