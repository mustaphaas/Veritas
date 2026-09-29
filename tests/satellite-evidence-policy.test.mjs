import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEvidencePolicy,
  assessHouseEstimate,
  classifyComponent,
} from "../worker/satellite-evidence-policy.js";
import { parseVerdict, verificationPrompt } from "../worker/satellite-verify.js";
import { satelliteAnalysisAnswer, satelliteCardPayload } from "../worker/satellite-analysis.js";

const verdict = (over = {}) => ({
  status: "present",
  imageQuality: "clear",
  confidence: 0.85,
  estimatedNearbyHouses: 40,
  notes: "Panels visible.",
  evidenceLocation: "at_project_point",
  signatureStrength: "strong",
  ...over,
});
const project = (component, extra = {}) => ({ programme: "NEP", component, households: 60, ...extra });

test("component names from the seed data classify correctly", () => {
  assert.equal(classifyComponent("NEP", "Solar Home System"), "distributed");
  assert.equal(classifyComponent("DARES", "Standalone Solar"), "distributed");
  assert.equal(classifyComponent("NEP", "Mini Grid"), "mini_grid");
  assert.equal(classifyComponent("NEP", "Mini-Grid"), "mini_grid");
  assert.equal(classifyComponent("NEP", "Solar Street Light"), "street_light");
  assert.equal(classifyComponent("NEP", "Grid Extension"), "grid_extension");
  assert.equal(classifyComponent("NEP", "Water Pumping"), "unknown");
});

test("the reported case: household systems in a town never come back as 'detected, 85%'", () => {
  const result = applyEvidencePolicy(
    verdict({ status: "present", confidence: 0.85, estimatedNearbyHouses: 220, evidenceLocation: "elsewhere_in_frame" }),
    project("Solar Home System"),
    150,
  );
  assert.equal(result.status, "inconclusive");
  assert.equal(result.confidence, null);
  assert.equal(result.modelStatus, "present");
  assert.equal(result.limitation.code, "distributed_systems");
  assert.equal(result.evidenceClass, "settlement_only");
  assert.match(result.houseEstimateNote, /220 rooftops.*60 households/);
});

test("distributed systems stay unverifiable even if the model claims the panel is at the point", () => {
  const result = applyEvidencePolicy(verdict({ evidenceLocation: "at_project_point" }), project("Standalone Solar"), 150);
  assert.equal(result.status, "inconclusive");
  assert.equal(result.limitation.code, "distributed_systems");
});

test("a mini-grid with equipment at the centre keeps its verdict and confidence", () => {
  const result = applyEvidencePolicy(verdict({ estimatedNearbyHouses: 55 }), project("Mini Grid", { households: 60 }), 150);
  assert.equal(result.status, "present");
  assert.equal(result.confidence, 0.85);
  assert.equal(result.limitation, null);
  assert.equal(result.houseEstimateNote, null);
});

test("solar elsewhere in the frame cannot confirm a mini-grid", () => {
  const result = applyEvidencePolicy(verdict({ evidenceLocation: "elsewhere_in_frame" }), project("Mini Grid"), 150);
  assert.equal(result.status, "inconclusive");
  assert.equal(result.limitation.code, "evidence_elsewhere");
  assert.equal(result.confidence, null);
});

test("a missing or contradictory location never confirms presence", () => {
  const { evidenceLocation, ...unlocated } = verdict();
  for (const input of [unlocated, verdict({ evidenceLocation: "none" })]) {
    const result = applyEvidencePolicy(input, project("Mini Grid"), 150);
    assert.equal(result.status, "inconclusive");
    assert.equal(result.limitation.code, "evidence_unattributed");
  }
});

test("street-light confidence is capped and grid-extension absence is never asserted", () => {
  const light = applyEvidencePolicy(verdict({ confidence: 0.95 }), project("Solar Street Light"), 150);
  assert.equal(light.status, "present");
  assert.equal(light.confidence, 0.75);

  const line = applyEvidencePolicy(verdict({ status: "absent", confidence: 0.9, evidenceLocation: "none", signatureStrength: "none" }), project("Grid Extension"), 150);
  assert.equal(line.status, "inconclusive");
  assert.equal(line.limitation.code, "weak_signature");
  assert.match(line.limitation.message, /not proof that the line is missing/);

  const linePresent = applyEvidencePolicy(verdict({ confidence: 0.95 }), project("Grid Extension"), 150);
  assert.equal(linePresent.status, "present");
  assert.equal(linePresent.confidence, 0.75);
});

test("a grid extension needs visible pole lines: a cleared corridor alone is not a line", () => {
  const corridor = applyEvidencePolicy(
    verdict({ status: "present", confidence: 0.85, signatureStrength: "partial" }),
    project("Grid Extension"),
    400,
  );
  assert.equal(corridor.status, "inconclusive");
  assert.equal(corridor.confidence, null);
  assert.equal(corridor.limitation.code, "signature_partial");
  assert.match(corridor.limitation.message, /cleared corridor alone does not establish a line/);
  assert.match(corridor.limitation.message, /poles or conductors/);
  assert.equal(corridor.modelStatus, "present");

  const poles = applyEvidencePolicy(verdict({ signatureStrength: "strong" }), project("Grid Extension"), 400);
  assert.equal(poles.status, "present");
  assert.equal(poles.limitation, null);
});

test("a mini-grid needs a large block of panels, not a few", () => {
  const few = applyEvidencePolicy(verdict({ signatureStrength: "partial" }), project("Mini Grid"), 150);
  assert.equal(few.status, "inconclusive");
  assert.equal(few.limitation.code, "signature_partial");
  assert.match(few.limitation.message, /large block of panels/);

  const block = applyEvidencePolicy(verdict({ signatureStrength: "strong" }), project("Mini Grid"), 150);
  assert.equal(block.status, "present");
  assert.equal(block.confidence, 0.85);
});

