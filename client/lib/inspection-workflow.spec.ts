import { describe, expect, it } from "vitest";
import { projects } from "./dashboard-data";
import { createAssignment, distanceMeters } from "./inspection-workflow";

describe("inspection workflow", () => {
  it("accepts a location inside the project geofence", () => {
    expect(
      distanceMeters(
        { latitude: 12.0022, longitude: 8.592 },
        { latitude: 12.0022, longitude: 8.592 },
      ),
    ).toBe(0);
  });

  it("rejects a location well outside the project geofence", () => {
    expect(
      distanceMeters(
        { latitude: 12.0022, longitude: 8.592 },
        { latitude: 9.0765, longitude: 7.3986 },
      ),
    ).toBeGreaterThan(250);
  });

  it("creates a complete field assignment from a project", () => {
    const project = projects.find((item) => item.state === "Kano")!;
    const assignment = createAssignment(
      project,
      "Amina Yusuf",
      "2026-08-24T17:00:00.000Z",
    );
    expect(assignment.projectName).toBe(project.name);
    expect(assignment.officer).toBe("Amina Yusuf");
    expect(assignment.status).toBe("Assigned");
    expect(assignment.geofenceRadius).toBe(250);
    expect(assignment.audit[0].action).toContain("Amina Yusuf");
  });
});
