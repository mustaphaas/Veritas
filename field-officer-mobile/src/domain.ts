import type {
  Assignment,
  AssignmentStatus,
  DisplayStatus,
  FormSection,
  ProjectComponent,
} from "./types";

const EARTH_RADIUS_METRES = 6_371_000;

const radians = (value: number) => (value * Math.PI) / 180;

export function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function displayStatus(status: AssignmentStatus): DisplayStatus {
  if (["Draft", "Submitted", "Re-inspection"].includes(status)) return "Draft";
  if (status === "Approved") return "Approved";
  if (status === "Verified") return "Verified";
  return "Assigned";
}

export function isReportLocked(status: AssignmentStatus) {
  return ["Submitted", "Approved", "Verified"].includes(status);
}

export function isWithinProjectGeofence(distance: number, radius = 250) {
  return Number.isFinite(distance) && distance <= radius;
}

export function assignmentValues(assignment: Assignment) {
  const values: Record<string, string> = {};
  for (const section of formSections[assignment.component]) {
    for (const field of section.fields) {
      values[field.key] = field.assigned
        ? String(assignment[field.assigned] ?? "")
        : assignment.report?.values[field.key] ?? "";
    }
  }
  return values;
}

export function isFormComplete(
  component: ProjectComponent,
  values: Record<string, string>,
) {
  return formSections[component]
    .flatMap((section) => section.fields)
    .every((field) => String(values[field.key] ?? "").trim().length > 0);
}

const projectFields: FormSection = {
  title: "Project and location information",
  fields: [
    { key: "programName", label: "Program Name", assigned: "programme" },
    { key: "organizationName", label: "Organization Name", assigned: "contractor" },
    { key: "state", label: "State", assigned: "state" },
    { key: "lga", label: "LGA", assigned: "lga" },
    { key: "identifierCode", label: "Identifier / Code", assigned: "id" },
    { key: "projectName", label: "Project Name", assigned: "projectName" },
    { key: "projectCommunity", label: "Project Community", assigned: "community" },
    { key: "latitude", label: "Latitude", assigned: "latitude" },
    { key: "longitude", label: "Longitude", assigned: "longitude" },
  ],
};

const implementationFields: FormSection = {
  title: "Implementation status and dates",
  fields: [
    { key: "implementationStatus", label: "Status", options: ["Not Started", "Ongoing", "Completed"] },
    { key: "startYear", label: "Start Year", keyboard: "numeric" },
    { key: "startMonth", label: "Start Month", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
    { key: "completionYear", label: "Completion Year", keyboard: "numeric" },
    { key: "completionMonth", label: "Completion Month", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
  ],
};

export const formSections: Record<ProjectComponent, FormSection[]> = {
  "Grid Extension": [
    projectFields,
    implementationFields,
    {
      title: "Technical",
      fields: [
        { key: "communitiesElectrified", label: "Communities electrified", keyboard: "numeric" },
        { key: "transformers200", label: "200 KVA transformers", keyboard: "numeric" },
        { key: "transformers300", label: "300 KVA transformers", keyboard: "numeric" },
        { key: "transformers500", label: "500 KVA transformers", keyboard: "numeric" },
        { key: "transformers7500", label: "7,500 KVA transformers", keyboard: "numeric" },
        { key: "transformers15000", label: "15,000 KVA transformers", keyboard: "numeric" },
        { key: "transformerCapacity", label: "Total transformer capacity (KVA)", keyboard: "decimal-pad" },
        { key: "networkBuilt", label: "Network built (km)", keyboard: "decimal-pad" },
        { key: "poles", label: "Number of poles", keyboard: "numeric" },
      ],
    },
    { title: "Financial", fields: [{ key: "projectCostNaira", label: "Total project cost (₦)", keyboard: "decimal-pad" }] },
    {
      title: "Public institutions",
      fields: [
        { key: "hospitals", label: "Hospitals electrified", keyboard: "numeric" },
        { key: "schools", label: "Schools electrified", keyboard: "numeric" },
        { key: "publicFacilities", label: "Public facilities electrified", keyboard: "numeric" },
      ],
    },
  ],
  "Mini Grid": [
    projectFields,
    {
      title: "Connections and implementation status",
      fields: [
        { key: "miniGridType", label: "Type of mini-grid", options: ["Isolated", "Interconnected"] },
        { key: "totalConnections", label: "Total connections", keyboard: "numeric" },
        { key: "residentialConnections", label: "Residential connections", keyboard: "numeric" },
        { key: "commercialConnections", label: "Commercial / PUE connections", keyboard: "numeric" },
        { key: "tariff", label: "Tariff", keyboard: "decimal-pad" },
        ...implementationFields.fields,
      ],
    },
    {
      title: "Technical",
      fields: [
        { key: "miniGridCount", label: "Number of mini-grids", keyboard: "numeric" },
        { key: "installedPv", label: "Installed PV (kWp)", keyboard: "decimal-pad" },
        { key: "inverterCapacity", label: "Inverter capacity (kW)", keyboard: "decimal-pad" },
        { key: "batteryCapacity", label: "Battery capacity (kWh)", keyboard: "decimal-pad" },
      ],
    },
    {
      title: "Financial and institutions",
      fields: [
        { key: "projectCostDollar", label: "Total project cost ($)", keyboard: "decimal-pad" },
        { key: "projectCostNaira", label: "Total project cost (₦)", keyboard: "decimal-pad" },
        { key: "grantPerConnection", label: "Grant per connection", keyboard: "decimal-pad" },
        { key: "hospitals", label: "Hospitals electrified", keyboard: "numeric" },
        { key: "schools", label: "Schools electrified", keyboard: "numeric" },
      ],
    },
  ],
  SAS: [
    {
      ...projectFields,
      title: "Program, customer and location information",
      fields: [
        ...projectFields.fields,
        { key: "customerName", label: "Customer name" },
        { key: "customerGender", label: "Gender of customer", options: ["Female", "Male", "Prefer not to say"] },
        { key: "customerPhone", label: "Customer phone number", keyboard: "phone-pad" },
      ],
    },
    {
      title: "Connection and implementation status",
      fields: [
        { key: "connectionType", label: "Type of connection", options: ["Residential", "Commercial / PUE", "Public Institution"] },
        ...implementationFields.fields,
      ],
    },
    {
      title: "Financial and technical",
      fields: [
        { key: "projectCostNaira", label: "Total project cost (₦)", keyboard: "decimal-pad" },
        { key: "grantPerConnection", label: "Grant per connection", keyboard: "decimal-pad" },
        { key: "sasUnits", label: "Number of SAS units", keyboard: "numeric" },
        { key: "installedPv", label: "Installed PV (kWp)", keyboard: "decimal-pad" },
        { key: "batteryCapacity", label: "Battery capacity (hours)", keyboard: "decimal-pad" },
      ],
    },
  ],
};
