import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("client/components/ProjectMapSatelliteEnhancer.tsx", "utf8");

test("satellite map mirrors Project Map filters and layer toggles", () => {
  assert.match(source, /Search project ID or name/);
  assert.match(source, /All Programmes/);
  assert.match(source, /All States/);
  assert.match(source, /All LGAs/);
  assert.match(source, /layers\.Projects/);
  assert.match(source, /layers\.Status/);
  assert.match(source, /MutationObserver/);
});
