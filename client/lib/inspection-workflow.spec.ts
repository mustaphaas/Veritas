import { describe, expect, it } from "vitest";
import { projects } from "./dashboard-data";
import {
  canEditReport,
  canReviewReport,
  canStartRoute,
  canSubmitReport,
  canVerifyArrival,
  createAssignment,
  distanceMeters,
  isFieldReportLocked,
  prepareReportForReinspection,
  type AssignmentStatus,
  type InspectionAssignment,
  type InspectionReport,
} from "./inspection-workflow";

const project = projects.find((item) => item.state === "Kano")!;
const arrivalAt = "2026-08-24T10:00:00.000Z";

function assignmentWithStatus(
  status: AssignmentStatus,
  withArrival = true,
): InspectionAssignment {
  const assignment = createAssignment(
    project,
    "Amina Yusuf",
    "2026-08-24T17:00:00.000Z",
  );
  assignment.status = status;
  assignment.arrival = withArrival
    ? {
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        at: arrivalAt,
        distance: 0,
      }
    : undefined;
  return assignment;
}

function completeReport(
  assignment: InspectionAssignment,
  capturedAt = "2026-08-24T10:02:00.000Z",
): InspectionReport {
  return {
    projectId: assignment.id,
    contractor: assignment.contractor,
    state: assignment.state,
    lga: assignment.lga,
    community: assignment.community,
    inspectedAt: "2026-08-24T10:01:00.000Z",
    latitude: assignment.latitude,
    longitude: assignment.longitude,
    inspector: assignment.officer,
    equipmentInstalled: "Solar modules and inverter",
    capacity: "120 kW",
    meterDetails: "Smart meter commissioned",
    transformerDetails: "500 kVA transformer",
    poleCount: "18",
    cableLength: "2.4 km",
    beneficiaries: "460",
    observations: "Installation is operational",
    defects: "",
    recommendations: "Complete safety labels",
    assetCode: "REA-ASSET-01",
    evidence: [
      {
        id: "evidence-1",
        name: "site.jpg",
        type: "photo",
        capturedAt,
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        projectId: assignment.id,
        inspector: assignment.officer,
      },
    ],
    communitySignature: "community-signature",
    contractorSignature: "contractor-signature",
  };
}

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
    expect(isFieldReportLocked("Re-inspection")).toBe(false);
  });

  it.each([
    ["Assigned", true, false, false],
    ["En route", false, true, false],
    ["Arrived", false, false, true],
    ["Draft", false, false, true],
    ["Submitted", false, false, false],
    ["Approved", false, false, false],
    ["Re-inspection", true, false, false],
  ] satisfies Array<[AssignmentStatus, boolean, boolean, boolean]>)(
    "enforces transitions from %s",
    (status, startable, verifiable, editable) => {
      expect(canStartRoute(status)).toBe(startable);
      expect(canVerifyArrival(status)).toBe(verifiable);
      expect(canEditReport(assignmentWithStatus(status))).toBe(editable);
      expect(canReviewReport(status)).toBe(status === "Submitted");
    },
  );

  it("requires a verified arrival before report editing", () => {
    expect(canEditReport(assignmentWithStatus("Arrived", false))).toBe(false);
    expect(canEditReport(assignmentWithStatus("Draft", false))).toBe(false);
  });

  it("rejects submission when any required inspection field is blank", () => {
    const assignment = assignmentWithStatus("Arrived");
    const report = completeReport(assignment);
    const requiredFields = [
      "lga",
      "community",
      "equipmentInstalled",
      "capacity",
      "meterDetails",
      "transformerDetails",
      "poleCount",
      "cableLength",
      "beneficiaries",
      "observations",
      "recommendations",
    ] as const;

    for (const field of requiredFields) {
      expect(canSubmitReport(assignment, { ...report, [field]: "   " })).toBe(
        false,
      );
    }
  });

  it("rejects stale or mismatched evidence", () => {
    const assignment = assignmentWithStatus("Draft");
    const report = completeReport(assignment);

    expect(
      canSubmitReport(
        assignment,
        completeReport(assignment, "2026-08-24T09:59:59.000Z"),
      ),
    ).toBe(false);
    expect(
      canSubmitReport(assignment, {
        ...report,
        evidence: [{ ...report.evidence[0], projectId: "another-project" }],
      }),
    ).toBe(false);
    expect(
      canSubmitReport(assignment, {
        ...report,
        evidence: [{ ...report.evidence[0], inspector: "Another Officer" }],
      }),
    ).toBe(false);
  });

  it("accepts only a complete current-cycle report", () => {
    const assignment = assignmentWithStatus("Arrived");
    expect(canSubmitReport(assignment, completeReport(assignment))).toBe(true);

    expect(
      canSubmitReport(assignment, {
        ...completeReport(assignment),
        inspectedAt: "2026-08-24T09:59:59.000Z",
      }),
    ).toBe(false);
  });

  it("invalidates signatures and submission metadata for re-inspection", () => {
    const assignment = assignmentWithStatus("Submitted");
    const previous = {
      ...completeReport(assignment),
      submittedAt: "2026-08-24T10:03:00.000Z",
    };
    const next = prepareReportForReinspection(
      previous,
      "Capture corrected cable labels",
    );

    expect(next.reviewNote).toBe("Capture corrected cable labels");
    expect(next.communitySignature).toBeUndefined();
    expect(next.contractorSignature).toBeUndefined();
    expect(next.submittedAt).toBeUndefined();
    expect(next.evidence).toEqual(previous.evidence);
  });
});
