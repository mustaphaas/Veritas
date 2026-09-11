import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.js";

function dbFor(role = "rea_admin") {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("FROM sessions")) return { id: "u1", name: "REA Admin", role, consultantFirm: null };
          return null;
        },
        async all() {
          if (sql.includes("FROM projects")) return { results: [{ id: "FCT-MG-DURUMI-001", name: "Durumi Solar Mini Grid Demo", programme: "DARES", component: "Mini Grid", contractor: "Veritas Demo Contractor", consultantFirm: "Supreme Way", state: "FCT", lga: "Abuja Municipal Area Council", community: "Durumi", reportingMonth: "2026-09", status: "In progress", installedCapacityKw: 100, households: 200, verified: 0, latitude: 9.0232043, longitude: 7.4518017, geofenceRadiusMetres: 250, dataSource: "demo-dashboard", updatedAt: "2026-09-11T00:00:00Z" }] };
          return { results: [] };
        },
      };
    },
  };
}

const assets = { fetch: async () => new Response("asset", { status: 200 }) };

test("REA projects route requires authentication", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/rea/projects"), { DB: dbFor(), ASSETS: assets });
  assert.equal(response.status, 401);
});

test("REA projects route rejects non-REA users", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/rea/projects", { headers: { Authorization: "Bearer token" } }), { DB: dbFor("consultant_admin"), ASSETS: assets });
  assert.equal(response.status, 403);
});

test("REA projects route returns exact D1 coordinates", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/rea/projects", { headers: { Authorization: "Bearer token" } }), { DB: dbFor(), ASSETS: assets });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.projects[0].latitude, 9.0232043);
  assert.equal(body.projects[0].longitude, 7.4518017);
  assert.equal(body.projects[0].geofenceRadiusMetres, 250);
});
