import test from "node:test";
import assert from "node:assert/strict";
import {
  isNightLightImpactQuestion,
  isNightLightEligibilityQuestion,
  nightLightImpactAnswer,
  nightLightCardPayload,
  shouldRunNightLightAnalysis,
} from "../worker/nightlight-analysis.js";

test("night-light routing recognises VIIRS and Black Marble questions", () => {
  assert.equal(isNightLightImpactQuestion("Did VIIRS show an increase after this project?"), true);
  assert.equal(isNightLightImpactQuestion("Show the Black Marble impact for Kura"), true);
  assert.equal(isNightLightImpactQuestion("What is the verification rate?"), false);
});

test("night-light answer uses measured values and includes the causation warning", () => {
  const result = {
    ok: true,
    resolvedVia: "name",
    project: {
      id: "p1",
      name: "Kura Mini-Grid",
      programme: "DARES",
      component: "Mini Grid",
      state: "Kano",
      lga: "Kura",
      community: "Kura Town",
    },
    impact: {
      commissioningDate: "2025-05-01",
      dateBasis: "field completion date",
      radiusMetres: 2000,
      baselineRadiance: 0.82,
      afterRadiance: 2.31,
      percentChange: 181.7,
      controlPercentChange: 8.1,
      monthsBefore: 12,
      monthsAfter: 9,
      impactClass: "strong_increase",
      dataQuality: "good",
      sourceName: "NASA VIIRS Black Marble",
      sourceProduct: "VNP46A3.002",
    },
  };
  const answer = nightLightImpactAnswer(result);
  assert.match(answer, /Kura Mini-Grid/);
  assert.match(answer, /0\.82/);
  assert.match(answer, /2\.31/);
  assert.match(answer, /\+181\.7%/);
  assert.match(answer, /not proof that the project alone caused/i);

  const card = nightLightCardPayload(result);
  assert.equal(card.project.id, "p1");
  assert.equal(card.impact.impactClass, "strong_increase");
});


test("a satellite picker projectId does not hijack into VIIRS without night-light wording", async () => {
  const env = { DB: { prepare: () => { throw new Error("should not touch DB"); } } };
  assert.equal(
    await shouldRunNightLightAnalysis(env, "Verify Kura Mini-Grid by satellite imagery.", { projectId: "p1" }),
    false,
  );
});


test("VIIRS eligibility questions are detected deterministically", () => {
  assert.equal(
    isNightLightEligibilityQuestion("Which projects have GPS coordinates and are eligible for NASA VIIRS night-time light analysis?"),
    true,
  );
  assert.equal(
    isNightLightEligibilityQuestion("Analyse the NASA VIIRS night-time light impact for Kura Mini-Grid."),
    false,
  );
});


test("Gbamu-Gbamu night-light question resolves as one project, not Nasarawa candidates", async () => {
  // Covered by shared satellite resolver; this assertion guards night-light routing
  // against reintroducing generic/prefix candidate matching.
  assert.equal(
    isNightLightImpactQuestion("Did the Gbamu-Gbamu Mini-Grid have a measurable night-time lighting impact according to NASA VIIRS?"),
    true,
  );
});


test("stored commissioned_at makes a VIIRS project ready even without a field report", async () => {
  const project = {
    id: "EXT-VIIRS-OGUN-GBAMU-001",
    name: "Gbamu-Gbamu Mini-Grid (External VIIRS Demo)",
    programme: "Others",
    component: "Mini Grid",
    state: "Ogun",
    lga: "Ijebu East",
    community: "Gbamu-Gbamu",
    latitude: 6.84746,
    longitude: 4.21247,
    commissionedAt: "2018-02-01",
  };

  const env = {
    DB: {
      prepare(sql) {
        if (/FROM projects/.test(sql) && /latitude IS NOT NULL/.test(sql)) {
          return {
            all: async () => ({ results: [project] }),
            bind: () => ({ first: async () => project }),
          };
        }
        if (/FROM project_nightlight_impacts/.test(sql)) {
          return { bind: () => ({ first: async () => null }) };
        }
        if (/FROM assignments/.test(sql)) {
          return { bind: () => ({ first: async () => null }) };
        }
        return {
          all: async () => ({ results: [] }),
          bind: () => ({ first: async () => null }),
        };
      },
    },
  };

  const { runNightLightAnalysis } = await import("../worker/nightlight-analysis.js");
  const result = await runNightLightAnalysis(
    new Request("https://veritas.test/api/veritas", { method: "POST" }),
    env,
    "Did the Gbamu-Gbamu Mini-Grid have a measurable night-time lighting impact according to NASA VIIRS?",
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "not_ready");
  assert.match(result.reason, /recorded completion date/);
  assert.match(result.reason, /has not been processed yet/);
  assert.doesNotMatch(result.reason, /no reliable completion\/commissioning month is recorded/i);
});


