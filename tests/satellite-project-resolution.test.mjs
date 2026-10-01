import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSearchTokens,
  rankProjects,
  resolveSatelliteProject,
  runSatelliteAnalysis,
  satelliteCardPayload,
} from "../worker/satellite-analysis.js";

const PROJECTS = [
  { id: "REA-NEP-0101", name: "Dutse Solar Street Light Phase 1", component: "Solar Street Light", programme: "NEP", state: "Jigawa", lga: "Dutse", community: "Dutse Central", latitude: 11.7, longitude: 9.3 },
  { id: "REA-NEP-0102", name: "Dutse Solar Street Light Phase 2", component: "Solar Street Light", programme: "NEP", state: "Jigawa", lga: "Dutse", community: "Limawa", latitude: 11.71, longitude: 9.31 },
  { id: "REA-DARES-0201", name: "Kura Mini-Grid", component: "Mini Grid", programme: "DARES", state: "Kano", lga: "Kura", community: "Kura Town", latitude: 11.77, longitude: 8.42 },
  { id: "REA-DARES-0202", name: "Gwarzo Standalone Solar", component: "Standalone Solar", programme: "DARES", state: "Kano", lga: "Gwarzo", community: "Gwarzo", latitude: 12.25, longitude: 7.93 },
];

// Minimal D1 stand-in: .all() returns every mappable row, .first() looks up by id.
function fakeEnv(rows = PROJECTS) {
  return {
    GEMINI_API_KEY: "test",
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => ({
            first: async () => rows.find((row) => row.id === args[0]) || null,
            all: async () => ({ results: rows }),
          }),
          all: async () => ({ results: rows }),
        };
      },
    },
  };
}

test("search tokens drop instruction words and keep the place words", () => {
  assert.deepEqual(extractSearchTokens("Please verify the satellite imagery of Kura mini grid"), ["kura", "mini", "grid"]);
  assert.deepEqual(extractSearchTokens("verify this project"), []);
});

test("a single clear name match resolves without a picker", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "check satellite imagery for the Kura mini grid");
  assert.equal(result.status, "resolved");
  assert.equal(result.project.id, "REA-DARES-0201");
  assert.equal(result.via, "name");
});

test("tied matches return candidates instead of guessing", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "verify Dutse solar street light by satellite");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates.map((c) => c.id).sort(), ["REA-NEP-0101", "REA-NEP-0102"]);
});

test("an id written in the message resolves exactly, even among lookalike names", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "satellite check rea-nep-0102 please");
  assert.equal(result.status, "resolved");
  assert.equal(result.project.id, "REA-NEP-0102");
  assert.equal(result.via, "id");
});

test("picker selection wins over whatever the message says", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "verify Dutse solar street light by satellite", { projectId: "REA-NEP-0102" });
  assert.equal(result.status, "resolved");
  assert.equal(result.project.id, "REA-NEP-0102");
  assert.equal(result.via, "selection");
});

test("a message naming nothing uses the open map pin, and asks when there is none", async () => {
  const withPin = await resolveSatelliteProject(fakeEnv(), "verify this project by satellite", { mapProjectId: "REA-DARES-0202" });
  assert.equal(withPin.status, "resolved");
  assert.equal(withPin.via, "map");

  const withoutPin = await resolveSatelliteProject(fakeEnv(), "verify this project by satellite");
  assert.equal(withoutPin.status, "none");
});

test("a named project beats a stale map pin", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "satellite check Kura mini grid", { mapProjectId: "REA-DARES-0202" });
  assert.equal(result.project.id, "REA-DARES-0201");
});

test("there is no silent fallback to an arbitrary project", async () => {
  const result = await resolveSatelliteProject(fakeEnv(), "satellite imagery for Zamfara water pumping");
  assert.equal(result.status, "none");
});

test("weak partial matches are offered as choices, not resolved", () => {
  const ranked = rankProjects(PROJECTS, ["kura", "zamfara", "borehole"]);
  assert.equal(ranked[0].row.id, "REA-DARES-0201");
  assert.ok(ranked[0].matched / 3 < 0.5);
});

