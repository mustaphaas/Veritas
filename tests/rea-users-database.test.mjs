import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const usersComponent = fs.readFileSync("client/components/ReaUserManagement.tsx", "utf8");
const fieldApi = fs.readFileSync("client/lib/field-api.ts", "utf8");
const worker = fs.readFileSync("worker/index.js", "utf8");

test("REA Users tab is database-backed and does not render local/demo staff", () => {
  assert.match(fieldApi, /fetchReaPortalUsers/);
  assert.match(usersComponent, /fetchReaPortalUsers/);
  assert.doesNotMatch(usersComponent, /readReaStaff|writeReaStaff/);
});

test("worker exposes database-backed REA portal users endpoint", () => {
  assert.match(worker, /async function reaUsersResponse/);
  assert.match(worker, /url\.pathname === "\/api\/rea\/users"/);
  assert.match(worker, /FROM users ORDER BY role,name/);
});

test("AI user classification distinguishes REA staff from consultant-side users", () => {
  assert.match(worker, /const reaStaff = users\.filter\(\(user\) => String\(user\.role \|\| ""\)\.startsWith\("rea_"\)\)/);
  assert.match(worker, /reaStaff:/);
  assert.match(worker, /reaStaffCount:/);
  assert.doesNotMatch(worker, /reaAdminCount:/);
});
