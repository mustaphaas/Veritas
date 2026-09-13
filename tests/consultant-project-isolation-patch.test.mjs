import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const patch = spawnSync(process.execPath, ["scripts/patch-consultant-project-isolation.mjs"], { encoding: "utf8" });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || "consultant project isolation patch failed");

const workerSource = fs.readFileSync("worker/index.js", "utf8");
const apiSource = fs.readFileSync("client/lib/field-api.ts", "utf8");
const portfolioSource = fs.readFileSync("client/lib/use-consultant-portfolio.ts", "utf8");

test("patch installs a server-scoped consultant projects endpoint and client wiring", () => {
  assert.match(workerSource, /async function consultantProjectsResponse/);
  assert.match(workerSource, /"\/api\/consultant\/projects"/);
  assert.match(apiSource, /fetchConsultantProjects/);
  assert.match(portfolioSource, /fetchConsultantProjects/);
  assert.match(portfolioSource, /fetchFieldAssignments/);
});

test("consultant projects endpoint only returns rows for the caller's own firm", async () => {
  const insertedFirms = [];
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        const state = { args: [] };
        return {
          bind(...args) { state.args = args; return this; },
          async first() {
            if (sql.includes("FROM sessions")) {
              return { id: "consultant-1", name: "Amina Bello", role: "consultant_admin", consultantFirm: "North Star Verification Ltd" };
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM projects WHERE consultant_firm=?")) {
              insertedFirms.push(state.args[0]);
              // Simulate D1 already filtering by the bound consultant_firm.
              const rows = [
                { id: "p-1", name: "Kano Mini Grid 04", programme: "DARES", component: "Mini Grid", contractor: "Acme", consultantFirm: "North Star Verification Ltd", state: "Kano", lga: "Nasarawa", community: "Zango", reportingMonth: "August 2026", status: "Verified", installedCapacityKw: 120, households: 300, verified: 1, latitude: 12.0, longitude: 8.5, geofenceRadiusMetres: 250, dataSource: "field", updatedAt: "2026-09-01T00:00:00.000Z" },
              ];
              return { results: rows };
            }
            return { results: [] };
          },
          async run() { return { success: true }; },
        };
      },
    },
  };

  const { default: worker } = await import(`../worker/index.js?isolation=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/consultant/projects", {
    headers: { Authorization: "Bearer token" },
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.consultantFirm, "North Star Verification Ltd");
  assert.ok(payload.projects.every((project) => project.consultantFirm === "North Star Verification Ltd"));
  // The query itself must be bound to the caller's own firm, not a
  // client-supplied value -- this is what makes the isolation server-side.
  assert.deepEqual(insertedFirms, ["North Star Verification Ltd"]);
});

test("a consultant_admin cannot read another firm's projects by passing a query override", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        const state = { args: [] };
        return {
          bind(...args) { state.args = args; return this; },
          async first() {
            if (sql.includes("FROM sessions")) {
              return { id: "consultant-1", name: "Amina Bello", role: "consultant_admin", consultantFirm: "North Star Verification Ltd" };
            }
            return null;
          },
          async all() { return { results: [] }; },
        };
      },
    },
  };
  const { default: worker } = await import(`../worker/index.js?isolation2=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/consultant/projects?consultantFirm=Rival+Firm", {
    headers: { Authorization: "Bearer token" },
  }), env);
  const payload = await response.json();
  // consultant_admin's own firm always wins; the query override only applies to rea_admin.
  assert.equal(payload.consultantFirm, "North Star Verification Ltd");
});
