import test from "node:test";
import assert from "node:assert/strict";
import { isSatelliteAnalysisQuestion, runSatelliteAnalysis, satelliteAnalysisAnswer } from "../worker/satellite-analysis.js";

test("satellite question routing recognises satellite and imagery requests", () => {
  assert.equal(isSatelliteAnalysisQuestion("Analyse the satellite image for this project"), true);
  assert.equal(isSatelliteAnalysisQuestion("What is the verification rate?"), false);
});

test("satellite answer reports imagery provenance and limitations", () => {
  const answer = satelliteAnalysisAnswer({
    ok: true,
    project: {
      id: "p1",
      name: "Test Mini Grid",
      programme: "NEP",
      component: "Mini Grid",
      state: "Kano",
      lga: "Kano Municipal",
      community: "Test",
      latitude: 12.0,
      longitude: 8.5,
      installedCapacityKw: 100,
      households: 200,
    },
    analysis: {
      imagerySource: "Esri World Imagery",
      imageryDate: null,
      verdict: {
        status: "present",
        imageQuality: "clear",
        confidence: 0.82,
        estimatedNearbyHouses: 17,
        notes: "A developed compound and array-like structures are visible.",
      },
    },
  });
  assert.match(answer, /Test Mini Grid/);
  assert.match(answer, /Esri World Imagery/);
  assert.match(answer, /Infrastructure detected/);
  assert.match(answer, /installed capacity/i);
  assert.match(answer, /operational status/i);
});

test("plain verify/check requests for a project are routed, general questions are not", () => {
  assert.equal(isSatelliteAnalysisQuestion("Verify project Kano Solar Street Lights"), true);
  assert.equal(isSatelliteAnalysisQuestion("can you check the site Dutse mini-grid"), true);
  assert.equal(isSatelliteAnalysisQuestion("How do I verify a project?"), false);
  assert.equal(isSatelliteAnalysisQuestion("How many projects are verified in Kano?"), false);
});

function fakeEnv(rows) {
  const queries = [];
  return {
    queries,
    GEMINI_API_KEY: "test",
    DB: { prepare: (sql) => ({ bind: (...args) => ({ first: async () => { queries.push({ sql, args }); return rows.shift() ?? null; } }) }) },
  };
}

test("chat asks which project when none is named instead of picking one", async () => {
  const env = fakeEnv([]);
  const result = await runSatelliteAnalysis(new Request("https://x.test/api/veritas"), env, "verify the satellite image");
  assert.equal(result.ok, false);
  assert.match(result.reason, /which project/i);
  assert.equal(env.queries.length, 0);
});

test("chat reports an unmatched project name instead of analysing a different project", async () => {
  const env = fakeEnv([]);
  const result = await runSatelliteAnalysis(new Request("https://x.test/api/veritas"), env, "verify the satellite image for Nonexistent Village Grid");
  assert.equal(result.ok, false);
  assert.match(result.reason, /couldn't find a project matching "Nonexistent Village Grid"/i);
});
