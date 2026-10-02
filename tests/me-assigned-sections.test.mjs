import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");
const api = fs.readFileSync("worker/field-api.js", "utf8");

test("M&E dashboard preserves sectionAssignments and current user identity", () => {
  assert.match(page, /sectionAssignments\?: Record<string, string>/);
  assert.match(page, /setCurrentUserId\(workspace\.currentUserId/);
});

test("M&E officer sees My Assigned Sections and assignment counts", () => {
  assert.match(page, /My Assigned Sections/);
  assert.match(page, /mine\.length/);
  assert.match(page, /item\.sectionAssignments\?\.\[section\.id\] === currentUserId/);
});

test("M&E officer can edit fields only in sections assigned to them", () => {
  assert.match(api, /assignedSectionIds/);
  assert.match(api, /allowedFields/);
  assert.match(api, /You can only edit fields in sections assigned to you/);
  assert.match(api, /No inspection section is assigned to you for this project/);
});

test("M&E officer PATCH is allowed without granting team administration", () => {
  assert.match(api, /meOfficerCanWorkInspection/);
  assert.match(api, /request\.method === "PATCH"/);
  assert.match(api, /M&E team administration access required/);
});
