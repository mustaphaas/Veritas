import test from "node:test";
import assert from "node:assert/strict";
import { findProject, isSatelliteAnalysisQuestion, isSatelliteFollowUp, runSatelliteAnalysis, satelliteAnalysisAnswer } from "../worker/satellite-analysis.js";

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

const PROJECTS = [
  { id: "k1", name: "Dutse Mini Grid", state: "Kano", lga: "Dutse", latitude: 12, longitude: 8 },
  { id: "k2", name: "Kura Solar Street Lights", state: "Kano", lga: "Kura", latitude: 12.1, longitude: 8.1 },
  { id: "l1", name: "Ikeja Hybrid", state: "Lagos", lga: "Ikeja", latitude: 6.6, longitude: 3.3 },
];

function fakeEnv() {
  const calls = [];
  const run = (sql, args) => {
    calls.push({ sql, args });
    if (sql.includes("SELECT DISTINCT state")) return { results: [{ state: "Kano" }, { state: "Lagos" }] };
    const wantedState = sql.includes("lower(state)=lower(?)") ? String(args[args.length - 1]).toLowerCase() : null;
    const pool = PROJECTS.filter((row) => !wantedState || row.state.toLowerCase() === wantedState);
    if (sql.includes("SELECT name,state,lga")) return { results: pool };
    const like = args.find((arg) => typeof arg === "string" && arg.startsWith("%"));
    const needle = like ? like.replaceAll("%", "").toLowerCase() : null;
    const hit = pool.filter((row) => !needle || row.name.toLowerCase().includes(needle));
    return { results: hit, first: hit[0] ?? null };
  };
  return {
    calls,
    GEMINI_API_KEY: "test",
    DB: {
      prepare: (sql) => ({
        all: async () => run(sql, []),
        bind: (...args) => ({ first: async () => run(sql, args).first ?? null, all: async () => run(sql, args) }),
      }),
    },
  };
}

test("follow-up detection only continues a pending satellite question", () => {
  const prompt = { role: "assistant", content: "Tell me which project.\n\nWhich project should I run the satellite check on?" };
  const ask = { role: "user", content: "Verify the satellite image for project" };
  assert.equal(isSatelliteFollowUp([ask, prompt, { role: "user", content: "Choose anyone in Kano" }]), true);
  assert.equal(isSatelliteFollowUp([ask, { role: "assistant", content: "Kano has 21 projects." }, { role: "user", content: "Choose anyone in Kano" }]), false);
  assert.equal(isSatelliteFollowUp([{ role: "user", content: "Choose anyone in Kano" }]), false);
});

test("no project named: asks and offers real project names", async () => {
  const result = await findProject(fakeEnv(), "verify the satellite image for project");
  assert.equal(result.needsInput, true);
  assert.match(result.reason, /Dutse Mini Grid/);
  assert.match(result.reason, /Which project should I run the satellite check on\?/);
});

test("'choose anyone in Kano' picks a Kano project, never another state", async () => {
  const result = await findProject(fakeEnv(), "Choose anyone in Kano");
  assert.equal(result.project?.state, "Kano");
});

test("'list available ones' lists projects, filtered by state when named", async () => {
  const all = await findProject(fakeEnv(), "List available ones");
  assert.equal(all.needsInput, true);
  assert.match(all.reason, /Ikeja Hybrid/);
  const kano = await findProject(fakeEnv(), "List the available ones in Kano");
  assert.match(kano.reason, /Kura Solar Street Lights/);
  assert.doesNotMatch(kano.reason, /Ikeja Hybrid/);
});

test("a named project resolves, restricted to the named state", async () => {
  const hit = await findProject(fakeEnv(), "verify the satellite image for Dutse Mini Grid");
  assert.equal(hit.project?.id, "k1");
  const miss = await findProject(fakeEnv(), "verify the satellite image for Ikeja Hybrid in Kano");
  assert.equal(miss.needsInput, true);
  assert.match(miss.reason, /couldn't find a project matching/i);
});

test("chat replies with a prompt when no project is named and does not touch the imagery pipeline", async () => {
  const env = fakeEnv();
  const result = await runSatelliteAnalysis(new Request("https://x.test/api/veritas"), env, "verify the satellite image");
  assert.equal(result.ok, false);
  assert.equal(result.needsInput, true);
});
