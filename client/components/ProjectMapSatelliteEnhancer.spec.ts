import { describe, expect, it } from "vitest";
import {
  NIGERIA_MASK_OPACITY,
  NIGERIA_MAX_BOUNDS,
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

  it("constrains satellite navigation around Nigeria", () => {
    expect(NIGERIA_MAX_BOUNDS).toEqual([[3.2, 2.0], [14.9, 15.2]]);
  });

  it("dims the area outside Nigeria without hiding Nigeria", () => {
    expect(NIGERIA_MASK_OPACITY).toBeGreaterThanOrEqual(0.45);
    expect(NIGERIA_MASK_OPACITY).toBeLessThanOrEqual(0.65);
  });
});
