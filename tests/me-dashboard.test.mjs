import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const app = fs.readFileSync("client/App.tsx", "utf8");
const auth = fs.readFileSync("client/lib/auth.tsx", "utf8");
const staff = fs.readFileSync("client/lib/rea-admin.ts", "utf8");
const users = fs.readFileSync("client/components/ReaUserManagement.tsx", "utf8");
const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");
const worker = fs.readFileSync("worker/index.js", "utf8");
const fieldApi = fs.readFileSync("worker/field-api.js", "utf8");

test("M&E has a dedicated role-gated dashboard route", () => {
  assert.match(app, /path="\/me-dashboard\/\*"/);
  assert.match(app, /RequireReaStaffRole staffRole=\{\["M&E Admin", "M&E Officer"\]\}/);
  assert.match(auth, /staffRole === "M&E Admin" \|\| staffRole === "M&E Officer"/);
});

test("M&E roles are available to REA user management", () => {
  assert.match(staff, /"M&E Admin"/);
  assert.match(staff, /"M&E Officer"/);
  assert.match(users, /"M&E Admin"/);
  assert.match(users, /"M&E Officer"/);
  assert.match(staff, /"Findings"/);
  assert.match(staff, /"Analytics"/);
});

test("M&E dashboard keeps assignment-scoped monitoring content", () => {
  assert.match(page, /Projects Monitored/);
  assert.match(page, /Pending Review/);
  assert.match(page, /Re-Inspection/);
  assert.match(page, /Your portfolio is limited to projects assigned to your M&E teams/);
  assert.doesNotMatch(page, /Create REA Staff|Reset Password|Delete User|Create Consultant/);
});

test("REA staff may read projects but only administrators may manage portal users", () => {
  assert.match(worker, /user\.role !== "rea_admin" && user\.role !== "rea_staff".*REA access required/s);
  assert.match(worker, /REA Administrator access required/);
});

test("M&E Officer is read-only while M&E Admin can manage teams", () => {
  assert.match(fieldApi, /r\.staff_role AS staffRole/);
  assert.match(fieldApi, /const canManageMeTeams = user\.role === "rea_admin" \|\| user\.staffRole === "M&E Admin"/);
  assert.match(fieldApi, /M&E team administration access required/);
});
