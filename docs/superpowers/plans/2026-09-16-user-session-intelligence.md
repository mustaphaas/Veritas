# User Session Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist user session history for all Veritas roles, expose tenant-safe activity reporting, and make live session metrics available to Veritas AI for grounded human-style analysis.

**Architecture:** Keep `sessions` as the active authentication-token table and add durable `user_session_history` records linked by `history_id`. Session lifecycle updates happen inside `worker/field-api.js`; reporting and AI context live in `worker/index.js`; the existing REA Audit Trail gets a login-sessions view. A deployment patch script applies source changes consistently before Cloudflare build/deploy.

**Tech Stack:** Cloudflare Workers, D1 SQLite, React 18, TypeScript, Vitest/Node test runner, GitHub Actions, Wrangler.

**Spec:** `docs/superpowers/specs/2026-09-16-user-session-intelligence-design.md`

## Global Constraints

- Cover `rea_admin`, `consultant_admin`, and `field_officer` session creation.
- REA can inspect all session history; consultant admins are restricted to their own consultant firm.
- Preserve the existing dashboard visual language and existing authentication behavior.
- Never expose session token hashes to the dashboard or AI.
- Treat duration as an observed session/activity span, not proof of continuous work.
- AI may identify unusual recorded patterns but must not infer misconduct or non-performance without evidence.
- Commit directly to `main` and use the existing Cloudflare production workflow.

---

### Task 1: Define session-history contracts with failing regression tests

**Files:**
- Create: `tests/session-activity-migration.test.mjs`
- Create: `tests/session-activity-contract.test.mjs`
- Create: `tests/session-activity-ai-context.test.mjs`
- Create: `tests/session-activity-ui.test.mjs`

**Interfaces:**
- Produces expectations for migration table `user_session_history`, `sessions.history_id`, `/api/session-activity`, AI `sessionActivity`, and Audit Trail login-session UI.

- [ ] **Step 1: Add migration assertions**

Assert migration `0006_user_session_activity.sql` contains `CREATE TABLE IF NOT EXISTS user_session_history`, user/history foreign keys, lifecycle timestamps, status/end reason, device metadata and useful indexes.

- [ ] **Step 2: Add lifecycle/API source assertions**

Assert the session patch and generated Worker source contain durable history creation on login, activity refresh, manual logout closure, tenant scoping, and `/api/session-activity` routing.

- [ ] **Step 3: Add AI context assertions**

Assert `worker/index.js` contains a `sessionActivity` context section, observed-duration language, bounded recent sessions, and safeguards against treating unusual patterns as misconduct.

- [ ] **Step 4: Add UI assertions**

Assert `ReaAuditTrail.tsx` contains a Login Sessions view and displays login, last activity, duration, status, role and consultant fields.

- [ ] **Step 5: Run tests and confirm RED**

Run the four new tests. Expected result: failures because migration, API/context, and UI support do not yet exist.

- [ ] **Step 6: Commit tests**

Commit message: `test: define user session intelligence contracts`.

---

### Task 2: Add durable D1 session-history schema

**Files:**
- Create: `migrations/0006_user_session_activity.sql`

**Interfaces:**
- Produces: `user_session_history(id,user_id,login_at,last_seen_at,ended_at,duration_seconds,status,end_reason,ip_address,user_agent,device_family,browser,os,created_at,updated_at)` and `sessions.history_id`.

- [ ] **Step 1: Create migration**

Use SQLite-compatible `ALTER TABLE sessions ADD COLUMN history_id TEXT` followed by durable history table and indexes on user/time, status/time, consultant lookup via joined user id, and history id.

- [ ] **Step 2: Re-run migration test**

Expected: migration assertions pass.

- [ ] **Step 3: Commit migration**

Commit message: `feat: add durable user session history schema`.

---

### Task 3: Implement session lifecycle recording

**Files:**
- Create: `scripts/patch-user-session-activity.mjs`
- Modify via patch: `worker/field-api.js`
- Test: `tests/session-activity-contract.test.mjs`

**Interfaces:**
- Produces helper behavior that creates history on login, updates observed activity when authenticated requests occur, and closes history on manual logout.

- [ ] **Step 1: Implement device parsing helper**

Derive coarse device family, browser and OS from the `User-Agent` string without fingerprinting.

- [ ] **Step 2: Extend `currentUser`**

Fetch the active session's `history_id`; update both `sessions.last_seen_at` and the linked history row with current timestamp and calculated duration.

- [ ] **Step 3: Extend `login`**

Create a UUID history record before inserting the active session, store request IP/User-Agent/device labels, then link the token row using `history_id`.

- [ ] **Step 4: Extend logout route**

Resolve the active session by token hash, close its history row with `manual_logout`, calculate final duration from login to current time, then delete the active token row.

- [ ] **Step 5: Re-run lifecycle contract test**

Expected: login/activity/logout assertions pass.

