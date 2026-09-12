# Field Officer Mobile Redesign Design

## Goal
Redesign the existing Expo/React Native Field Officer Android app to match the approved Veritas mobile reference while preserving the current inspection forms, workflow, offline behavior, GPS/evidence capture, synchronization contract, and Veritas web compatibility.

## Scope
The redesign applies only to `field-officer-mobile`. It must not change the Veritas web UI. Existing component-based inspection form fields and their meaning must not be removed, renamed, reordered for data purposes, or replaced.

## Visual system
Use a white, spacious mobile layout with soft rounded cards and subtle glass-like elevation. Keep REA green as the primary action/brand color. Overview KPI cards use four distinct tones: Assigned green, Due amber/orange, Drafts blue, To Sync violet. The bottom navigation remains five tabs and uses colored active states while inactive items remain visually restrained.

The persistent header keeps the same overall footprint and contains the replacement REA mark, Veritas name, `REA · FIELD OFFICER`, online/offline status, notification affordance, and officer avatar. The consultant/company name appears directly beneath the greeting on Overview.

## Branding constraint
The user-provided REA image is the authoritative replacement logo. Replace the existing `rea-logo.png` visual with it and use the same artwork for the Android/Expo app icon and adaptive icon. Preserve the current rendered logo size, header dimensions, positioning, spacing, and surrounding layout. This branding replacement must not trigger unrelated layout changes.

## Navigation and screens
The bottom tabs remain Overview, Assignments, Inspections, Drafts, and Sync.

Overview contains greeting, consultant company, four KPI cards, Current Assignment, navigation and inspection continuation actions, and Recent Inspections. Assignments emphasizes Assigned and Due Soon. Inspections exposes relevant workflow states including Submitted, Approved, and Verified. Drafts contains autosaved unfinished forms. Sync shows queued/uploading/completed work and provides explicit synchronization. Profile, Settings, and Help retain their existing functional role and receive the same visual language without changing account/workflow semantics.

Use a uniform project/solar-panel icon for project records across the redesigned list screens.

## Forms and field workflow
Keep the existing inspection modal/form engine and component-specific form definitions. Preserve draft autosave, arrival/GPS verification, map navigation, photos/videos/evidence, signatures/integrity data, report locking, submission rules, and offline operation. A visual redesign may restyle form containers and controls only where it does not change field semantics or submission payloads.

## Data flow and web compatibility
The mobile app continues to use the existing `/api/field` contract. Authentication, assignment retrieval, arrival updates, draft uploads, evidence uploads, and final submissions remain server-backed. Assignment IDs and report payloads remain compatible with Veritas web.

A mobile record is considered synchronized only after its corresponding API operation succeeds. Failed operations remain locally recoverable/queued and must not be falsely presented as server-synchronized. After a successful submission/sync, refreshed server assignment state remains the source of truth for statuses displayed by the app.

## Status semantics
Assignments focuses on Assigned and Due Soon presentation. Draft is an unfinished locally/autosaved inspection. Inspections includes Submitted, Approved, and Verified. Existing backend status values remain authoritative; the redesign changes presentation, not workflow meaning.

## Error/offline behavior
Network failures must preserve local draft/report/evidence state and expose a retryable sync state. GPS permission or arrival-verification failures must remain visible and must not silently bypass verification. Evidence upload failure must not cause a final submission to be shown as completely synchronized. Authentication errors remain explicit.

## Testing
Before release, run the existing mobile domain tests and TypeScript checks. Add regression coverage around section/status filtering and sync state where needed. Verify the app builds with Expo configuration, uses the replacement icon assets, and keeps the existing API base URL/configuration. Manually smoke-test Overview, all five tabs, draft autosave, inspection resume, GPS arrival, evidence capture, offline queue, sync, submission, and subsequent visibility/state refresh from Veritas.

## Non-goals
Do not redesign Veritas web. Do not modify inspection field definitions. Do not introduce a new backend/data model. Do not change consultant scoping or REA permissions. Do not change unrelated web deployment configuration. Do not resize or reposition the logo solely because the source artwork changes.