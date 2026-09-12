# Field Officer Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing Veritas Field Officer Android app to the approved reference, replace its REA artwork/app icon with the user-provided logo, and preserve forms, offline workflow, and Veritas API compatibility.

**Architecture:** Keep the existing Expo/React Native application and its domain/store/API contracts. Refactor only presentation boundaries needed to make the screens maintainable, while keeping form definitions and submission payloads unchanged. Treat server-confirmed API success as the synchronization boundary and retain local state on failure.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Ionicons, Expo Location, Expo Image Picker, Expo File System, existing Veritas `/api/field` endpoints.

**Spec:** `docs/superpowers/specs/2026-09-12-field-officer-mobile-redesign-design.md`

## Global Constraints
- Scope is `field-officer-mobile`; do not redesign Veritas web.
- Preserve existing inspection form fields and backend payload semantics.
- Preserve GPS, evidence, offline, autosave, report locking, and authentication behavior.
- Keep five bottom tabs: Overview, Assignments, Inspections, Drafts, Sync.
- Use the supplied REA artwork for in-app logo and Android/Expo icon while preserving existing rendered logo sizing/positioning.
- Existing `/api/field` contract and assignment/report identifiers remain authoritative.

---

### Task 1: Lock workflow/status behavior with regression tests

**Files:**
- Modify: `field-officer-mobile/src/domain.test.ts`
- Modify only if a failing regression requires it: `field-officer-mobile/src/domain.ts`

**Interfaces:**
- Consumes: existing `assignmentsForSection`, `displayStatus`, report-locking/domain helpers.
- Produces: regression protection ensuring Assignments, Drafts, and Inspections expose the intended backend statuses without changing payload semantics.

- [ ] **Step 1: Add failing/confirming tests** asserting Assignments contains assignment-ready records, Drafts contains Draft records, and Inspections contains Submitted, Approved, and Verified records using representative `Assignment` fixtures already used by the test suite.
- [ ] **Step 2: Run domain tests** with `cd field-officer-mobile && npm test`; expected result is either PASS (behavior already correct) or a focused failure identifying the status helper mismatch.
- [ ] **Step 3: If needed, minimally update `assignmentsForSection`** so presentation filtering matches the approved status semantics without changing status strings or report data.
- [ ] **Step 4: Re-run `npm test`** and require all domain tests to pass.
- [ ] **Step 5: Commit** with `test: lock field officer status navigation`.

### Task 2: Apply the supplied REA branding without layout changes

**Files:**
- Replace binary asset: `field-officer-mobile/assets/rea-logo.png`
- Replace binary asset: `field-officer-mobile/assets/icon.png`
- Verify: `field-officer-mobile/app.json`
- Verify: `field-officer-mobile/src/App.tsx`

**Interfaces:**
- Consumes: `reaLogo = require("../assets/rea-logo.png")` and Expo icon/splash/adaptive-icon configuration.
- Produces: identical artwork used in the header/login and Android launcher icon while existing rendered dimensions remain unchanged.

- [ ] **Step 1: Copy the approved uploaded REA image bytes** to both `assets/rea-logo.png` and `assets/icon.png`; do not crop or redesign the supplied artwork.
- [ ] **Step 2: Verify `app.json` icon/splash/adaptiveIcon paths** continue to resolve to the replacement artwork. If `icon.png` is selected for launcher configuration, change only those path strings; do not alter colors, orientation, permissions, API URL, package ID, or navigation/status-bar configuration.
- [ ] **Step 3: Inspect the `headerLogo` and `brandMark` style declarations** and leave width/height/margins unchanged.
- [ ] **Step 4: Run `npx tsc --noEmit`**; expected PASS.
- [ ] **Step 5: Commit** with `chore: update field officer REA branding`.

### Task 3: Implement the approved mobile visual shell and coloured navigation

**Files:**
- Modify: `field-officer-mobile/src/App.tsx`
- Modify: `field-officer-mobile/src/theme.ts`

**Interfaces:**
- Consumes: existing `Tab`, `tabs`, `FieldOfficerApp`, `AnimatedTab`, store state, and existing screen callbacks.
- Produces: white spacious shell, soft card treatment, persistent Veritas header, coloured active bottom tabs, and unchanged tab routing.

- [ ] **Step 1: Define the approved palette in `theme.ts`** using existing semantic keys where possible: REA green primary, amber Due, blue Drafts, violet Sync, neutral white/ink/border/background values. Do not change domain/status values.
- [ ] **Step 2: Restyle `FieldOfficerApp` header** to match the reference while preserving the existing logo rendered dimensions and retaining Online/Offline and avatar interactions.
- [ ] **Step 3: Restyle `AnimatedTab` and tab bar** so Overview, Assignments, Inspections, Drafts, Sync retain distinct active colours and all five navigation callbacks remain unchanged.
- [ ] **Step 4: Run `npx tsc --noEmit` and `npm test`**; both must pass.
- [ ] **Step 5: Commit** with `feat: redesign field officer mobile shell`.

### Task 4: Redesign Overview to the approved template

**Files:**
- Modify: `field-officer-mobile/src/App.tsx`

**Interfaces:**
- Consumes: `useStore().assignments`, `officerName`, existing navigation/open callbacks, project records.
- Produces: greeting/company block, four KPI cards, Current Assignment, Recent Inspections, and direct navigation to corresponding tabs/inspection records.

