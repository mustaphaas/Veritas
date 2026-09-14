import { describe, expect, it } from "vitest";
import {
  PROJECT_FOCUS_ZOOM,
  SATELLITE_TILE_URL,
  projectMapSatelliteInitialView,
} from "./ProjectMapSatelliteEnhancer";

describe("Project Map satellite enhancer", () => {
  it("uses a zoomable satellite tile source", () => {
    expect(SATELLITE_TILE_URL).toContain("{z}");
    expect(SATELLITE_TILE_URL).toContain("{x}");
    expect(SATELLITE_TILE_URL).toContain("{y}");
  });

  it("starts with a Nigeria-wide view", () => {
    expect(projectMapSatelliteInitialView.center).toEqual([9.08, 8.68]);
    expect(projectMapSatelliteInitialView.zoom).toBe(6);
  });

  it("focuses a selected project at close satellite detail", () => {
    expect(PROJECT_FOCUS_ZOOM).toBe(18);
  });
});
