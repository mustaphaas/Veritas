import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const worker = fs.readFileSync("worker/index.js", "utf8");
const fieldApi = fs.readFileSync("worker/field-api.js", "utf8");
const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");
const users = fs.readFileSync("client/components/ReaUserManagement.tsx", "utf8");

test("M&E Officer project portfolio is scoped through team membership", () => {
  assert.match(worker, /user\.staffRole === "M&E Officer"[\s\S]*collaborative_inspections ci[\s\S]*inspection_team_members itm[\s\S]*itm\.user_id=\?/);
});

test("M&E Officer inspections and teams are scoped by membership", () => {
  assert.match(fieldApi, /const scoped = user\?\.staffRole === "M&E Officer"/);
  assert.match(fieldApi, /JOIN inspection_team_members m ON m\.team_id=i\.team_id[\s\S]*WHERE m\.user_id=\?/);
  assert.match(fieldApi, /JOIN inspection_team_members scope_member ON scope_member\.team_id=t\.id[\s\S]*scope_member\.user_id=\?/);
});

test("M&E Admin is the staff role allowed to manage M&E teams", () => {
  assert.match(users, /"M&E Admin"/);
  assert.match(fieldApi, /user\.staffRole === "M&E Admin"/);
  assert.match(fieldApi, /r\.staff_role IN \('M&E Admin','M&E Officer'\)/);
});

test("M&E workspace exposes team creation and project assignment only to admin", () => {
  assert.match(page, /activeTab === "Teams" && isMeAdmin/);
  assert.match(page, /Create M&E Team/);
  assert.match(page, /Assign Project to Team/);
  assert.match(page, /Officers will only see projects assigned to teams they belong to/);
});

test("ordinary M&E officer view explicitly reflects assigned portfolio scope", () => {
  assert.match(page, /Your portfolio is limited to projects assigned to your M&E teams/);
});
