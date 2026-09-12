import test from "node:test";
import assert from "node:assert/strict";
import { greetingName, sectionKpiCardSpec } from "./uiDesign.ts";

test("greeting uses the field officer full name", () => {
  assert.equal(greetingName("Mustapha Aliyu"), "Good day, Mustapha Aliyu.");
});

test("section KPI cards share the compact overview visual specification", () => {
  assert.equal(sectionKpiCardSpec.borderRadius, 20);
  assert.equal(sectionKpiCardSpec.centered, true);
  assert.equal(sectionKpiCardSpec.iconDiameter, 40);
});
