import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");

test("M&E dashboard reuses the REA Overview visual shell", () => {
  assert.match(page, /veritas-government-app/);
  assert.match(page, /veritas-government-topbar/);
  assert.match(page, /veritas-rea-side-rail/);
  assert.match(page, /veritas-dashboard-content/);
  assert.match(page, /veritas-overview-filter-bar/);
  assert.match(page, /veritas-overview-kpis/);
  assert.match(page, /veritas-overview-kpi-card/);
  assert.match(page, /veritas-overview-panel/);
});

test("M&E does not render the old standalone left-sidebar workspace", () => {
  assert.doesNotMatch(page, /<aside className="hidden w-\[238px\]/);
  assert.doesNotMatch(page, /M&E Workspace/);
});

test("M&E keeps role-specific monitoring content", () => {
  assert.match(page, /Projects Monitored/);
  assert.match(page, /Inspections Completed/);
  assert.match(page, /Pending Review/);
  assert.match(page, /Re-Inspection/);
  assert.match(page, /Programme Performance/);
  assert.match(page, /Monitoring Attention/);
});