- [ ] **Step 6: Commit lifecycle change**

Commit message: `feat: record durable user session lifecycle`.

---

### Task 4: Add tenant-safe session reporting and deterministic summaries

**Files:**
- Modify via patch: `worker/index.js`
- Test: `tests/session-activity-contract.test.mjs`

**Interfaces:**
- Produces: `GET /api/session-activity` with filters and summary metrics.

- [ ] **Step 1: Add authorised session query handler**

Authenticate caller. Permit REA roles globally. Permit consultant admins only when joined user records match caller `consultantFirm`. Reject field officers.

- [ ] **Step 2: Add bounded filters**

Support `userId`, `role`, `consultantFirm`, `status`, `from`, `to`, and a limit clamped to a safe range.

- [ ] **Step 3: Add deterministic summary**

Return session count, unique users, open sessions, total/average observed duration, latest login, after-hours count and per-user rollups. After-hours is descriptive only and uses recorded timestamps; it is not labelled as suspicious by default.

- [ ] **Step 4: Reconcile expired sessions before reporting**

Close history rows whose linked active token has expired using the last seen timestamp and `expired` end reason, then delete expired active token rows.

- [ ] **Step 5: Register `/api/session-activity`**

GET only; use the existing JSON helper and build header.

- [ ] **Step 6: Re-run API contract test**

Expected: endpoint and tenant-scope assertions pass.

- [ ] **Step 7: Commit reporting change**

Commit message: `feat: expose tenant-safe session activity reporting`.

---

### Task 5: Feed authoritative session intelligence into Veritas AI

**Files:**
- Modify via patch: `worker/index.js`
- Test: `tests/session-activity-ai-context.test.mjs`

**Interfaces:**
- Produces `sessionActivity` in `liveDatabaseContext` and prompt safeguards.

- [ ] **Step 1: Query session history in live context**

Join history to users and load deterministic aggregates plus a bounded recent-session sample.

- [ ] **Step 2: Build exact AI metrics**

Include total sessions, unique users, open sessions, latest login, average observed duration, per-role counts, per-consultant counts, and per-user latest activity summaries.

- [ ] **Step 3: Compact context intelligently**

Keep detailed recent session rows only when the user question mentions logins, activity, sessions, user usage, duration, access time or suspicious/unusual patterns; otherwise retain only summary metrics.

- [ ] **Step 4: Add interpretation rules**

State that duration is observed span, not continuous work; unusual hours/multiple IPs/concurrency warrant review but do not prove account compromise, absence, misconduct or inactivity.

- [ ] **Step 5: Re-run AI context test**

Expected: context and safeguard assertions pass.

- [ ] **Step 6: Commit AI integration**

Commit message: `feat: ground Veritas AI in user session activity`.

---

### Task 6: Add Login Sessions view to Audit Trail

**Files:**
- Modify: `client/components/ReaAuditTrail.tsx`
- Modify as needed: `client/lib/auth.tsx`
- Test: `tests/session-activity-ui.test.mjs`

**Interfaces:**
- Consumes authenticated API token from existing auth context.
- Produces a two-view Audit Trail interface: event log and login sessions.

- [ ] **Step 1: Add session activity types and fetch**

Fetch `/api/session-activity` with the existing bearer token when the logged-in user has REA access.

- [ ] **Step 2: Add view switch without sidebar changes**

Use compact `Audit Events` / `Login Sessions` controls inside the current Audit Trail header area.

- [ ] **Step 3: Render session table**

Show user, role, consultant, login, last activity, end time, observed duration, device/browser, status and end reason. Keep current card/table styling.

- [ ] **Step 4: Add safe explanatory copy**

Label durations as observed session spans and avoid wording that equates an open session with continuous work.

- [ ] **Step 5: Re-run UI contract test**

Expected: UI assertions pass.

- [ ] **Step 6: Commit UI**

Commit message: `feat: show login sessions in REA audit trail`.

---

### Task 7: Wire deployment validation and verify production workflow

**Files:**
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Test: all session tests plus existing build/tests

**Interfaces:**
- Ensures source patch runs before validation/build, migration runs remotely, and Worker/assets deploy through existing workflow.

- [ ] **Step 1: Add patch step**

Run `node scripts/patch-user-session-activity.mjs` before Worker syntax checks and build.

- [ ] **Step 2: Add regression test step**

Run all four session-intelligence tests before build.

- [ ] **Step 3: Keep existing D1 migration/deploy steps unchanged**

Migration `0006` is applied by the existing `wrangler d1 migrations apply ... --remote` step before Worker deployment.

- [ ] **Step 4: Verify source syntax/build through GitHub Actions**

Confirm the push-to-main workflow reports successful regression tests, client build, migration, deploy and production deployment inspection.

- [ ] **Step 5: Commit workflow update**

Commit message: `ci: validate and deploy user session intelligence`.
