import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const patch = spawnSync(process.execPath, ["scripts/patch-consultant-d1-tenancy.mjs"], { encoding: "utf8" });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || "consultant tenancy patch failed");

const workerSource = fs.readFileSync("worker/index.js", "utf8");
const workflowSource = fs.readFileSync("client/lib/inspection-workflow.tsx", "utf8");
const reaConsultantsSource = fs.readFileSync("client/components/ReaConsultantsManagement.tsx", "utf8");
const consultantDashboardSource = fs.readFileSync("client/pages/ConsultantAdminDashboard.tsx", "utf8");

test("patch installs database-backed consultant and field-officer management", () => {
  assert.match(workerSource, /\/api\/rea\/consultants/);
  assert.match(workerSource, /field-officer-status-changed/);
  assert.match(workerSource, /Cannot delete a field officer with assignment history/);
  assert.doesNotMatch(workflowSource, /consultantFirm:\s*["']Supreme Way["']/);
  assert.match(reaConsultantsSource, /createConsultantApi/);
  assert.match(consultantDashboardSource, /deleteFieldOfficerApi/);
  assert.match(consultantDashboardSource, />\s*Delete\s*</);
});

test("REA consultant creation writes consultant and consultant-admin user to D1", async () => {
  const statements = [];
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        const state = { args: [] };
        return {
          bind(...args) { state.args = args; return this; },
          async first() {
            if (sql.includes("FROM sessions")) return { id: "rea-1", name: "REA Admin", role: "rea_admin", consultantFirm: null };
            if (sql.includes("FROM consultants") || sql.includes("FROM users")) return null;
            return null;
          },
          async run() { statements.push({ sql, args: state.args }); return { success: true }; },
          async all() { return { results: [] }; },
        };
      },
    },
  };
  const { default: worker } = await import(`../worker/index.js?tenancy=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/rea/consultants", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "con-new",
      firmName: "North Star Verification Ltd",
      adminName: "Amina Bello",
      adminEmail: "amina@northstar.ng",
      adminPhone: "08030000000",
      regions: ["North West"],
      states: ["Kano"],
      status: "Active",
      engagementRef: "REA/CONS/2026/100",
      scopeNote: "Verification support",
      engagementStart: "2026-09-12",
      engagementEnd: "2027-09-11",
      temporaryPassword: "ConsultSafe2026!",
    }),
  }), env);
  assert.equal(response.status, 201);
  assert.ok(statements.some((entry) => entry.sql.includes("INSERT INTO consultants")));
  assert.ok(statements.some((entry) => entry.sql.includes("INSERT INTO users") && entry.args.includes("consultant_admin")));
});

test("consultant cannot manage another firm's field officer", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions")) return { id: "consultant-a", name: "Consultant A", role: "consultant_admin", consultantFirm: "Firm A" };
            if (sql.includes("FROM users") && sql.includes("field_officer")) return { id: "officer-b", consultantFirm: "Firm B", role: "field_officer", status: "active" };
            return null;
          },
          async run() { return { success: true }; },
          async all() { return { results: [] }; },
        };
      },
    },
  };
  const { default: worker } = await import(`../worker/index.js?scope=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/field/users/field-officers/officer-b/status", {
    method: "PATCH",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Suspended" }),
  }), env);
  assert.equal(response.status, 403);
});

test("field officer with assignment history cannot be deleted", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions")) return { id: "consultant-a", name: "Consultant A", role: "consultant_admin", consultantFirm: "Firm A" };
            if (sql.includes("FROM users") && sql.includes("field_officer")) return { id: "officer-a", consultantFirm: "Firm A", role: "field_officer", status: "active" };
            if (sql.includes("COUNT(*)") && sql.includes("assignments")) return { count: 2 };
            return null;
          },
          async run() { return { success: true }; },
          async all() { return { results: [] }; },
        };
      },
    },
  };
  const { default: worker } = await import(`../worker/index.js?delete=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/field/users/field-officers/officer-a", {
    method: "DELETE",
    headers: { Authorization: "Bearer token" },
  }), env);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /assignment history/i);
});
