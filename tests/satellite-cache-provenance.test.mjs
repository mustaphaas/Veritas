import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normaliseEsriImageryDate,
  parseEsriImageryMetadata,
} from "../worker/satellite-verify.js";

test("Esri acquisition dates are normalised without inventing unavailable values", () => {
  assert.equal(normaliseEsriImageryDate(null), null);
  assert.equal(normaliseEsriImageryDate(99999), null);
  assert.equal(normaliseEsriImageryDate("20260914"), "2026-09-14");
  assert.equal(normaliseEsriImageryDate("2026-09-14T00:00:00Z"), "2026-09-14");
});

test("Esri metadata parser recognises source date and provider fields", () => {
  assert.deepEqual(
    parseEsriImageryMetadata({ SRC_DATE2: "20260914", SOURCE: "Example imagery provider" }),
    { imageryDate: "2026-09-14", source: "Example imagery provider" },
  );
  assert.deepEqual(
    parseEsriImageryMetadata({ SRC_DATE2: 99999 }),
    { imageryDate: null, source: null },
  );
});

test("satellite verification route is cache-first on GET and refresh-only on POST", () => {
  const source = fs.readFileSync("worker/satellite-verify.js", "utf8");
  assert.match(source, /request\.method !== "GET" && request\.method !== "POST"/);
  assert.match(source, /request\.method === "GET"/);
  assert.match(source, /no_cached_satellite_result/);
  assert.match(source, /cached:\s*true/);
  assert.match(source, /fetchEsriImageryMetadata/);
  assert.match(source, /satellite_imagery_date=\?/);
  assert.doesNotMatch(source, /imageryDate:\s*null,\s*radiusMetres/);
});

test("Veritas chat reuses cache unless the user explicitly asks for a refresh", () => {
  const source = fs.readFileSync("worker/satellite-analysis.js", "utf8");
  assert.match(source, /explicitRefresh/);
  assert.match(source, /"GET"/);
  assert.match(source, /"POST"/);
  assert.match(source, /no_cached_satellite_result/);
});
