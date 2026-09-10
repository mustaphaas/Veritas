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

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const statuses = ["Not Started", "Ongoing", "Completed"];
const commonProjectFields = [
  { key: "programName", label: "Program Name", assigned: "programme" as const },
  { key: "organizationName", label: "Organization Name", assigned: "contractor" as const },
  { key: "state", label: "State", assigned: "state" as const },
  { key: "lga", label: "LGA", assigned: "lga" as const },
  { key: "identifierCode", label: "Identifier/ Code", assigned: "id" as const },
];
const locationFields = [
  { key: "projectName", label: "Project Name", assigned: "projectName" as const },
  { key: "projectCommunity", label: "Project Community", assigned: "community" as const },
  { key: "latitude", label: "Latitude", assigned: "latitude" as const },
  { key: "longitude", label: "Longitude", assigned: "longitude" as const },
];
const implementationFields = [
  { key: "status", label: "Status", options: statuses },
  { key: "startDateYear", label: "Year", group: "Start Date", keyboard: "numeric" as const },
  { key: "startDateMonth", label: "Month", group: "Start Date", options: months },
  { key: "completionDateYear", label: "Year", group: "Date of Completion", keyboard: "numeric" as const },
  { key: "completionDateMonth", label: "Month", group: "Date of Completion", options: months },
];
const publicInstitutionFields = [
  { key: "publicInstitutionHospitals", label: "Hospitals", group: "Public Institution Electrified", keyboard: "numeric" as const },
  { key: "publicInstitutionSchools", label: "Schools", group: "Public Institution Electrified", keyboard: "numeric" as const },
  { key: "publicInstitutionPublicFacilities", label: "Public Facilities", group: "Public Institution Electrified", keyboard: "numeric" as const },
];

export const formSections: Record<ProjectComponent, FormSection[]> = {
  "Grid Extension": [
    { title: "Project and location information", fields: [...commonProjectFields, ...locationFields] },
    { title: "Implementation status and dates", fields: implementationFields },
    {
      title: "Technical",
      fields: [
        { key: "communitiesElectrifiedByGridExtension", label: "Number of Communities electrified by grid extension", keyboard: "numeric" },
        { key: "transformersKva200", label: "200", group: "Number of Transformers (KVA)", keyboard: "numeric" },
        { key: "transformersKva300", label: "300", group: "Number of Transformers (KVA)", keyboard: "numeric" },
        { key: "transformersKva500", label: "500", group: "Number of Transformers (KVA)", keyboard: "numeric" },
        { key: "transformersKva7500", label: "7500", group: "Number of Transformers (KVA)", keyboard: "numeric" },
        { key: "transformersKva15000", label: "15000", group: "Number of Transformers (KVA)", keyboard: "numeric" },
        { key: "totalTransformerCapacityKva", label: "Total Transformer Capacity(KVA)", keyboard: "decimal-pad" },
        { key: "kmOfNetworkBuilt", label: "KM of network built", keyboard: "decimal-pad" },
        { key: "numberOfPoles", label: "Number of poles", keyboard: "numeric" },
      ],
    },
    { title: "Financial", fields: [{ key: "totalProjectCostNaira", label: "₦", group: "Total Project Cost", keyboard: "decimal-pad" }] },
    { title: "Public institutions", fields: publicInstitutionFields },
  ],
  "Mini Grid": [
    {
      title: "Project and location information",
      fields: [
        ...commonProjectFields,
        { key: "projectName", label: "Project Name", assigned: "projectName" },
        { key: "typeOfMiniGrid", label: "Type of Mini-Grid", options: ["Isolated", "Interconnected"] },
        { key: "projectCommunity", label: "Project Community", assigned: "community" },
        { key: "latitude", label: "Latitude", assigned: "latitude" },
        { key: "longtitude", label: "Longtitude", assigned: "longitude" },
      ],
    },
    {
      title: "Connections and implementation status",
      fields: [
        { key: "totalNumberOfConnections", label: "Total Number of Connections", keyboard: "numeric" },
        { key: "residentialConnections", label: "Residential connections", keyboard: "numeric" },
        { key: "commercialPueConnections", label: "Commercial / PUE Connections", keyboard: "numeric" },
        { key: "tariff", label: "Tariff", keyboard: "decimal-pad" },
        ...implementationFields,
      ],
    },
    {
      title: "Financial",
      fields: [
        { key: "totalProjectCostDollar", label: "$", group: "Total Project Cost", keyboard: "decimal-pad" },
        { key: "totalProjectCostNaira", label: "₦", group: "Total Project Cost", keyboard: "decimal-pad" },
        { key: "grantPerConnection", label: "Grant per Connection", keyboard: "decimal-pad" },
      ],
    },
    {
      title: "Technical",
      fields: [
        { key: "numberOfMiniGrid", label: "Number of Mini-grid", keyboard: "numeric" },
        { key: "installedPvKwp", label: "Installed PV (kWp)", group: "System Capacity", keyboard: "decimal-pad" },
        { key: "inverterCapacityKw", label: "Inverter Capacity (kW)", group: "System Capacity", keyboard: "decimal-pad" },
        { key: "batteryCapacityKwh", label: "Battery Capacity (kWh)", group: "System Capacity", keyboard: "decimal-pad" },
      ],
    },
    { title: "Public institutions", fields: publicInstitutionFields },
  ],
  SAS: [
    {
      title: "Program, customer and location information",
      fields: [
        ...commonProjectFields,
        { key: "customerName", label: "Customer name" },
        { key: "genderOfCustomer", label: "Gender of Customer", options: ["Female", "Male", "Prefer not to say"] },
        { key: "customerPhoneNumber", label: "Customer Phone Number", keyboard: "phone-pad" },
      ],
    },
    {
      title: "Connection and implementation status",
      fields: [
        { key: "status", label: "Status", options: statuses },
        { key: "typeOfConnection", label: "Type of Connection", options: ["Residential", "Commercial / PUE", "Public Institution"] },
        ...implementationFields.slice(1),
      ],
    },
    {
      title: "Financial",
      fields: [
        { key: "totalProjectCostNaira", label: "₦", group: "Total Project Cost", keyboard: "decimal-pad" },
        { key: "grantPerConnection", label: "Grant per Connection", keyboard: "decimal-pad" },
      ],
    },
    {
      title: "Technical",
      fields: [
        { key: "numberOfSasUnits", label: "Number of SAS Units", keyboard: "numeric" },
        { key: "installedPvKwp", label: "Installed PV (kWp)", group: "System Capacity", keyboard: "decimal-pad" },
        { key: "batteryCapacityH", label: "Battery Capacity ( h)", group: "System Capacity", keyboard: "decimal-pad" },
      ],
    },
  ],
};
