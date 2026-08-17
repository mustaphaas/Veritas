import { describe, expect, it } from "vitest";
import { projects } from "./dashboard-data";
import { validateComponentFormValues } from "./component-inspection-form";
import {
  canReviewReport,
  canStartRoute,
  canVerifyArrival,
  createAssignment,
  createComponentTestAssignments,
  distanceMeters,
  getAssignmentDisplayStatus,
  getDeviceType,
  isFieldReportLocked,
  isArrivalFresh,
  migrateStoredAssignment,
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
    expect(assignment.audit[0].deviceType).toBe(getDeviceType());
  });

  it("provides every lifecycle form for the requested programmes and components", () => {
    const assignments = createComponentTestAssignments();
    expect([
      ...new Set(assignments.map((assignment) => assignment.programme)),
    ]).toEqual(["NEP", "DARES", "AMP"]);
    expect([
      ...new Set(assignments.map((assignment) => assignment.component)),
    ]).toEqual(["Mini Grid", "Grid Extension", "SAS"]);
    for (const component of ["Mini Grid", "Grid Extension", "SAS"] as const) {
      expect(
        assignments
          .filter((assignment) => assignment.component === component)
          .map((assignment) => assignment.status),
      ).toEqual(["Assigned", "Draft", "Submitted", "Approved", "Verified"]);
    }
    expect(new Set(assignments.map((assignment) => assignment.id)).size).toBe(
      15,
    );
  });

  it("keeps draft, submitted, approved and REA-verified demos on the new form", () => {
    const reports = createComponentTestAssignments().filter(
      (assignment) => assignment.report,
    );
    expect(reports).toHaveLength(12);
    reports.forEach((assignment) => {
      expect(assignment.report?.assignedComponent).toBe(assignment.component);
      expect(
        validateComponentFormValues(
          assignment.report!.assignedComponent,
          assignment.report!.componentValues,
        ),
      ).toBe(true);
      expect(assignment.report?.evidence).toHaveLength(2);
      expect(assignment.report?.evidence[0].previewUrl).toContain(
        "transformer.svg",
      );
      expect(assignment.report?.evidence[1].previewUrl).toContain(
        "inverter.svg",
      );
    });
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

  it("migrates legacy reports without losing evidence", () => {
    const project = projects.find((item) => item.component === "Mini Grid")!;
    const assignment = createAssignment(
      project,
      "Amina Yusuf",
      "2026-08-24T17:00:00.000Z",
    );
    assignment.report = {
      projectId: assignment.id,
      contractor: assignment.contractor,
      state: assignment.state,
      lga: assignment.lga,
      community: assignment.community,
      inspectedAt: "2026-08-17T12:00:00.000Z",
      latitude: assignment.latitude,
      longitude: assignment.longitude,
      inspector: assignment.officer,
      deviceId: "REA-LEGACY",
      deviceType: "Mobile phone",
      capacity: "250 kW",
      beneficiaries: "730",
      assetCode: "ASSET-001",
      evidence: [
        {
          id: "evidence-1",
          name: "site.jpg",
          type: "photo",
          capturedAt: "2026-08-17T12:00:00.000Z",
          latitude: assignment.latitude,
          longitude: assignment.longitude,
          projectId: assignment.id,
          inspector: assignment.officer,
          deviceId: "REA-LEGACY",
          deviceType: "Mobile phone",
        },
      ],
    } as typeof assignment.report;

    const migrated = migrateStoredAssignment(assignment);
    expect(migrated.report?.assignmentId).toBe(assignment.id);
    expect(migrated.report?.assignedComponent).toBe("Mini Grid");
    expect(migrated.report?.componentValues.installedPvKwp).toBe("250");
    expect(migrated.report?.componentValues.totalNumberOfConnections).toBe(
      "730",
    );
    expect(migrated.report?.evidence).toHaveLength(1);
  });
});
