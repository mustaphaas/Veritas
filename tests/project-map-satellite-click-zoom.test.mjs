import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("client/components/ProjectMapSatelliteEnhancer.tsx", "utf8");
const programmeSource = fs.readFileSync("client/components/ReaProjectMapProgramme.tsx", "utf8");

test("Esri project markers zoom to the project on click", () => {
  assert.match(source, /\.on\(["']click["']\s*,\s*\(\)\s*=>\s*map\.setView\(\[latitude, longitude\], PROJECT_FOCUS_ZOOM\)\)/);
});

test("Google project markers zoom to the project on click", () => {
  assert.match(source, /marker\.addListener\(["']click["']/);
  assert.match(source, /map\.setCenter\(\{\s*lat:\s*latitude,\s*lng:\s*longitude\s*\}\)/);
  assert.match(source, /map\.setZoom\(PROJECT_FOCUS_ZOOM\)/);
});

test("standard Project Map project pin visibly zooms when selected", () => {
  assert.match(
    programmeSource,
    /setSelectedProject\(project\);\s*setZoom\(1\.85\);/,
  );
});
