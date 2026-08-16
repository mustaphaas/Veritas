import { describe, expect, it } from "vitest";
import { projects } from "./dashboard-data";
import {
  canReviewReport,
  canStartRoute,
  canVerifyArrival,
  createAssignment,
  distanceMeters,
  getAssignmentDisplayStatus,
  isFieldReportLocked,
  isArrivalFresh,
} from "./inspection-workflow";

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

  it("locks submitted and approved reports but unlocks re-inspections", () => {
    expect(isFieldReportLocked("Submitted")).toBe(true);
    expect(isFieldReportLocked("Approved")).toBe(true);
    expect(isFieldReportLocked("Verified")).toBe(true);
    expect(isFieldReportLocked("Re-inspection")).toBe(false);
  });

  it("exposes only the four management assignment statuses", () => {
    expect(getAssignmentDisplayStatus("En route")).toBe("Assigned");
    expect(getAssignmentDisplayStatus("Submitted")).toBe("Draft");
    expect(getAssignmentDisplayStatus("Re-inspection")).toBe("Draft");
    expect(getAssignmentDisplayStatus("Approved")).toBe("Approved");
    expect(getAssignmentDisplayStatus("Verified")).toBe("Verified");
  });

  it("enforces the ordered field and consultant status transitions", () => {
    expect(canStartRoute("Assigned")).toBe(true);
    expect(canStartRoute("Submitted")).toBe(false);
    expect(canVerifyArrival("Assigned")).toBe(true);
    expect(canVerifyArrival("En route")).toBe(true);
    expect(canReviewReport("Draft")).toBe(false);
    expect(canReviewReport("Submitted")).toBe(true);
  });

  it("requires a recent GPS verification before a draft can be edited", () => {
    const now = Date.parse("2026-08-17T12:00:00.000Z");
    expect(
      isArrivalFresh(
        {
          latitude: 9.08,
          longitude: 7.4,
          distance: 12,
          at: "2026-08-17T11:50:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isArrivalFresh(
        {
          latitude: 9.08,
          longitude: 7.4,
          distance: 12,
          at: "2026-08-17T11:30:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });
});
