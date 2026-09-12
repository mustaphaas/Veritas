import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assignmentValues, assignmentsForSection, displayStatus, distanceMetres, formatCurrentLocation, formSections, isFormComplete, isReportLocked, isWithinProjectGeofence } from "./domain.ts";
import { demoAssignments } from "./demoData.ts";
import { appVisualSpec, greetingBannerSpec } from "./greetingBanner.ts";

describe("field officer mobile domain", () => {
  it("shows each field inspection workflow status clearly", () => {
    assert.equal(displayStatus("Assigned"), "Assigned");
    assert.equal(displayStatus("Draft"), "Draft");
    assert.equal(displayStatus("Re-inspection"), "Re-inspection");
    assert.equal(displayStatus("Submitted"), "Submitted");
    assert.equal(displayStatus("Approved"), "Approved");
    assert.equal(displayStatus("Verified"), "Verified");
  });

  it("locks submitted and reviewed reports", () => {
    assert.equal(isReportLocked("Draft"), false);
    assert.equal(isReportLocked("Submitted"), true);
    assert.equal(isReportLocked("Approved"), true);
    assert.equal(isReportLocked("Verified"), true);
  });

  it("keeps assignments, drafts and inspection history separate", () => {
    assert.ok(assignmentsForSection(demoAssignments, "assignments").every((item) => item.status === "Assigned"));
    assert.ok(assignmentsForSection(demoAssignments, "drafts").every((item) => item.status === "Draft"));
    assert.ok(assignmentsForSection(demoAssignments, "inspections").every((item) => ["Submitted", "Approved", "Verified", "Re-inspection"].includes(item.status)));
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
    assert.equal(keys("Mini Grid").includes("totalProjectCostDollar"), false);
    assert.ok(keys("SAS").includes("customerPhoneNumber"));

    const dateFields = formSections["Mini Grid"].flatMap((section) => section.fields)
      .filter((field) => field.key.endsWith("DateYear") || field.key.endsWith("DateMonth"));
    assert.ok(dateFields.every((field) => (field.options?.length ?? 0) > 0));
  });

  it("includes Mustapha's Durumi GPS test assignment", () => {
    const durumi = demoAssignments.find((item) => item.id === "REA-FCT-MG-DEMO-001");
    assert.equal(durumi?.officer, "Mustapha Aliyu");
    assert.equal(durumi?.community, "Durumi");
    assert.equal(durumi?.latitude, 9.0232043);
    assert.equal(durumi?.longitude, 7.4518017);
  });

  it("shows a current area with its state without repeating names", () => {
    assert.equal(
      formatCurrentLocation({ district: "Wuse 2", city: "Abuja", region: "Federal Capital Territory" }),
      "Wuse 2, Federal Capital Territory",
    );
    assert.equal(
      formatCurrentLocation({ city: "Kano", region: "Kano" }),
      "Kano",
    );
  });

  it("falls back from an unknown area to the state, then unavailable", () => {
    assert.equal(formatCurrentLocation({ region: "Kaduna" }), "Kaduna");
    assert.equal(formatCurrentLocation({}), "Location unavailable");
  });

  it("keeps the reference greeting banner compact and complete", () => {
    assert.ok(greetingBannerSpec.height <= 100);
    assert.equal(greetingBannerSpec.slogan, "Clean Energy.\nA Brighter Nigeria.");
    assert.equal(greetingBannerSpec.weather, "28°C  ·  Good conditions");
    assert.equal(greetingBannerSpec.usesReferenceArtwork, true);
  });

  it("uses the approved overview visual system", () => {
    assert.equal(greetingBannerSpec.showLeadingSun, false);
    assert.equal(appVisualSpec.overviewKpiColumns, 2);
    assert.equal(appVisualSpec.glassKpiCards, true);
    assert.equal(appVisualSpec.projectIcon, "solar-panel");
  });

  it("does not embed login credentials in the application screen", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(appSource, /const \[password, setPassword\] = useState\("[^\"]+"\)/);
    assert.doesNotMatch(appSource, /demoHint/);
  });
});
