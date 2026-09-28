import test from "node:test";
import assert from "node:assert/strict";
import { isSatelliteAnalysisQuestion, satelliteAnalysisAnswer } from "../worker/satellite-analysis.js";

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