test("runSatelliteAnalysis surfaces the picker without calling imagery or the model", async () => {
  const result = await runSatelliteAnalysis(
    new Request("https://veritas.test/api/veritas", { method: "POST" }),
    fakeEnv(),
    "verify Dutse solar street light by satellite",
  );
  assert.equal(result.ok, false);
  assert.equal(result.kind, "choose");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every((c) => c.id && c.name));
});

test("card payload keeps degraded imagery visible and never invents numbers", () => {
  const card = satelliteCardPayload({
    project: PROJECTS[2],
    resolvedVia: "name",
    analysis: {
      imageUrl: "https://example.test/img.png",
      checkedAt: "2026-09-28T12:00:00.000Z",
      radiusMetres: 150,
      verdict: { status: "inconclusive", imageQuality: "unusable", confidence: null, estimatedNearbyHouses: null, notes: "Cloud cover." },
    },
  });
  assert.equal(card.verdict.status, "inconclusive");
  assert.equal(card.verdict.imageQuality, "unusable");
  assert.equal(card.verdict.confidence, null);
  assert.equal(card.verdict.estimatedNearbyHouses, null);
  assert.equal(card.project.name, "Kura Mini-Grid");
});

import { isPortfolioAggregateQuestion, shouldRunSatelliteAnalysis, satelliteAnalysisAnswer } from "../worker/satellite-analysis.js";
import { analyticsCatalog, validateAnalyticsPlan, compileAnalyticsPlan, formatAnalyticsAnswer } from "../worker/analytics.js";

test("portfolio counts are not answered with one site's imagery", async () => {
  const env = fakeEnv();
  // The reported failure: a count question that merely mentions the satellite map.
  assert.equal(await shouldRunSatelliteAnalysis(env, "How many mini grid are on satellite image map", {}), false);
  assert.equal(await shouldRunSatelliteAnalysis(env, "how many projects have satellite imagery", {}), false);
  assert.equal(isPortfolioAggregateQuestion("How many mini grid are on satellite image map"), true);
});

test("a satellite request about one named project still runs, even when phrased as a count", async () => {
  const env = fakeEnv();
  assert.equal(await shouldRunSatelliteAnalysis(env, "check satellite imagery for the Kura mini grid", {}), true);
  assert.equal(await shouldRunSatelliteAnalysis(env, "how many rooftops in the satellite image around Kura mini grid", {}), true);
});

test("a picker choice runs regardless of wording, and non-satellite questions never do", async () => {
  const env = fakeEnv();
  assert.equal(await shouldRunSatelliteAnalysis(env, "anything", { projectId: "REA-DARES-0201" }), true);
  assert.equal(await shouldRunSatelliteAnalysis(env, "What is the verification rate?", {}), false);
});

test("an open map pin alone does not turn a portfolio count into a site check", async () => {
  const env = fakeEnv();
  assert.equal(
    await shouldRunSatelliteAnalysis(env, "how many mini grid are on the satellite map", { mapProjectId: "REA-DARES-0202" }),
    false,
  );
});

test("a database failure while deciding falls back to analytics, not to a wrong site", async () => {
  const broken = { DB: { prepare: () => { throw new Error("D1 down"); } } };
  assert.equal(await shouldRunSatelliteAnalysis(broken, "how many mini grid are on the satellite map", {}), false);
});

