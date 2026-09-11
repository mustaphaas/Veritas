# D1-backed REA Project Map Design

## Goal
Make Cloudflare D1 the authoritative source for project locations displayed on the REA Project Map, so the map uses the same project latitude/longitude used by field assignments and geofence verification.

## Current problem
The `projects` D1 table already requires `latitude`, `longitude`, and `geofence_radius_metres`. Field operations write and consume these fields. The REA Project Map, however, imports the static `client/lib/dashboard-data.ts` portfolio and derives deterministic display positions instead of reading the D1 project coordinates.

## Architecture
Add an authenticated, read-only REA portfolio endpoint at `GET /api/rea/projects`. The Cloudflare Worker will query D1 and return the project fields required by the existing map: project identity, programme/component, contractor/consultant, state/LGA/community, portfolio status, capacity, households, verification state, latitude, longitude, geofence radius, data source, and update timestamp.

`ReaProjectMap` will load this endpoint and use each project's stored `[longitude, latitude]` as its map coordinate. Coordinate validation will reject non-finite values and values outside latitude -90..90 or longitude -180..180. A project with missing/invalid GPS remains part of portfolio counts and lists but receives no fabricated project pin; the map UI will identify its location as missing GPS data where project-level location is relevant.

## Authorization
`GET /api/rea/projects` requires a valid Veritas session and the `rea_admin` role. It is read-only. The endpoint does not expose user credentials, session information, evidence payloads, or unrelated audit data.

## Data flow
1. REA creates/imports a project and its coordinates are stored in D1 `projects.latitude` and `projects.longitude`.
2. The REA Project Map requests `/api/rea/projects` using the existing authenticated session mechanism.
3. The Worker reads the current project records directly from D1 and returns normalized JSON.
4. The map preserves its Nigeria -> State -> LGA -> project drill-down and existing filtering/status presentation, but project pins use the returned D1 coordinates directly.
5. Field Officer assignment/geofence logic continues reading the same D1 coordinates, making D1 the single source of truth.

## Existing behavior to preserve
- Nigeria -> State -> LGA -> project-pin drill-down and breadcrumbs.
- Existing map boundaries and LGA GeoJSON.
- Filters, status colours, animations, zoom/full-screen controls, and project detail drawer.
- Field Officer arrival verification and the existing geofence radius behavior.
- Existing dashboard pages outside the Project Map.

## Missing GPS behavior
No synthetic or centroid-based coordinate may be used as a project site's location. Projects with invalid/missing GPS remain visible in non-spatial portfolio information. At project-pin level they are omitted from the spatial pin layer and reported as missing GPS rather than silently positioned elsewhere.

## Demo data
Existing D1 demo records may contain generated coordinates from migration `0002_full_demo_portfolio.sql`. Because those values are explicitly stored in D1, the map will display them as the database values; the change will not claim that demo coordinates are surveyed locations. Production/import workflows remain responsible for replacing demo data with authoritative project coordinates.

## Testing
Use TDD. Add tests proving that the coordinate resolver returns `[longitude, latitude]` for valid stored coordinates and returns null for missing/out-of-range coordinates. Add Worker tests for authenticated REA access and the returned coordinate fields where the existing test harness supports Worker route testing. Run the full Vitest suite, TypeScript typecheck, and production build before integration.

## Deployment
Implement on `fix/d1-project-map-coordinates` and keep PR #48 as the review surface. Do not merge/deploy until tests, typecheck, build, and final review are clean. After merge to `main`, verify the Cloudflare deployment and confirm a known D1 project pin resolves to its stored coordinate.

## Non-goals
This change does not redesign the Project Map, change geofence distances, invent coordinates for projects, alter Field Officer workflows, or modify unrelated REA/Consultant dashboard designs.