- [ ] **Step 1: Change Overview KPI composition** to exactly four cards: Assigned (green), Due (amber), Drafts (blue), To Sync (violet). Calculate values from existing assignment/status/sync fields rather than hard-coded counts.
- [ ] **Step 2: Render consultant/company name directly under the greeting** using the officer/store value if available; preserve the approved fallback currently associated with the field officer account rather than inventing a new backend field.
- [ ] **Step 3: Restyle Current Assignment** with project icon, project/location/ID, Programme/Component/Site summary, Navigate to site, and Start/Continue inspection. Preserve `openMaps` and `onOpen` behavior.
- [ ] **Step 4: Replace the old Overview assignment list with Recent Inspections** sourced from existing non-Assigned inspection records, with status chips and a See all action opening Inspections.
- [ ] **Step 5: Run `npx tsc --noEmit` and `npm test`**; expected PASS.
- [ ] **Step 6: Commit** with `feat: redesign field officer overview`.

### Task 5: Redesign Assignments, Inspections, and Drafts without changing forms

**Files:**
- Modify: `field-officer-mobile/src/App.tsx`

**Interfaces:**
- Consumes: `assignmentsForSection`, `AssignmentCard`, `onOpen`, existing status values.
- Produces: reference-style searchable/list screens, consistent solar/project icon, Assigned/Due Soon emphasis, Submitted/Approved/Verified inspection chips, and autosaved Draft list.

- [ ] **Step 1: Restyle Assignments** with title, segmented status filters, search field, consistent project icon, location/ID/due date, and Assigned/Due Soon chips. Filtering must operate only on existing assignment records.
- [ ] **Step 2: Restyle Inspections** with All/Verified/Submitted/Approved filters and corresponding existing statuses; do not synthesize status changes.
- [ ] **Step 3: Restyle Drafts** with autosave notice and last-saved information available from existing local report state. Selecting a draft must resume the same inspection report.
- [ ] **Step 4: Keep `InspectionModal`, form sections, field definitions, GPS/evidence actions, signatures, validation, and submission payload behavior unchanged except presentation-only styles required for visual consistency.
- [ ] **Step 5: Run `npx tsc --noEmit` and `npm test`**; expected PASS.
- [ ] **Step 6: Commit** with `feat: redesign field officer work lists`.

### Task 6: Redesign Sync Queue while preserving server-confirmed synchronization

**Files:**
- Modify: `field-officer-mobile/src/App.tsx`
- Modify only for correctness/regression: `field-officer-mobile/src/store.tsx`
- Verify: `field-officer-mobile/src/api.ts`

**Interfaces:**
- Consumes: assignment `syncStatus`, store sync action, `apiDraft`, `apiEvidence`, `apiSubmit`.
- Produces: Ready to sync header/action, Uploading/Waiting/Completed KPIs, sequential item progress presentation, retryable failure state, and no false successful state before API confirmation.

- [ ] **Step 1: Restyle `SyncScreen`** to the approved reference with Sync Now, three coloured summary cards, per-item progress/status, and Sync Settings affordance where already supported.
- [ ] **Step 2: Trace the existing store sync loop** and assert visually completed/synced state is set only after the corresponding API call resolves successfully. On rejection, retain queued/failed local state and evidence/report data.
- [ ] **Step 3: Preserve sequential upload behavior** so the top queued operation is processed before the next and UI progress follows the actual current operation.
- [ ] **Step 4: Run `npx tsc --noEmit` and `npm test`**; expected PASS.
- [ ] **Step 5: Commit** with `feat: redesign and harden field sync queue`.

### Task 7: Complete Profile, Settings, Help styling and full regression verification

**Files:**
- Modify: `field-officer-mobile/src/App.tsx`
- Verify: `field-officer-mobile/app.json`
- Verify: `field-officer-mobile/src/api.ts`
- Verify: `field-officer-mobile/src/domain.ts`
- Verify: `field-officer-mobile/src/store.tsx`

**Interfaces:**
- Consumes: existing profile/logout and app settings/help interactions.
- Produces: coherent approved visual language without changing authentication or field workflow.

- [ ] **Step 1: Restyle Profile/Settings/Help surfaces** to match the supplied reference while preserving existing functional actions; do not add backend mutations that do not already exist.
- [ ] **Step 2: Run `npm test`**; expected all tests PASS.
- [ ] **Step 3: Run `npx tsc --noEmit`**; expected PASS with zero TypeScript errors.
- [ ] **Step 4: Run `npx expo config --type public`** and verify package `ng.gov.rea.veritas.fieldofficer`, portrait orientation, location/camera/audio permissions, icon assets, and API/EAS configuration remain present.
- [ ] **Step 5: Smoke-test on Android/Expo**: login; Overview; all five tabs; open assignment; autosave draft; resume draft; GPS arrival; capture photo/video evidence; switch offline; queue sync; restore network; Sync Now; submit; refresh assignments; confirm server-returned status is shown.
- [ ] **Step 6: Review git diff** and confirm no Veritas web files, form definitions, API endpoint paths, or unrelated deployment configuration changed.
- [ ] **Step 7: Commit** with `feat: complete field officer mobile redesign`.
