# D1-backed Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-local Claims storage with authenticated D1 persistence, spreadsheet import, real consultant allocation, demo data, REA API integration provision, and a clearer REA Claims UI.

**Architecture:** D1 is authoritative. The Worker owns authenticated claims and consultants APIs; the React client consumes those APIs and only uses local state for transient UI/import staging. Spreadsheet parsing is client-side, but server validation remains authoritative.

**Tech Stack:** Cloudflare Workers, D1/SQLite migrations, React 18, TypeScript, Vite, Vitest/Node test runner, SheetJS-compatible `xlsx` parser.

**Spec:** `docs/superpowers/specs/2026-09-13-claims-d1-architecture-design.md`

## Global Constraints
- Preserve the established REA white/green visual language while improving the Claims module only.
- D1 is authoritative; no Claims or consultant-list authority in localStorage.
- Accept `.xlsx`, `.xls`, and `.csv` claim imports.
- Allocation filter values are All, Assigned, Unassigned.
- REA API secrets/configuration remain server-side.
- Writes require authenticated authorization and server-side validation.

---

### Task 1: D1 claims schema and demo portfolio
**Files:** Create `migrations/0003_claims.sql`; Test `tests/claims-migration.test.mjs`.
**Interfaces:** Produces `claims` and `claim_events` tables and indexes used by Worker APIs.
- [ ] Write a failing migration test asserting table/index definitions, assignment/source columns, and idempotent demo seed statements.
- [ ] Run the focused Node test and confirm failure because `0003_claims.sql` is absent.
- [ ] Add migration with existing claim fields, `consultant_id`, `consultant_firm`, lifecycle/audit/source fields, timestamps, indexes and idempotent assigned/unassigned demo rows.
- [ ] Re-run focused test and confirm pass.
- [ ] Commit migration and test.

### Task 2: Authenticated Claims API
**Files:** Modify `worker/index.js`; Test `tests/claims-api.test.mjs`.
**Interfaces:** Produces `GET /api/rea/claims`, `POST /api/rea/claims/import`, `PATCH /api/rea/claims/:id`, and `POST /api/rea/claims/:id/assign` behavior.
- [ ] Write failing tests for authorization, list serialization, batch import validation, assignment to active consultant, unassignment, and lifecycle update persistence.
- [ ] Run focused tests and confirm endpoint failures.
- [ ] Implement minimal Worker handlers using D1 prepared statements/batches and `claim_events` audit writes.
- [ ] Re-run focused tests and existing Worker tests.
- [ ] Commit API and tests.

### Task 3: D1-backed REA consultant listing
**Files:** Modify `worker/index.js`, `client/lib/field-api.ts`, `client/components/ReaConsultantsManagement.tsx`; Test `tests/rea-consultants-list.test.mjs` and relevant Vitest client test.
**Interfaces:** Produces authenticated `GET /api/rea/consultants` and client `listConsultantsApi()`; Claims consumes active consultant records.
- [ ] Write failing tests proving GET returns D1 consultants and excludes password material.
- [ ] Run focused tests and confirm current POST-only route fails.
- [ ] Implement GET while preserving POST creation; map DB fields to client records.
- [ ] Replace Consultants tab initial authority with API-loaded records and explicit loading/error state.
- [ ] Run focused and regression tests.
- [ ] Commit consultant database listing change.

### Task 4: Claims client API and spreadsheet parser
**Files:** Create `client/lib/claims-api.ts`, `client/lib/claims-import.ts`; Modify `package.json` and lockfile for `xlsx`; Test `client/lib/claims-import.test.ts` and API tests.
**Interfaces:** Produces typed `listClaimsApi`, `importClaimsApi`, `assignClaimApi`, `updateClaimApi`, and `parseClaimWorkbook(file)`.
- [ ] Write failing tests with representative CSV, XLS-compatible and XLSX workbook fixtures/arrays.
- [ ] Run Vitest and confirm parser/API modules are missing.
- [ ] Add maintained `xlsx` dependency and implement extension-independent workbook parsing with normalized headers.
- [ ] Implement authenticated Claims API helpers following existing field-api auth conventions.
- [ ] Run focused tests and typecheck.
- [ ] Commit parser/API layer.

### Task 5: Database-backed Claims UI and visual refinement
**Files:** Modify `client/components/ReaClaimsManagement.tsx`; Test `client/components/ReaClaimsManagement.test.tsx` (or established component test location).
**Interfaces:** Consumes Claims API, import parser and D1 consultants; no localStorage authority.
- [ ] Write failing component tests for D1 loading, All/Assigned/Unassigned filters, active-consultant allocation, XLS/XLSX/CSV staging, import confirmation and persisted status update calls.
- [ ] Run focused tests and confirm failures against current localStorage implementation.
- [ ] Replace seeded/localStorage authority with API loading and mutations; keep staged rows transient only.
- [ ] Add compact KPI cards for Total Claims, Assigned, Unassigned, REA Verified and Claim Value; improve filter/action bar, badges, table responsiveness and lifecycle/detail readability without redesigning unrelated pages.
- [ ] Run component tests, typecheck and client build.
- [ ] Commit Claims UI change.

### Task 6: REA API integration boundary
**Files:** Modify `worker/index.js`; Create `tests/claims-rea-integration.test.mjs`; update `.env.example` only with non-secret variable names if required.
**Interfaces:** Produces a server-side ingestion adapter/config boundary that normalizes REA API claim payloads into the same import service and source idempotency model.
- [ ] Write failing tests proving REA API sourced records are normalized, source-tagged and idempotent without exposing credentials to client responses.
- [ ] Run focused test and confirm failure.
- [ ] Implement server-side adapter/helper and configuration checks; do not require a live REA endpoint for normal Claims operation.
- [ ] Run focused tests.
- [ ] Commit integration provision.

### Task 7: Full verification and deployment readiness
**Files:** No feature files unless a verified regression requires correction.
**Interfaces:** Validates the complete branch.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Inspect branch diff for accidental unrelated visual/backend changes and sensitive data.
- [ ] Verify migration is wired into the Cloudflare deployment path; if production migrations require an explicit workflow step, add/test that step before deployment.
- [ ] Commit only verified corrections, then merge/deploy according to the repository's established Cloudflare workflow and verify the resulting workflow run before claiming production completion.