test("a missing signature grade never confirms presence, and partial signs never support 'absent'", () => {
  const { signatureStrength, ...ungraded } = verdict();
  assert.equal(applyEvidencePolicy(ungraded, project("Mini Grid"), 150).status, "inconclusive");
  const partialAbsent = applyEvidencePolicy(verdict({ status: "absent", evidenceLocation: "none", signatureStrength: "partial" }), project("Mini Grid"), 150);
  assert.equal(partialAbsent.status, "inconclusive");
  assert.equal(partialAbsent.limitation.code, "signature_partial");
});

test("unusable imagery keeps image quality as the only stated reason", () => {
  const result = applyEvidencePolicy(
    { ...verdict({ status: "inconclusive", imageQuality: "unusable", confidence: 0.2 }), evidenceLocation: undefined },
    project("Mini Grid"),
    150,
  );
  assert.equal(result.status, "inconclusive");
  assert.equal(result.limitation, null);
});

test("a definite absence at a mini-grid survives, since a fenced array is distinctive", () => {
  const result = applyEvidencePolicy(verdict({ status: "absent", evidenceLocation: "none", signatureStrength: "none", confidence: 0.8 }), project("Mini Grid"), 150);
  assert.equal(result.status, "absent");
  assert.equal(result.confidence, 0.8);
});

test("policy does not mutate its input", () => {
  const input = verdict({ evidenceLocation: "elsewhere_in_frame" });
  const snapshot = JSON.stringify(input);
  applyEvidencePolicy(input, project("Mini Grid"), 150);
  assert.equal(JSON.stringify(input), snapshot);
});

test("house estimate: impossible counts are discarded, mismatches are noted, plausible counts pass", () => {
  // 150 m radius = 300 m x 300 m = 90,000 m2, so the ceiling is 1,800.
  assert.equal(assessHouseEstimate({ estimate: 220, households: 0, radiusMetres: 150 }).note, null);
  const impossible = assessHouseEstimate({ estimate: 5000, households: 100, radiusMetres: 150 });
  assert.equal(impossible.estimate, null);
  assert.equal(impossible.discarded, true);
  assert.match(assessHouseEstimate({ estimate: 20, households: 500, radiusMetres: 150 }).note, /only part of the served area/);
  assert.equal(assessHouseEstimate({ estimate: 90, households: 100, radiusMetres: 150 }).note, null);
  assert.equal(assessHouseEstimate({ estimate: null, households: 100, radiusMetres: 150 }).estimate, null);
});

test("parseVerdict keeps a valid evidenceLocation and omits an invalid one", () => {
  const good = parseVerdict('{"infrastructureDetected":"present","evidenceLocation":"at_project_point","signatureStrength":"strong","imageQuality":"clear","confidence":0.7,"estimatedNearbyHouses":3,"notes":""}');
  assert.equal(good.evidenceLocation, "at_project_point");
  assert.equal(good.signatureStrength, "strong");
  const bad = parseVerdict('{"infrastructureDetected":"present","evidenceLocation":"somewhere","imageQuality":"clear","confidence":0.7,"estimatedNearbyHouses":3,"notes":""}');
  assert.equal("evidenceLocation" in bad, false);
});

test("the prompt defines each component's signature in reviewer terms", () => {
  const line = verificationPrompt({ name: "A", programme: "AMP", component: "Grid Extension", community: "c", lga: "l", state: "s" }, 400);
  assert.match(line, /A cleared corridor through vegetation shows a way-leave and is NOT a line on its own/);
  assert.match(line, /signatureStrength to "strong" only if you can see that within about 67 m/);
  const mini = verificationPrompt({ name: "B", programme: "NEP", component: "Mini Grid", community: "c", lga: "l", state: "s" }, 150);
  assert.match(mini, /large contiguous block of solar panels/);
});

test("the prompt demands attribution to the centre and, for household systems, forbids judging presence", () => {
  const mini = verificationPrompt({ name: "A", programme: "NEP", component: "Mini Grid", community: "c", lga: "l", state: "s" }, 150);
  assert.match(mini, /within about 25 m of the image centre/);
  assert.doesNotMatch(mini, /COMPONENT LIMIT/);
  const shs = verificationPrompt({ name: "B", programme: "NEP", component: "Solar Home System", community: "c", lga: "l", state: "s" }, 150);
  assert.match(shs, /COMPONENT LIMIT/);
  assert.match(shs, /Do NOT judge whether this project's systems are present/);
});

test("chat markdown and card payload carry the limitation, not a bare verdict", () => {
  const applied = applyEvidencePolicy(verdict({ estimatedNearbyHouses: 220, evidenceLocation: "elsewhere_in_frame" }), project("Solar Home System"), 150);
  const result = {
    ok: true,
    resolvedVia: "name",
    project: { id: "p", name: "Solar Home System Project 06", programme: "NEP", component: "Solar Home System", state: "Niger", lga: "", community: "Niger Community 6", latitude: 9, longitude: 6, installedCapacityKw: 0, households: 60 },
    analysis: { verdict: applied, imagerySource: "Esri World Imagery", radiusMetres: 150 },
  };
  const answer = satelliteAnalysisAnswer(result);
  assert.match(answer, /Not verifiable from imagery/);
  assert.match(answer, /Household-scale systems cannot be confirmed/);
  assert.doesNotMatch(answer, /Infrastructure detected/);
  const card = satelliteCardPayload(result);
  assert.equal(card.verdict.limitation.code, "distributed_systems");
  assert.equal(card.verdict.confidence, null);
});