test("the answer states what the satellite pass did not check", () => {
  const answer = satelliteAnalysisAnswer({
    ok: true,
    project: { id: "p", name: "Abia Grid Extension Project 03", programme: "AMP", component: "Grid Extension" },
    analysis: { verdict: { status: "inconclusive", imageQuality: "clear", confidence: null, estimatedNearbyHouses: 12, notes: "" } },
  });
  assert.match(answer, /nothing beyond the claimed component's signature was assessed/);
  assert.match(answer, /has not been checked/);
  assert.doesNotMatch(answer, /^- \*\*/m, "the answer is prose, not a fact sheet");
});

test("analytics can answer 'on the map' and satellite-status counts exactly", () => {
  const catalog = analyticsCatalog();
  assert.ok(catalog.projects.dimensions.includes("onMap"));
  assert.ok(catalog.projects.dimensions.includes("satelliteStatus"));
  assert.ok(catalog.projects.measures.includes("mappedProjects"));
  const plan = validateAnalyticsPlan({
    mode: "analytics",
    dataset: "projects",
    dimensions: ["satelliteStatus"],
    measures: ["projectCount", "mappedProjects"],
    filters: [{ field: "component", op: "contains", value: "mini" }],
  });
  assert.ok(plan);
  const { sql } = compileAnalyticsPlan(plan);
  assert.match(sql, /satellite_verification_status/);
  assert.match(sql, /latitude IS NOT NULL/);
  assert.match(sql, /LIKE LOWER\(\?\)/);
});

test("exact analytics answers read as findings, with the database's own numbers", () => {
  const single = formatAnalyticsAnswer({ rows: [{ projectCount: 1284, mappedProjects: 1190 }], truncated: false });
  assert.match(single, /\*\*Projects:\*\* 1,284/);
  assert.match(single, /\*\*On the map:\*\* 1,190/);
  assert.doesNotMatch(single, /Authoritative Veritas production database result/);

  const grouped = formatAnalyticsAnswer({ rows: [{ state: "Kano", projectCount: 40 }, { state: "Jigawa", projectCount: 25 }], truncated: true });
  assert.match(grouped, /Across 2 groups/);
  assert.match(grouped, /- \*\*Kano\*\*: Projects 40/);
  assert.match(grouped, /row limit/);

  assert.match(formatAnalyticsAnswer({ rows: [] }), /Nothing in the live production data matches/);
});


test("nonexistent Kura does not fall back to unrelated mini-grid projects", async () => {
  const withoutKura = PROJECTS.filter((project) => project.id !== "REA-DARES-0201");
  const result = await resolveSatelliteProject(
    fakeEnv(withoutKura),
    "Did the Kura Mini-Grid have a measurable electrification impact?",
  );
  assert.equal(result.status, "none");
});

test("generic mini-grid wording alone cannot produce arbitrary project candidates", async () => {
  const result = await resolveSatelliteProject(
    fakeEnv(PROJECTS.filter((project) => project.id !== "REA-DARES-0201")),
    "Did the Mini-Grid have a measurable electrification impact?",
  );
  assert.equal(result.status, "none");
});


test("NASA wording never makes Nasarawa a candidate for Gbamu-Gbamu", async () => {
  const rows = [
    ...PROJECTS,
    { id: "EXT-VIIRS-OGUN-GBAMU-001", name: "Gbamu-Gbamu Mini-Grid (External VIIRS Demo)", component: "Mini Grid", programme: "Others", state: "Ogun", lga: "Ijebu East", community: "Gbamu-Gbamu", latitude: 6.84746, longitude: 4.21247 },
    { id: "DEMO-NASARAWA-005", name: "Nasarawa Grid Extension Project 05", component: "Grid Extension", programme: "Others", state: "Nasarawa", lga: "Nasarawa Central", community: "Nasarawa Community 5", latitude: 8.49, longitude: 8.51 },
    { id: "DEMO-NASARAWA-011", name: "Nasarawa Mini Grid Project 11", component: "Mini Grid", programme: "Others", state: "Nasarawa", lga: "Nasarawa Central", community: "Nasarawa Community 11", latitude: 8.50, longitude: 8.52 },
  ];
  const result = await resolveSatelliteProject(
    fakeEnv(rows),
    "Did the Gbamu-Gbamu Mini-Grid have a measurable night-time lighting impact according to NASA VIIRS?",
  );
  assert.equal(result.status, "resolved");
  assert.equal(result.project.id, "EXT-VIIRS-OGUN-GBAMU-001");
  assert.equal(result.via, "name");
});

test("project matching uses exact identity tokens, not prefixes", async () => {
  const rows = [
    { id: "DEMO-NASARAWA-001", name: "Nasarawa Mini Grid Project 01", component: "Mini Grid", programme: "Others", state: "Nasarawa", lga: "Nasarawa Central", community: "Nasarawa Community 1", latitude: 8.49, longitude: 8.51 },
  ];
  const result = await resolveSatelliteProject(fakeEnv(rows), "NASA VIIRS impact for a mini grid");
  assert.equal(result.status, "none");
});
