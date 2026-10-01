import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const satelliteSource = fs.readFileSync("client/components/ProjectMapSatelliteEnhancer.tsx", "utf8");
const programmeSource = fs.readFileSync("client/components/ReaProjectMapProgramme.tsx", "utf8");

test("Project Map publishes one shared filter and layer state contract", () => {
  assert.match(programmeSource, /PROJECT_MAP_STATE_EVENT/);
  assert.match(programmeSource, /veritas:project-map-state/);
  assert.match(programmeSource, /window\.dispatchEvent\(new CustomEvent/);
  assert.match(programmeSource, /programme,/);
  assert.match(programmeSource, /component,/);
  assert.match(programmeSource, /contractor,/);
  assert.match(programmeSource, /state:\s*stateFilter/);
  assert.match(programmeSource, /lga:\s*lgaFilter/);
  assert.match(programmeSource, /search,/);
  assert.match(programmeSource, /selectedState/);
  assert.match(programmeSource, /selectedLga/);
  assert.match(programmeSource, /layers,/);
});

test("satellite map consumes the shared Project Map state rather than owning duplicate filters", () => {
  assert.match(satelliteSource, /PROJECT_MAP_STATE_EVENT/);
  assert.match(satelliteSource, /filterProjectsByMapState/);
  assert.match(satelliteSource, /effectiveState/);
  assert.match(satelliteSource, /effectiveLga/);
  assert.match(satelliteSource, /sharedState\.layers\.Projects/);
  assert.match(satelliteSource, /sharedState\.layers\.Status/);
  assert.match(satelliteSource, /(?:sharedState|state)\.layers\.Contractors/);
  assert.match(satelliteSource, /(?:sharedState|state)\.layers\.Inspections/);
  assert.match(satelliteSource, /fetchReaMapProjects\(session\.apiToken\)/);
});

test("satellite provider selector offers Esri and official Google Maps", () => {
  assert.match(satelliteSource, /Esri World Imagery/);
  assert.match(satelliteSource, /VITE_GOOGLE_MAPS_API_KEY/);
  assert.match(satelliteSource, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(satelliteSource, /imageryProvider/);
  assert.match(satelliteSource, /title="Esri World Imagery"/);
  assert.match(satelliteSource, /Google Satellite/);
  assert.doesNotMatch(satelliteSource, /mt[0-9]?\.google\.com\/vt/);
  assert.doesNotMatch(satelliteSource, /api\.mapbox\.com/);
});

test("Esri and Google project markers both zoom to the selected project", () => {
  assert.match(satelliteSource, /map\.setView\(\[latitude, longitude\], PROJECT_FOCUS_ZOOM\)/);
  assert.match(satelliteSource, /marker\.addListener\("click"/);
  assert.match(satelliteSource, /map\.setCenter\(\{ lat: latitude, lng: longitude \}\)/);
  assert.match(satelliteSource, /map\.setZoom\(PROJECT_FOCUS_ZOOM\)/);
});

test("Esri overlay updates markers without recreating the basemap", () => {
  assert.match(satelliteSource, /markerLayerRef/);
  assert.match(satelliteSource, /layerGroup\(\)/);
  assert.match(satelliteSource, /clearLayers\(\)/);
});

test("satellite view retains the Nigeria mask and navigation bounds", () => {
  assert.match(satelliteSource, /nigeria-adm1\.geojson/);
  assert.match(satelliteSource, /fillRule:\s*"evenodd"/);
  assert.match(satelliteSource, /NIGERIA_MASK_OPACITY/);
  assert.match(satelliteSource, /NIGERIA_MAX_BOUNDS/);
});