test("project-specific VIIRS question prefers the uniquely matching processed project", async () => {
  const processedProject = {
    id: "EXT-VIIRS-OGUN-GBAMU-001",
    name: "Gbamu-Gbamu Mini-Grid (External VIIRS Demo)",
    programme: "Others",
    component: "Mini Grid",
    state: "Ogun",
    lga: "Ijebu East",
    community: "Gbamu-Gbamu",
    latitude: 6.84746,
    longitude: 4.21247,
    commissionedAt: "2018-02-01",
  };
  const competingProject = {
    ...processedProject,
    id: "GBAMU-LEGACY-001",
    name: "Gbamu-Gbamu Mini-Grid",
  };
  const impactRow = {
    projectId: processedProject.id,
    commissioningDate: "2018-02-01",
    dateBasis: "field completion date",
    radiusMetres: 2000,
    controlInnerMetres: 3000,
    controlOuterMetres: 5000,
    beforeStart: "2017-02-01",
    beforeEnd: "2018-01-01",
    afterStart: "2018-03-01",
    afterEnd: "2019-02-01",
    baselineRadiance: 1,
    afterRadiance: 2,
    radianceDelta: 1,
    percentChange: 100,
    controlBaselineRadiance: 1,
    controlAfterRadiance: 1.1,
    controlPercentChange: 10,
    differentialPercentagePoints: 90,
    monthsBefore: 12,
    monthsAfter: 12,
    impactClass: "strong_increase",
    dataQuality: "good",
    seriesJson: "[]",
    beforeGridJson: null,
    afterGridJson: null,
    sourceProduct: "VNP46A3.002",
    sourceName: "NASA VIIRS Black Marble",
    sourceUrl: "https://example.test",
    analysisMethod: "monthly-median-v1",
    checkedAt: "2026-10-01T03:18:00Z",
  };

  const env = {
    DB: {
      prepare(sql) {
        if (/INNER JOIN project_nightlight_impacts/.test(sql)) {
          return { all: async () => ({ results: [processedProject] }) };
        }
        if (/FROM projects/.test(sql) && /latitude IS NOT NULL/.test(sql)) {
          return {
            all: async () => ({ results: [competingProject, processedProject] }),
            bind: () => ({ first: async () => competingProject }),
          };
        }
        if (/FROM project_nightlight_impacts WHERE project_id=\?/.test(sql)) {
          return { bind: () => ({ first: async () => impactRow }) };
        }
        if (/FROM assignments/.test(sql)) {
          return { bind: () => ({ first: async () => null }) };
        }
        return {
          all: async () => ({ results: [] }),
          bind: () => ({ first: async () => null }),
        };
      },
    },
  };

  const { runNightLightAnalysis } = await import("../worker/nightlight-analysis.js");
  const result = await runNightLightAnalysis(
    new Request("https://veritas.test/api/veritas", { method: "POST" }),
    env,
    "Did the Gbamu-Gbamu Mini-Grid have a measurable night-time lighting impact according to NASA VIIRS?",
  );

  assert.equal(result.ok, true);
  assert.equal(result.project.id, processedProject.id);
  assert.equal(result.impact.percentChange, 100);
});
