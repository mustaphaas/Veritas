import { describe, expect, it } from "vitest";
import {
  COMPONENT_FORM_SECTIONS,
  createComponentFormValues,
  getComponentFieldDefinitions,
  isSupportedAssignmentComponent,
  sanitizeComponentFormValues,
  validateComponentFormValues,
  type SupportedAssignmentComponent,
} from "./component-inspection-form";

const assignment = {
  id: "REA-KAN-0007",
  programme: "NEP",
  contractor: "SunVolt Nigeria",
  state: "Kano",
  lga: "Kano Municipal",
  projectName: "Kano Energy Project",
  community: "Kofar Ruwa",
  latitude: 12.0022,
  longitude: 8.592,
};

const labels = (component: SupportedAssignmentComponent) =>
  getComponentFieldDefinitions(component).map((field) => field.label);

describe("component-driven field inspection form", () => {
  it("recognizes exactly the three supported assignment components", () => {
    expect(isSupportedAssignmentComponent("Grid Extension")).toBe(true);
    expect(isSupportedAssignmentComponent("Mini Grid")).toBe(true);
    expect(isSupportedAssignmentComponent("SAS")).toBe(true);
    expect(isSupportedAssignmentComponent("Solar Street Light")).toBe(false);
  });

  it("keeps component-specific fields isolated", () => {
    expect(labels("Grid Extension")).toContain("Number of poles");
    expect(labels("Grid Extension")).not.toContain("Type of Mini-Grid");
    expect(labels("Grid Extension")).not.toContain("Customer Name");

    expect(labels("Mini Grid")).toContain("Type of Mini-Grid");
    expect(labels("Mini Grid")).not.toContain("Number of poles");
    expect(labels("Mini Grid")).not.toContain("Customer Name");

    expect(labels("SAS")).toContain("Customer Name");
    expect(labels("SAS")).not.toContain("Type of Mini-Grid");
    expect(labels("SAS")).not.toContain("Number of poles");
  });

  it("retains all grouped subfields", () => {
    const gridGroups = COMPONENT_FORM_SECTIONS["Grid Extension"].flatMap(
      (section) => section.items.filter((item) => item.type === "group"),
    );
    expect(
      gridGroups
        .find((group) => group.label === "Number of Transformers (KVA)")
        ?.fields.map((field) => field.label),
    ).toEqual(["200", "300", "500", "7500", "15000"]);

    const miniGroups = COMPONENT_FORM_SECTIONS["Mini Grid"].flatMap((section) =>
      section.items.filter((item) => item.type === "group"),
    );
    expect(
      miniGroups
        .find((group) => group.label === "System Capacity")
        ?.fields.map((field) => field.label),
    ).toEqual([
      "Installed PV (kWp)",
      "Inverter Capacity (kW)",
      "Battery Capacity (kWh)",
    ]);
  });

  it("prepopulates assignment fields without losing leading zeros", () => {
    const values = createComponentFormValues("SAS", {
      ...assignment,
      id: "000042",
    });
    expect(values.identifierCode).toBe("000042");
    expect(values.programName).toBe("NEP");
    expect(values.organizationName).toBe("SunVolt Nigeria");
  });

  it("sanitizes submission values to the visible component only", () => {
    const values = createComponentFormValues("Grid Extension", assignment);
    const sanitized = sanitizeComponentFormValues("Grid Extension", {
      ...values,
      customerName: "Must not transfer",
    });
    expect(sanitized.customerName).toBeUndefined();
    expect(sanitized.projectName).toBe("Kano Energy Project");
  });

  it("validates non-negative numeric values and coordinates", () => {
    const values = createComponentFormValues("Mini Grid", assignment);
    getComponentFieldDefinitions("Mini Grid").forEach((field) => {
      if (field.assignmentKey) return;
      values[field.key] = field.kind === "select" ? field.options![0] : "1";
    });
    expect(validateComponentFormValues("Mini Grid", values)).toBe(true);
    values.totalNumberOfConnections = "-1";
    expect(validateComponentFormValues("Mini Grid", values)).toBe(false);
    values.totalNumberOfConnections = "1";
    values.latitude = "91";
    expect(validateComponentFormValues("Mini Grid", values)).toBe(false);
  });
});
