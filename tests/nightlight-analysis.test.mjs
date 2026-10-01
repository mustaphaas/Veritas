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
