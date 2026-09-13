# D1-backed Claims Architecture Design

## Goal
Make Claims a production database-backed Veritas module while retaining and improving the existing REA visual language.

## Data authority
Cloudflare D1 `veritas-production` is authoritative. Browser localStorage and seeded frontend arrays are not authoritative. Claims reference a consultant by stable consultant id and retain a consultant firm display snapshot where useful.

## Claims schema
Add a `claims` table covering the existing DARES supply-side fields, lifecycle status, audit status, contractor/developer, consultant assignment, source (`demo`, `import`, `rea_api`), timestamps and source reference. Add `claim_events` for assignment/status/import audit history. Index status, consultant, state, contractor and external/source identifiers.

## Demo data
Seed representative DARES claims idempotently in the D1 migration. Include both assigned and unassigned claims and multiple lifecycle/audit states. Demo records are clearly source-tagged and can be replaced by production imports later.

## API
Authenticated REA endpoints expose claim list/detail, batch import, assignment and status updates. REA admin/authorized staff can manage claims. Consultant-facing access remains tenant-scoped when claims are surfaced there. `GET /api/rea/consultants` becomes D1-backed so claim allocation uses real active consultants.

## Import
The UI accepts `.xlsx`, `.xls`, and `.csv`. Spreadsheet parsing happens client-side with a maintained workbook parser; rows are normalized into the existing claim shape, validated and staged. Only confirmed valid rows are sent to the authenticated batch-import API. Duplicate external ids and invalid coordinates/amounts are rejected by both UI validation and database/API constraints.

## REA integration provision
Create a backend integration boundary for future REA API ingestion. Configuration is server-side; the browser will not contain REA API credentials. Imported records carry source and source reference fields so API synchronization can be idempotent. The existing optional frontend-only `VITE_REA_CLAIMS_API_URL` pattern will no longer be the data authority.

## Allocation filters
Claims UI provides `All`, `Assigned`, and `Unassigned` allocation filtering. Assignment selects only active consultants returned by D1. Assigned rows show consultant firm; unassigned rows show an explicit Unassigned state.

## Visual improvements
Keep the current white/REA-green professional interface while improving hierarchy: compact KPI cards for Total Claims, Assigned, Unassigned, REA Verified and Claim Value; a cleaner filter/action bar; clearer allocation badges; improved import staging feedback; responsive claim table; and a more legible claim detail/lifecycle panel. No unrelated dashboard redesign.

## Reliability and security
All write endpoints require authenticated authorization. Validate request payloads server-side. Use transactions/batches where D1 permits and make demo seeding/migrations idempotent. Record meaningful claim events for imports, assignments and status transitions. Never expose database credentials or REA integration secrets to the client.

## Acceptance criteria
1. Reloading or changing browser does not lose claims.
2. Demo claims exist in D1 with assigned and unassigned examples.
3. Claims list/filter data comes from D1.
4. Allocation uses real active D1 consultants.
5. XLSX, XLS and CSV files can be staged, validated and imported.
6. All/Assigned/Unassigned filtering works.
7. Claim assignment and lifecycle updates persist in D1.
8. Backend has a safe provision for future REA API ingestion.
9. Existing core Claims functionality remains available with improved visual clarity.
10. Tests cover authorization, persistence, filtering, import validation and tenant-sensitive assignment behavior.