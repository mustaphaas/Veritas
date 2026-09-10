import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assignmentValues, displayStatus, distanceMetres, formSections, isFormComplete, isReportLocked, isWithinProjectGeofence } from "./domain.ts";
import { demoAssignments } from "./demoData.ts";

describe("field officer mobile domain", () => {
  it("uses the same four-stage display workflow as the dashboard", () => {
    assert.equal(displayStatus("Assigned"), "Assigned");
    assert.equal(displayStatus("Re-inspection"), "Draft");
    assert.equal(displayStatus("Submitted"), "Draft");
    assert.equal(displayStatus("Approved"), "Approved");
    assert.equal(displayStatus("Verified"), "Verified");
  });

  it("locks submitted and reviewed reports", () => {
    assert.equal(isReportLocked("Draft"), false);
    assert.equal(isReportLocked("Submitted"), true);
    assert.equal(isReportLocked("Approved"), true);
    assert.equal(isReportLocked("Verified"), true);
  });

  it("checks the 250 metre project geofence", () => {
    const nearby = distanceMetres(12.0022, 8.5919, 12.003, 8.5919);
    const far = distanceMetres(12.0022, 8.5919, 12.02, 8.5919);
    assert.ok(nearby < 250);
    assert.equal(isWithinProjectGeofence(nearby), true);
    assert.equal(isWithinProjectGeofence(far), false);
  });

  it("hydrates assignment-controlled fields and requires form completion", () => {
    const assignment = demoAssignments[0]!;
    const values = assignmentValues(assignment);
    assert.equal(values.identifierCode, assignment.id);
    assert.equal(values.projectName, assignment.projectName);
    assert.equal(isFormComplete(assignment.component, values), false);
  });

  it("matches the Veritas component form schema", () => {
    const keys = (component: keyof typeof formSections) =>
      formSections[component].flatMap((section) => section.fields.map((field) => field.key));

    assert.deepEqual(keys("Grid Extension"), [
      "programName", "organizationName", "state", "lga", "identifierCode", "projectName",
      "projectCommunity", "latitude", "longitude", "status", "startDateYear", "startDateMonth",
      "completionDateYear", "completionDateMonth", "communitiesElectrifiedByGridExtension",
      "transformersKva200", "transformersKva300", "transformersKva500", "transformersKva7500",
      "transformersKva15000", "totalTransformerCapacityKva", "kmOfNetworkBuilt", "numberOfPoles",
      "totalProjectCostNaira", "publicInstitutionHospitals", "publicInstitutionSchools",
      "publicInstitutionPublicFacilities",
    ]);
    assert.ok(keys("Mini Grid").includes("batteryCapacityKwh"));
    assert.ok(keys("SAS").includes("customerPhoneNumber"));
  });
});
