# Consultant D1 Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make REA-created consultants and consultant-owned field officers persist in Cloudflare D1, enforce tenant isolation server-side, and add safe field-officer lifecycle actions without redesigning the UI.

**Architecture:** D1 becomes the source of truth for consultants, consultant admin users, and field-officer ownership. Existing localStorage records remain as a compatibility cache only after successful API writes. Field officers are scoped by `users.consultant_firm`; consultant-admin API operations may only affect rows matching their own firm, while REA admins may target any firm.

**Tech Stack:** React/TypeScript, Cloudflare Workers, Cloudflare D1, Node test runner/Vitest.

**Spec:** User-approved fixes from the 2026-09-12 Veritas tenancy inspection.

## Global Constraints

- Do not change the visual design.
- Preserve existing routes and demo data compatibility.
- Enforce consultant isolation on the server, not only in localStorage.
- Deletion is allowed only for field officers with no assignments; otherwise suspend/archive behavior is required.

---

### Task 1: Add failing tenancy tests

**Files:**
- Create: `tests/consultant-tenancy-api.test.mjs`

**Interfaces:**
- Consumes: `worker/index.js` and field API routes.
- Produces: coverage for D1 consultant creation, scoped field-officer creation, suspension/reactivation, safe deletion, and cross-consultant denial.

- [ ] Write tests that expect REA consultant creation to insert into both `consultants` and `users`.
- [ ] Write tests that expect a consultant admin to create field officers only in its own firm.
- [ ] Write tests that reject cross-consultant lifecycle actions.
- [ ] Write tests that reject deletion when assignments exist and allow deletion when none exist.
- [ ] Run the test file and confirm it fails because the endpoints do not yet exist.

### Task 2: Implement D1 management endpoints

**Files:**
- Modify: `worker/index.js`
- Modify: `worker/field-api.js`

**Interfaces:**
- Produces: `POST /api/rea/consultants`, `PATCH /api/field/users/field-officers/:id/status`, `DELETE /api/field/users/field-officers/:id`.

- [ ] Add REA-only consultant creation with password hashing and transactional-style rollback on user insert failure.
- [ ] Ensure consultant-admin-created officers always inherit `currentUser.consultantFirm`.
- [ ] Add scoped suspend/reactivate route.
- [ ] Add safe delete route that refuses officers with assignment history.
- [ ] Re-run tests until green.

### Task 3: Wire client management to D1

**Files:**
- Modify: `client/lib/field-api.ts`
- Modify: `client/components/ReaConsultantsManagement.tsx`
- Modify: `client/lib/inspection-workflow.tsx`
- Modify: `client/pages/ConsultantAdminDashboard.tsx`

**Interfaces:**
- Consumes: new management endpoints.
- Produces: database-backed consultant creation and field-officer lifecycle actions while retaining the current UI styling.

- [ ] Add API helpers for consultant creation and officer status/delete actions.
- [ ] Make REA consultant creation persist to D1 before updating local cache.
- [ ] Remove hardcoded `Supreme Way` from field-officer creation.
- [ ] Add lifecycle actions using existing controls/styles only.
- [ ] Run typecheck and tests.

### Task 4: Verify and integrate

**Files:**
- Verify all changed files.

- [ ] Run the full test suite.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Confirm no visual layout changes are present.
- [ ] Merge verified commits to `main`.
