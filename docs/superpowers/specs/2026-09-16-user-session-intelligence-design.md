# Veritas User Session Intelligence Design

## Goal

Persist login/session history for every Veritas user and make that history available to authorised dashboard users and the Veritas AI assistant for grounded, human-style operational analysis.

## Scope

The feature covers all current user roles: `rea_admin`, `consultant_admin`, and `field_officer`, and is designed so future roles can be represented without changing the session-history schema.

## Data model

Keep the existing `sessions` table as the active authentication-token store. Add a separate append-oriented `user_session_history` table so logout and token cleanup never erase the historical record.

Each history row records:
- session id
- user id
- login time
- last observed activity time
- end time when known
- observed duration in seconds
- status (`active` or `ended`)
- end reason (`manual_logout`, `expired`, `admin_terminated`, `inactive_timeout`, or null while active)
- IP address
- user agent
- coarse device family, browser, and operating system labels

Add `history_id` to `sessions` to link the active token to its durable history record.

Duration is an **observed activity span**, measured from login to explicit end time, or from login to the most recent authenticated request while the session remains open. It must not be presented as proof that the user was continuously working.

## Session lifecycle

On successful login:
1. Create a history row.
2. Create the active `sessions` row linked to that history id.
3. Record the existing audit `login` event.

On each authenticated field/API request:
1. Update `sessions.last_seen_at`.
2. Update the linked history row `last_seen_at` and observed duration.

On manual logout:
1. Resolve the active session and linked history row.
2. Mark the history row ended with `manual_logout` and a final duration.
3. Delete the active token row.

Expired sessions are reconciled when session activity is queried. Expired history rows are closed using their last observed activity timestamp and `expired` as the end reason. This avoids falsely treating seven-day token expiry as continuous activity.

## Access control

`rea_admin` can query session history across all users.

`consultant_admin` can query session history only for accounts whose `consultant_firm` matches their own firm. They cannot request another consultant's records.

Field officers do not receive an administrative session-history endpoint.

Sensitive token hashes are never returned. IP and device metadata are available to authorised administrative views but must not be placed into the general AI context unless needed for a security/activity question. AI responses should prefer pattern summaries over exposing raw identifiers.

## API

Add `GET /api/session-activity`.

Supported filters:
- `userId`
- `role`
- `consultantFirm` (REA only; consultant admins are force-scoped)
- `status`
- `from`
- `to`
- `limit` (bounded)

Response includes session rows and deterministic summary metrics: session count, unique users, currently open sessions, total observed duration, average observed duration, latest login, after-hours session count, and per-user rollups.

## Audit Trail UI

Keep the existing REA visual language. Add an `Activity / Login Sessions` view inside the existing Audit Trail component rather than creating a new sidebar page.

The session view shows user, role, consultant firm, login, last activity, ended time, observed duration, device/browser, status, and end reason. Existing audit-event functionality remains unchanged.

## AI integration

Extend `liveDatabaseContext` with a `sessionActivity` section built from `user_session_history` joined to users. Include exact deterministic metrics plus a bounded list of recent sessions.

The AI instructions must explicitly distinguish:
- confirmed timestamps and calculated observed spans
- unusual patterns versus misconduct or non-performance
- concurrent/different-IP observations versus account compromise

Veritas may say a pattern "warrants review" or is "unusual compared with the recorded pattern", but must not claim a user was idle, absent, fraudulent, or not working unless other authoritative evidence establishes that conclusion.

Example supported questions:
- When did a named user last log in and what was the observed session span?
- Who has not logged in during a requested period?
- Compare session activity across roles or consultant firms.
- Which accounts show unusually long observed spans or multiple IPs?
- Summarise user activity this week.

## Testing

Add regression tests that assert:
- migration creates durable session history and indexes
- patch records login, activity and manual logout lifecycle
- session endpoint enforces REA/global and consultant/tenant access rules
- AI context includes sessionActivity and interpretation safeguards
- Audit Trail includes the session-history view
- deployment workflow applies and validates the patch before build and D1 migration/deploy

## Deployment

Add migration `0006_user_session_activity.sql`. The existing Cloudflare workflow already applies remote D1 migrations before deployment, so the schema change and Worker/client changes ship together. The new session patch must be applied and tested before client build and Wrangler deployment.
