import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patch = fs.readFileSync("scripts/patch-user-session-activity.mjs", "utf8");
const loginResiliencePatch = fs.readFileSync("scripts/patch-login-resilience.mjs", "utf8");
const auth = fs.readFileSync("client/lib/auth.tsx", "utf8");
const loginPage = fs.readFileSync("client/pages/Login.tsx", "utf8");

test("session lifecycle is recorded durably", () => {
  assert.match(patch, /user_session_history/);
  assert.match(patch, /history_id/);
  assert.match(patch, /manual_logout/);
  assert.match(patch, /duration_seconds/);
  assert.match(patch, /last_seen_at/);
  assert.match(patch, /authenticatedDatabaseUser[\s\S]*historyId/);
  assert.match(patch, /UPDATE user_session_history SET last_seen_at/);
});

test("session activity endpoint is tenant safe", () => {
  assert.match(patch, /\/api\/session-activity/);
  assert.match(patch, /consultant_admin/);
  assert.match(patch, /consultant_firm/);
  assert.match(patch, /REA or consultant administrator access required/);
  assert.match(patch, /limit/);
  assert.match(patch, /expired/);
});

test("valid credential login is not blocked by session telemetry", () => {
  assert.match(loginResiliencePatch, /INSERT INTO sessions\(token_hash,user_id,created_at,expires_at,last_seen_at\)/);
  assert.match(loginResiliencePatch, /session-history-write-failed/);
  assert.match(loginResiliencePatch, /login-audit-write-failed/);
  assert.match(loginResiliencePatch, /UPDATE sessions SET history_id=\?/);
});

test("database-backed accounts are not rejected by browser demo state", () => {
  assert.doesNotMatch(auth, /if\(!staff\|\|staff\.status!=="Active"\)return null/);
  assert.doesNotMatch(auth, /return session\.email==="consultant\.admin@demo\.ng"\?session:null/);
  assert.doesNotMatch(auth, /if\(!officer\|\|officer\.status!=="Active"\)return null/);
  assert.doesNotMatch(auth, /catch\{return null\}[\s\S]{0,80}const local=authenticateDemoAccount/);
  assert.doesNotMatch(auth, /if\(local&&local\.role!==cloudRole\)return null/);
});

test("production login does not present authentication as demo-only", () => {
  assert.doesNotMatch(loginPage, /does not match a demo account/);
  assert.doesNotMatch(loginPage, /Demo access only/);
  assert.match(loginPage, /production authentication/i);
});
