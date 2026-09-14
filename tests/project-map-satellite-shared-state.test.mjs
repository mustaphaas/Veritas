import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("client/components/ProjectMapSatelliteEnhancer.tsx", "utf8");
const programmeSource = fs.readFileSync("client/components/ReaProjectMapProgramme.tsx", "utf8");

test("satellite map mirrors Project Map filters and layer toggles", () => {
  assert.match(source, /Search project ID or name/);
  assert.match(source, /All Programmes/);
  assert.match(source, /All States/);
  assert.match(source, /All LGAs/);
  assert.match(source, /layers\.Projects/);
  assert.match(source, /layers\.Status/);
  assert.match(source, /MutationObserver/);
});

test("satellite map dims everything outside Nigeria", () => {
  assert.match(source, /nigeria-adm1\.geojson/);
  assert.match(source, /fillRule:\s*["']evenodd["']/);
  assert.match(source, /fillOpacity:\s*0\.[45-8]/);
  assert.match(source, /setMaxBounds|maxBounds/);
});

test("satellite map does not render portfolio summary badges", () => {
  assert.doesNotMatch(source, /\{filteredProjects\.length\.toLocaleString\(\)\} Projects/);
  assert.doesNotMatch(source, /\{verifiedCount\.toLocaleString\(\)\} Verified/);
  assert.doesNotMatch(source, /\{\(capacityKw \/ 1000\)\.toFixed\(1\)\} MW/);
  assert.doesNotMatch(source, /\{households\.toLocaleString\(\)\} Households/);
});

test("underlying project map does not render grey portfolio summary badges", () => {
  assert.doesNotMatch(programmeSource, /\{displayMetrics\.projects\.toLocaleString\(\)\} Projects/);
  assert.doesNotMatch(programmeSource, /\{displayMetrics\.verified\.toLocaleString\(\)\} Verified/);
  assert.doesNotMatch(programmeSource, /\{formatMw\(displayMetrics\.kw\)\}/);
  assert.doesNotMatch(programmeSource, /\{displayMetrics\.households\.toLocaleString\(\)\} Households/);
});

test("layer toggles update overlays without recreating the satellite basemap", () => {
  assert.match(source, /markerLayerRef/);
  assert.match(source, /clearLayers\(\)/);
  assert.match(source, /layerGroup\(\)/);
  assert.doesNotMatch(source, /\[mappable, sharedState\.layers\.Contractors, sharedState\.layers\.Inspections, sharedState\.layers\.Projects, sharedState\.layers\.Status\]/);
});
