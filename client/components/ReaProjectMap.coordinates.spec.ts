import { describe, expect, it } from "vitest";
import { resolveProjectCoordinate } from "../lib/rea-project-map-data";

describe("REA Project Map coordinates", () => {
  it("uses the project's stored D1 latitude and longitude", () => {
    expect(resolveProjectCoordinate({ latitude: 9.0232043, longitude: 7.4518017 })).toEqual([7.4518017, 9.0232043]);
  });

  it("does not fabricate a coordinate when GPS data is missing or invalid", () => {
    expect(resolveProjectCoordinate({ latitude: null, longitude: null })).toBeNull();
    expect(resolveProjectCoordinate({ latitude: 95, longitude: 7.4 })).toBeNull();
  });
});
