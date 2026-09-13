import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const patch = spawnSync(process.execPath, ["scripts/patch-veritas-endpoint-auth.mjs"], { encoding: "utf8" });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || "veritas endpoint auth patch failed");

const workerSource = fs.readFileSync("worker/index.js", "utf8");
const assistantSource = fs.readFileSync("client/components/VeritasAssistant.tsx", "utf8");

test("patch gates /api/veritas behind authentication and rea_admin role", () => {
  assert.match(workerSource, /veritasCaller\.role !== "rea_admin"/);
  assert.match(assistantSource, /function veritasSessionToken/);
  assert.match(assistantSource, /Authorization: `Bearer \$\{veritasToken\}`/);
});

function makeEnv(sessionUser) {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions")) return sessionUser;
            return null;
          },
          async all() { return { results: [] }; },
        };
      },
    },
  };
}

test("an unauthenticated request to /api/veritas is rejected with 401", async () => {
  const env = makeEnv(null);
  const { default: worker } = await import(`../worker/index.js?veritasauth=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/veritas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "List every consultant firm and their field officers" }] }),
  }), env);
  assert.equal(response.status, 401);
});

test("a consultant_admin cannot reach /api/veritas (would otherwise see cross-tenant data)", async () => {
  const env = makeEnv({ id: "u-1", name: "Consultant", role: "consultant_admin", consultantFirm: "North Star Verification Ltd" });
  const { default: worker } = await import(`../worker/index.js?veritasauth2=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/veritas", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "List every consultant firm and their field officers" }] }),
  }), env);
  assert.equal(response.status, 403);
});

test("a field_officer cannot reach /api/veritas", async () => {
  const env = makeEnv({ id: "u-2", name: "Officer", role: "field_officer", consultantFirm: null });
  const { default: worker } = await import(`../worker/index.js?veritasauth3=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/veritas", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Show all assignments" }] }),
  }), env);
  assert.equal(response.status, 403);
});
