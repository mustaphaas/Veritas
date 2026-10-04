import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fieldApi = fs.readFileSync("worker/field-api.js", "utf8");
const auth = fs.readFileSync("client/lib/auth.tsx", "utf8");
const consultants = fs.readFileSync("client/lib/consultants.ts", "utf8");
const consultantUi = fs.readFileSync("client/components/ReaConsultantsManagement.tsx", "utf8");

test("consultant assignment cannot take ownership of another firm's project", () => {
  assert.match(fieldApi, /Project must be allocated by REA before consultant assignment/);
  assert.match(fieldApi, /Project is outside your consultant firm/);
  assert.match(fieldApi, /Assignment is outside your consultant firm/);
  assert.match(fieldApi, /if \(user\.role === "consultant_admin"\)[\s\S]*SELECT id,consultant_firm FROM projects WHERE id=\?/);
  assert.doesNotMatch(
    fieldApi,
    /user\.role === "consultant_admin"[\s\S]{0,1500}ON CONFLICT\(id\) DO UPDATE SET[\s\S]{0,500}consultant_firm=excluded\.consultant_firm/,
  );
});

test("browser authentication is cloud session only", () => {
  assert.doesNotMatch(auth, /demoAccounts/);
  assert.doesNotMatch(auth, /authenticateDemoAccount/);
  assert.doesNotMatch(auth, /temporaryPassword/);
  assert.match(auth, /authenticateFieldApi/);
  assert.match(auth, /fetchConsultantProfileWithToken/);
});

test("consultant passwords are not shipped or displayed in persistent client records", () => {
  assert.doesNotMatch(consultants, /Consult2026!/);
  assert.doesNotMatch(consultantUi, /selected\.temporaryPassword/);
  assert.match(consultantUi, /Passwords are stored only as server-side hashes/);
  assert.match(consultantUi, /safeRecord=\{\.\.\.next,temporaryPassword:""\}/);
});
