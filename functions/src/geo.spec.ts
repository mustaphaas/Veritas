import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geo.js";

describe("distanceMeters", () => {
  it("returns zero for the same coordinate", () => {
    expect(
      distanceMeters(
        { latitude: 9.0765, longitude: 7.3986 },
        { latitude: 9.0765, longitude: 7.3986 },
      ),
    ).toBe(0);
  });

  it("calculates a realistic geofence distance", () => {
    const distance = distanceMeters(
      { latitude: 9.0765, longitude: 7.3986 },
      { latitude: 9.0774, longitude: 7.3986 },
    );
    expect(distance).toBeGreaterThanOrEqual(99);
    expect(distance).toBeLessThanOrEqual(101);
  });
});
