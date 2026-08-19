import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { projects, type Project } from "./dashboard-data";
import {
  createComponentFormValues,
  getComponentFieldDefinitions,
  isSupportedAssignmentComponent,
  normalizeAssignmentComponent,
  sanitizeComponentFormValues,
  validateComponentFormValues,
  type ComponentFormValues,
  type SupportedAssignmentComponent,
} from "./component-inspection-form";

export type AssignmentStatus =
  | "Assigned"
  | "En route"
  | "Arrived"
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Verified"
  | "Rejected"
  | "Re-inspection";

export type AssignmentDisplayStatus =
  "Assigned" | "Draft" | "Approved" | "Verified";

export function getAssignmentDisplayStatus(
  status: AssignmentStatus,
): AssignmentDisplayStatus {
  if (status === "Approved" || status === "Rejected") return "Approved";
  if (status === "Verified") return "Verified";
  if (["Draft", "Submitted", "Re-inspection"].includes(status)) return "Draft";
  return "Assigned";
}

export function assignmentDisplayRank(status: AssignmentStatus) {
  return { Assigned: 0, Draft: 1, Approved: 2, Verified: 3 }[
    getAssignmentDisplayStatus(status)
  ];
}

export function isFieldReportLocked(status: AssignmentStatus) {
  return (
    status === "Submitted" ||
    status === "Approved" ||
    status === "Verified" ||
    status === "Rejected"
  );
}

export function canStartRoute(status: AssignmentStatus) {
  return ["Assigned", "Draft", "Re-inspection"].includes(status);
}

export function canVerifyArrival(status: AssignmentStatus) {
  return ["Assigned", "En route", "Draft", "Re-inspection"].includes(status);
}

export function isArrivalFresh(
  arrival?: InspectionAssignment["arrival"],
  now = Date.now(),
) {
  return Boolean(
    arrival && now - new Date(arrival.at).getTime() <= 15 * 60 * 1000,
  );
}

export function canEditReport(assignment: InspectionAssignment) {
  return (
    isArrivalFresh(assignment.arrival) &&
    !isFieldReportLocked(assignment.status)
  );
}

export function canSubmitReport(
  assignment: InspectionAssignment,
  report: InspectionReport,
) {
  return (
    canEditReport(assignment) &&
    isSupportedAssignmentComponent(assignment.component) &&
    report.assignmentId === assignment.id &&
    report.assignedComponent === assignment.component &&
    validateComponentFormValues(assignment.component, report.componentValues) &&
    report.evidence.length > 0 &&
    Boolean(report.communitySignature) &&
    Boolean(report.contractorSignature)
  );
}

export function canReviewReport(status: AssignmentStatus) {
  return status === "Submitted";
}

export function canReaReviewReport(status: AssignmentStatus) {
  return status === "Approved";
}

export type EvidenceItem = {
  id: string;
  name: string;
  type: "photo" | "video";
  capturedAt: string;
  latitude: number;
  longitude: number;
  projectId: string;
  inspector: string;
  deviceId: string;
  deviceType: string;
  previewUrl?: string;
};

export type InspectionReport = {
  assignmentId: string;
  assignedComponent: SupportedAssignmentComponent;
  componentValues: ComponentFormValues;
  projectId: string;
  contractor: string;
  state: string;
  lga: string;
  community: string;
  inspectedAt: string;
  latitude: number;
  longitude: number;
  inspector: string;
  deviceId: string;
  deviceType: string;
  equipmentInstalled?: string;
  capacity?: string;
  meterDetails?: string;
  transformerDetails?: string;
  poleCount?: string;
  cableLength?: string;
  beneficiaries?: string;
  observations?: string;
  defects?: string;
  recommendations?: string;
  assetCode: string;
  evidence: EvidenceItem[];
  communitySignature?: string;
  contractorSignature?: string;
  submittedAt?: string;
  reviewNote?: string;
  reaReviewNote?: string;
  reaReviewedAt?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  deviceId: string;
  deviceType: string;
};

export type InspectionAssignment = {
  id: string;
  projectName: string;
  programme: string;
  component: string;
  contractor: string;
  state: string;
  lga: string;
  community: string;
  officer: string;
  dueDate: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  routeStartedAt?: string;
  status: AssignmentStatus;
  arrival?: {
    latitude: number;
    longitude: number;
    at: string;
    distance: number;
  };
  report?: InspectionReport;
  syncStatus: "synced" | "queued";
  audit: AuditEvent[];
};

const STORAGE_KEY = "rea-inspection-workflow-v4";
const DEVICE_KEY = "rea-field-device-id";

const stateCentres: Record<string, [number, number]> = {
  Kano: [12.0022, 8.592],
  Kaduna: [10.5105, 7.4165],
  Katsina: [12.9908, 7.6018],
  Sokoto: [13.0059, 5.2476],
  Zamfara: [12.1704, 6.6597],
  Jigawa: [12.228, 9.5616],
  Lagos: [6.5244, 3.3792],
  Ogun: [7.1475, 3.3619],
  Oyo: [7.3775, 3.947],
  FCT: [9.0765, 7.3986],
  Rivers: [4.8156, 7.0498],
  Enugu: [6.4584, 7.5464],
};

export type FieldOfficerAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  zone: string;
  device: string;
  password: string;
  status: "Active" | "Suspended";
  createdAt: string;
};

export const FIELD_OFFICERS_STORAGE_KEY = "rea-field-officers-v1";

export const defaultFieldOfficers: FieldOfficerAccount[] = [
  {
    id: "officer-amina-yusuf",
    name: "Amina Yusuf",
    email: "field.officer@demo.ng",
    phone: "08030001001",
    zone: "North West",
    device: "REA-AY-1042",
    password: "Field2024!",
    status: "Active",
    createdAt: "2026-01-05T09:00:00.000Z",
  },
  {
    id: "officer-chinedu-okafor",
    name: "Chinedu Okafor",
    email: "chinedu.okafor@demo.ng",
    phone: "08030001002",
    zone: "South East",
    device: "REA-CO-1178",
    password: "Field2024!",
    status: "Active",
    createdAt: "2026-01-06T09:00:00.000Z",
  },
  {
    id: "officer-fatima-bello",
    name: "Fatima Bello",
    email: "fatima.bello@demo.ng",
    phone: "08030001003",
    zone: "North East",
    device: "REA-FB-1094",
    password: "Field2024!",
    status: "Active",
    createdAt: "2026-01-07T09:00:00.000Z",
  },
  {
    id: "officer-tunde-adebayo",
    name: "Tunde Adebayo",
    email: "tunde.adebayo@demo.ng",
    phone: "08030001004",
    zone: "South West",
    device: "REA-TA-1210",
    password: "Field2024!",
    status: "Active",
    createdAt: "2026-01-08T09:00:00.000Z",
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDeviceId() {
  if (typeof window === "undefined") return "REA-WEB-DEVICE";
  let value = window.localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `REA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    window.localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

export function getDeviceType() {
  if (typeof navigator === "undefined") return "Desktop computer";
  const userAgent = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(userAgent)) return "Tablet";
  if (/iphone|ipod|android.*mobile|windows phone|mobile/.test(userAgent)) {
    return "Mobile phone";
  }
  if (/android/.test(userAgent) && navigator.maxTouchPoints > 1) {
    return "Tablet";
  }
  return "Desktop computer";
}

export function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(
    earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

function projectId(project: Project, index: number) {
  return `REA-${project.state.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`;
}

export function createAssignment(
  project: Project,
  officer: string,
  dueDate: string,
  index = 0,
): InspectionAssignment {
  const [latitude, longitude] = stateCentres[project.state] ?? [9.0765, 7.3986];
  const now = new Date().toISOString();
  const id = projectId(
    project,
    projects.indexOf(project) >= 0 ? projects.indexOf(project) : index,
  );
  const component = normalizeAssignmentComponent(project.component);
  return {
    id,
    projectName: project.name,
    programme: project.programme,
    component,
    contractor: project.contractor,
    state: project.state,
    lga: `${project.state} Central`,
    community: `${project.state} Community ${index + 1}`,
    officer,
    dueDate,
    latitude: latitude + index * 0.0012,
    longitude: longitude + index * 0.001,
    geofenceRadius: 250,
    status: "Assigned",
    syncStatus: "synced",
    audit: [
      {
        id: uid("audit"),
        at: now,
        actor: "Ibrahim Musa",
        action: `Assigned to ${officer}`,
        deviceId: getDeviceId(),
        deviceType: getDeviceType(),
      },
    ],
  };
}

function createDemoComponentValues(
  assignment: InspectionAssignment,
  project: Project,
  status: AssignmentStatus,
  seed: number,
) {
  if (!isSupportedAssignmentComponent(assignment.component)) return {};
  const values = createComponentFormValues(assignment.component, assignment);
  const completed = ["Submitted", "Approved", "Verified"].includes(status);
  for (const field of getComponentFieldDefinitions(assignment.component)) {
    if (values[field.key]) continue;
    if (field.kind === "select") {
      values[field.key] =
        field.key === "status"
          ? completed
            ? "Completed"
            : "Ongoing"
          : (field.options?.[seed % (field.options?.length || 1)] ?? "");
    } else if (field.kind === "integer") {
      values[field.key] = String(2 + ((seed * 7 + field.key.length) % 24));
    } else if (field.kind === "decimal") {
      values[field.key] = String(
        Number((12.5 + ((seed * 19 + field.key.length) % 380)).toFixed(2)),
      );
    } else if (field.kind === "phone") {
      values[field.key] = `0803${String(1000000 + seed).padStart(7, "0")}`;
    } else {
      values[field.key] = "Demo field record";
    }
  }
  values.startDateYear = "2025";
  values.startDateMonth = "March";
  values.completionDateYear = completed ? "2026" : "2027";
  values.completionDateMonth = completed ? "July" : "December";
  values.publicInstitutionHospitals = String(1 + (seed % 3));
  values.publicInstitutionSchools = String(2 + (seed % 5));
  values.publicInstitutionPublicFacilities = String(1 + (seed % 4));
  if (assignment.component === "Grid Extension") {
    values.communitiesElectrifiedByGridExtension = String(3 + (seed % 6));
    values.transformersKva200 = "2";
    values.transformersKva300 = "1";
    values.transformersKva500 = "1";
    values.transformersKva7500 = "0";
    values.transformersKva15000 = "0";
    values.totalTransformerCapacityKva = "1200";
    values.kmOfNetworkBuilt = "18.6";
    values.numberOfPoles = "84";
    values.totalProjectCostNaira = "485000000";
  }
  if (assignment.component === "Mini Grid") {
    values.typeOfMiniGrid = seed % 2 ? "Interconnected" : "Isolated";
    values.totalNumberOfConnections = String(project.households);
    values.residentialConnections = String(
      Math.round(project.households * 0.78),
    );
    values.commercialPueConnections = String(
      project.households - Math.round(project.households * 0.78),
    );
    values.tariff = "185.5";
    values.totalProjectCostDollar = "425000";
    values.totalProjectCostNaira = "637500000";
    values.grantPerConnection = "580";
    values.numberOfMiniGrid = "1";
    values.installedPvKwp = String(project.kw);
    values.inverterCapacityKw = String(Math.round(project.kw * 0.82));
    values.batteryCapacityKwh = String(Math.round(project.kw * 3.4));
  }
  if (assignment.component === "SAS") {
    values.customerName = ["Aisha Musa", "Emeka Obi", "Bola Adeyemi"][seed % 3];
    values.genderOfCustomer = seed % 2 ? "Female" : "Male";
    values.customerPhoneNumber = `0803${String(1000000 + seed).padStart(7, "0")}`;
    values.typeOfConnection = seed % 2 ? "Residential" : "Commercial / PUE";
    values.totalProjectCostNaira = "1850000";
    values.grantPerConnection = "95000";
    values.numberOfSasUnits = String(project.households);
    values.installedPvKwp = String(project.kw);
    values.batteryCapacityH = "8";
  }
  return values;
}

function attachDemoReport(
  assignment: InspectionAssignment,
  project: Project,
  status: Exclude<
    AssignmentStatus,
    "Assigned" | "En route" | "Arrived" | "Re-inspection"
  >,
  seed: number,
) {
  if (!isSupportedAssignmentComponent(assignment.component)) return assignment;
  const now = new Date(Date.now() - seed * 3_600_000).toISOString();
  assignment.status = status;
  assignment.arrival = {
    latitude: assignment.latitude,
    longitude: assignment.longitude,
    at: now,
    distance: 0,
  };
  assignment.report = {
    assignmentId: assignment.id,
    assignedComponent: assignment.component,
    componentValues: createDemoComponentValues(
      assignment,
      project,
      status,
      seed,
    ),
    projectId: assignment.id,
    contractor: assignment.contractor,
    state: assignment.state,
    lga: assignment.lga,
    community: assignment.community,
    inspectedAt: now,
    latitude: assignment.latitude,
    longitude: assignment.longitude,
    inspector: assignment.officer,
    deviceId: getDeviceId(),
    deviceType: getDeviceType(),
    assetCode: `${assignment.id}-ASSET-01`,
    evidence: [
      {
        id: uid("transformer"),
        name: "transformer-installation-demo.svg",
        type: "photo",
        capturedAt: now,
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        projectId: assignment.id,
        inspector: assignment.officer,
        deviceId: getDeviceId(),
        deviceType: getDeviceType(),
        previewUrl: "/demo-evidence/transformer.svg",
      },
      {
        id: uid("inverter"),
        name: "inverter-installation-demo.svg",
        type: "photo",
        capturedAt: now,
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        projectId: assignment.id,
        inspector: assignment.officer,
        deviceId: getDeviceId(),
        deviceType: getDeviceType(),
        previewUrl: "/demo-evidence/inverter.svg",
      },
    ],
    communitySignature: "demo-community-signature",
    contractorSignature: "demo-contractor-signature",
    submittedAt: status === "Draft" ? undefined : now,
    reviewNote:
      status === "Approved"
        ? "Approved by Consultant Admin after QA review."
        : status === "Verified"
          ? "Verified by REA after consultant approval."
          : undefined,
  };
  if (
    status === "Submitted" ||
    status === "Approved" ||
    status === "Verified"
  ) {
    assignment.audit.push({
      id: uid("audit"),
      at: now,
      actor: assignment.officer,
      action: "Inspection submitted for QA",
      deviceId: getDeviceId(),
      deviceType: getDeviceType(),
    });
  }
  if (status === "Approved" || status === "Verified") {
    assignment.audit.push({
      id: uid("audit"),
      at: now,
      actor: "Ibrahim Musa",
      action: "Report approved after QA",
      deviceId: getDeviceId(),
      deviceType: getDeviceType(),
    });
  }
  if (status === "Verified") {
    assignment.audit.push({
      id: uid("audit"),
      at: now,
      actor: "REA Administrator",
      action: "Report verified by REA",
      deviceId: getDeviceId(),
      deviceType: getDeviceType(),
    });
  }
  return assignment;
}

export function createComponentTestAssignments() {
  const today = new Date();
  const fixtures: Array<{
    project: Project;
    baseIndex: number;
    lga: string;
    community: string;
  }> = [
    {
      project: {
        name: "NEP Kano Mini Grid Test",
        state: "Kano",
        programme: "NEP",
        component: "Mini Grid",
        contractor: "SunVolt Nigeria",
        month: "August 2026",
        status: "Assigned",
        tone: "progress",
        kw: 250,
        households: 730,
        verified: false,
        x: 0,
        y: 0,
      },
      baseIndex: 900,
      lga: "Kano Municipal",
      community: "Kofar Ruwa",
    },
    {
      project: {
        name: "DARES Kaduna Grid Extension Test",
        state: "Kaduna",
        programme: "DARES",
        component: "Grid Extension",
        contractor: "NorthGrid EPC",
        month: "August 2026",
        status: "Assigned",
        tone: "progress",
        kw: 500,
        households: 1_200,
        verified: false,
        x: 0,
        y: 0,
      },
      baseIndex: 910,
      lga: "Kaduna North",
      community: "Kawo",
    },
    {
      project: {
        name: "AMP Katsina SAS Test",
        state: "Katsina",
        programme: "AMP",
        component: "SAS",
        contractor: "Apex Power Works",
        month: "August 2026",
        status: "Assigned",
        tone: "progress",
        kw: 85,
        households: 320,
        verified: false,
        x: 0,
        y: 0,
      },
      baseIndex: 920,
      lga: "Katsina",
      community: "Kofar Sauri",
    },
  ];
  const lifecycleStatuses = [
    "Assigned",
    "Draft",
    "Submitted",
    "Approved",
    "Verified",
  ] as const;
  return fixtures.flatMap(
    ({ project: baseProject, baseIndex, lga, community }, fixtureIndex) =>
      lifecycleStatuses.map((status, statusIndex) => {
        const project = {
          ...baseProject,
          name: `${baseProject.name} — ${status}`,
          status,
          verified: status === "Verified",
        };
        const due = new Date(today);
        due.setDate(today.getDate() + fixtureIndex + statusIndex + 1);
        const assignment = createAssignment(
          project,
          "Amina Yusuf",
          due.toISOString(),
          baseIndex + statusIndex,
        );
        assignment.lga = lga;
        assignment.community = community;
        const [latitude, longitude] = stateCentres[project.state];
        assignment.latitude = latitude + fixtureIndex * 0.0012;
        assignment.longitude = longitude + fixtureIndex * 0.001;
        return status === "Assigned"
          ? assignment
          : attachDemoReport(
              assignment,
              project,
              status,
              baseIndex + statusIndex,
            );
      }),
  );
}

function ensureComponentTestAssignments(assignments: InspectionAssignment[]) {
  const fixtures = createComponentTestAssignments();
  const fixtureNames = new Set(
    fixtures.map((assignment) => assignment.projectName),
  );
  const legacyFixtureNames = new Set([
    "NEP Kano Mini Grid Test",
    "DARES Kaduna Grid Extension Test",
    "AMP Katsina SAS Test",
  ]);
  const existingFixtures = new Map(
    assignments
      .filter((assignment) => fixtureNames.has(assignment.projectName))
      .map((assignment) => [assignment.projectName, assignment]),
  );
  assignments
    .filter((assignment) => legacyFixtureNames.has(assignment.projectName))
    .forEach((assignment) => {
      const nextName = `${assignment.projectName} — Assigned`;
      if (!existingFixtures.has(nextName)) {
        existingFixtures.set(nextName, {
          ...assignment,
          projectName: nextName,
        });
      }
    });
  return [
    ...fixtures.map(
      (fixture) => existingFixtures.get(fixture.projectName) ?? fixture,
    ),
    ...assignments.filter(
      (assignment) =>
        !fixtureNames.has(assignment.projectName) &&
        !legacyFixtureNames.has(assignment.projectName),
    ),
  ];
}

function seedAssignments() {
  const preferred = projects.filter(
    (project) =>
      ["Kano", "Kaduna", "Katsina", "Sokoto", "Zamfara", "Jigawa"].includes(
        project.state,
      ) &&
      ["NEP", "AMP", "DARES"].includes(project.programme) &&
      isSupportedAssignmentComponent(
        normalizeAssignmentComponent(project.component),
      ),
  );
  const today = new Date();
  const seeded = preferred.slice(2, 14).map((project, index) => {
    const due = new Date(today);
    due.setDate(today.getDate() + (index % 7));
    const assignment = createAssignment(
      project,
      "Amina Yusuf",
      due.toISOString(),
      index,
    );
    if (index === 1 || index === 2 || index === 3 || index === 4) {
      const status =
        index === 1
          ? "Draft"
          : index === 2
            ? "Submitted"
            : index === 3
              ? "Approved"
              : "Verified";
      return attachDemoReport(assignment, project, status, index + 30);
    }
    return assignment;
  });
  return ensureComponentTestAssignments(seeded);
}

type WorkflowContextValue = {
  assignments: InspectionAssignment[];
  fieldOfficers: FieldOfficerAccount[];
  isOnline: boolean;
  assignProject: (
    project: Project,
    officer: string,
    dueDate: string,
  ) => InspectionAssignment | null;
  createFieldOfficer: (
    account: Pick<
      FieldOfficerAccount,
      "name" | "email" | "phone" | "zone" | "device" | "password"
    >,
  ) => { ok: boolean; message: string };
  setFieldOfficerStatus: (
    id: string,
    status: FieldOfficerAccount["status"],
  ) => void;
  startRoute: (id: string) => void;
  verifyArrival: (
    id: string,
    latitude: number,
    longitude: number,
  ) => { allowed: boolean; distance: number };
  saveReport: (id: string, report: InspectionReport) => void;
  submitReport: (id: string, report: InspectionReport) => void;
  reviewReport: (
    id: string,
    decision: "Approved" | "Re-inspection",
    note: string,
  ) => void;
  reaReviewReport: (
    id: string,
    decision: "Verified" | "Rejected",
    note: string,
  ) => void;
  syncNow: () => void;
  resetDemo: () => void;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function loadFieldOfficers() {
  if (typeof window === "undefined") return defaultFieldOfficers;
  try {
    const stored = window.localStorage.getItem(FIELD_OFFICERS_STORAGE_KEY);
    return stored
      ? (JSON.parse(stored) as FieldOfficerAccount[])
      : defaultFieldOfficers;
  } catch {
    return defaultFieldOfficers;
  }
}

function loadAssignments() {
  if (typeof window === "undefined") return seedAssignments();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? ensureComponentTestAssignments(
          (JSON.parse(stored) as InspectionAssignment[]).map(
            migrateStoredAssignment,
          ),
        )
      : seedAssignments();
  } catch {
    return seedAssignments();
  }
}

export function migrateStoredAssignment(
  storedAssignment: InspectionAssignment,
): InspectionAssignment {
  const component = normalizeAssignmentComponent(storedAssignment.component);
  const assignment = { ...storedAssignment, component };
  if (!assignment.report || !isSupportedAssignmentComponent(component)) {
    return assignment;
  }
  const existing = assignment.report as InspectionReport & {
    assignmentId?: string;
    assignedComponent?: string;
    componentValues?: ComponentFormValues;
  };
  if (
    existing.assignmentId === assignment.id &&
    existing.assignedComponent === component &&
    existing.componentValues
  ) {
    if (validateComponentFormValues(component, existing.componentValues)) {
      return assignment;
    }
    const defaults = createDemoComponentValues(
      assignment,
      {
        name: assignment.projectName,
        state: assignment.state,
        programme: assignment.programme,
        component,
        contractor: assignment.contractor,
        month: "August 2026",
        status: assignment.status,
        tone: "progress",
        kw: Number(existing.capacity?.match(/\d+(?:\.\d+)?/)?.[0] ?? 100),
        households: Number(existing.beneficiaries ?? 100),
        verified: assignment.status === "Verified",
        x: 0,
        y: 0,
      },
      assignment.status,
      7,
    );
    return {
      ...assignment,
      report: {
        ...existing,
        componentValues: Object.fromEntries(
          Object.entries(defaults).map(([key, value]) => [
            key,
            existing.componentValues?.[key] || value,
          ]),
        ),
      },
    };
  }
  const componentValues = createComponentFormValues(component, assignment);
  componentValues.status =
    assignment.status === "Verified" || assignment.status === "Approved"
      ? "Completed"
      : "Ongoing";
  const numberFromLegacy = (value?: string) =>
    value?.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
  if (component === "Grid Extension") {
    componentValues.numberOfPoles = numberFromLegacy(existing.poleCount);
    componentValues.kmOfNetworkBuilt = numberFromLegacy(existing.cableLength);
    componentValues.totalTransformerCapacityKva = numberFromLegacy(
      existing.transformerDetails,
    );
  }
  if (component === "Mini Grid") {
    componentValues.installedPvKwp = numberFromLegacy(existing.capacity);
    componentValues.totalNumberOfConnections = numberFromLegacy(
      existing.beneficiaries,
    );
  }
  if (component === "SAS") {
    componentValues.installedPvKwp = numberFromLegacy(existing.capacity);
    componentValues.numberOfSasUnits = numberFromLegacy(existing.beneficiaries);
  }
  return {
    ...assignment,
    report: {
      ...existing,
      assignmentId: assignment.id,
      assignedComponent: component,
      componentValues,
    },
  };
}

export function InspectionWorkflowProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [assignments, setAssignments] =
    useState<InspectionAssignment[]>(loadAssignments);
  const [fieldOfficers, setFieldOfficers] =
    useState<FieldOfficerAccount[]>(loadFieldOfficers);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
    } catch {
      // Large camera files can exceed the demo browser quota. They remain
      // available in the current session and can still be reviewed.
    }
  }, [assignments]);

  useEffect(() => {
    window.localStorage.setItem(
      FIELD_OFFICERS_STORAGE_KEY,
      JSON.stringify(fieldOfficers),
    );
  }, [fieldOfficers]);

  useEffect(() => {
    const synchronizeRoleTabs = (event: StorageEvent) => {
      if (!event.newValue) return;
      try {
        if (event.key === STORAGE_KEY) {
          const incoming = JSON.parse(event.newValue) as InspectionAssignment[];
          setAssignments((current) =>
            JSON.stringify(current) === event.newValue ? current : incoming,
          );
        }
        if (event.key === FIELD_OFFICERS_STORAGE_KEY) {
          const incoming = JSON.parse(event.newValue) as FieldOfficerAccount[];
          setFieldOfficers((current) =>
            JSON.stringify(current) === event.newValue ? current : incoming,
          );
        }
      } catch {
        // Ignore malformed external storage events.
      }
    };
    window.addEventListener("storage", synchronizeRoleTabs);
    return () => window.removeEventListener("storage", synchronizeRoleTabs);
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.syncStatus === "queued"
          ? {
              ...assignment,
              syncStatus: "synced",
              audit: [
                ...assignment.audit,
                {
                  id: uid("audit"),
                  at: new Date().toISOString(),
                  actor: "System",
                  action: "Offline data synchronized",
                  deviceId: getDeviceId(),
                  deviceType: getDeviceType(),
                },
              ],
            }
          : assignment,
      ),
    );
  }, [isOnline]);

  const update = useCallback(
    (
      id: string,
      mutate: (assignment: InspectionAssignment) => InspectionAssignment,
    ) =>
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === id ? mutate(assignment) : assignment,
        ),
      ),
    [],
  );

  const assignProject = useCallback(
    (project: Project, officer: string, dueDate: string) => {
      if (
        !fieldOfficers.some(
          (account) => account.name === officer && account.status === "Active",
        )
      ) {
        return null;
      }
      const assignment = createAssignment(
        project,
        officer,
        dueDate,
        assignments.length,
      );
      setAssignments((current) => [
        assignment,
        ...current.filter((item) => item.id !== assignment.id),
      ]);
      return assignment;
    },
    [assignments.length, fieldOfficers],
  );

  const createFieldOfficer = useCallback(
    (
      account: Pick<
        FieldOfficerAccount,
        "name" | "email" | "phone" | "zone" | "device" | "password"
      >,
    ) => {
      const name = account.name.trim();
      const email = account.email.trim().toLowerCase();
      if (!name || !email || !account.zone || !account.password) {
        return { ok: false, message: "Complete all required officer fields." };
      }
      if (
        fieldOfficers.some(
          (officer) =>
            officer.email.toLowerCase() === email ||
            officer.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        return {
          ok: false,
          message: "A field officer with this name or email already exists.",
        };
      }
      setFieldOfficers((current) => [
        {
          ...account,
          id: uid("officer"),
          name,
          email,
          phone: account.phone.trim(),
          zone: account.zone.trim(),
          device: account.device.trim(),
          status: "Active",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      return { ok: true, message: "Field officer created." };
    },
    [fieldOfficers],
  );

  const setFieldOfficerStatus = useCallback(
    (id: string, status: FieldOfficerAccount["status"]) =>
      setFieldOfficers((current) =>
        current.map((officer) =>
          officer.id === id ? { ...officer, status } : officer,
        ),
      ),
    [],
  );

  const startRoute = useCallback(
    (id: string) =>
      update(id, (assignment) =>
        !canStartRoute(assignment.status)
          ? assignment
          : {
              ...assignment,
              routeStartedAt: new Date().toISOString(),
              audit: [
                ...assignment.audit,
                {
                  id: uid("audit"),
                  at: new Date().toISOString(),
                  actor: assignment.officer,
                  action: "Navigation started",
                  deviceId: getDeviceId(),
                  deviceType: getDeviceType(),
                },
              ],
            },
      ),
    [update],
  );

  const verifyArrival = useCallback(
    (id: string, latitude: number, longitude: number) => {
      const assignment = assignments.find((item) => item.id === id);
      if (!assignment) return { allowed: false, distance: 0 };
      if (!canVerifyArrival(assignment.status)) {
        return { allowed: false, distance: 0 };
      }
      const distance = distanceMeters(
        { latitude, longitude },
        { latitude: assignment.latitude, longitude: assignment.longitude },
      );
      const allowed = distance <= assignment.geofenceRadius;
      update(id, (current) => ({
        ...current,
        arrival: allowed
          ? { latitude, longitude, at: new Date().toISOString(), distance }
          : current.arrival,
        audit: [
          ...current.audit,
          {
            id: uid("audit"),
            at: new Date().toISOString(),
            actor: current.officer,
            action: allowed
              ? `Arrival verified within geofence (${distance} m)`
              : `Arrival blocked outside geofence (${distance} m)`,
            deviceId: getDeviceId(),
            deviceType: getDeviceType(),
          },
        ],
      }));
      return { allowed, distance };
    },
    [assignments, update],
  );

  const saveReport = useCallback(
    (id: string, report: InspectionReport) =>
      update(id, (assignment) => {
        if (
          !canEditReport(assignment) ||
          !isSupportedAssignmentComponent(assignment.component) ||
          report.assignmentId !== assignment.id ||
          report.assignedComponent !== assignment.component
        ) {
          return assignment;
        }
        const safeReport = {
          ...report,
          assignmentId: assignment.id,
          assignedComponent: assignment.component,
          componentValues: sanitizeComponentFormValues(
            assignment.component,
            report.componentValues,
          ),
        };
        return {
          ...assignment,
          report: safeReport,
          status: "Draft",
          syncStatus: isOnline ? "synced" : "queued",
          audit: [
            ...assignment.audit,
            {
              id: uid("audit"),
              at: new Date().toISOString(),
              actor: assignment.officer,
              action: "Inspection draft saved",
              deviceId: getDeviceId(),
              deviceType: getDeviceType(),
            },
          ],
        };
      }),
    [isOnline, update],
  );

  const submitReport = useCallback(
    (id: string, report: InspectionReport) =>
      update(id, (assignment) => {
        if (!canSubmitReport(assignment, report)) {
          return assignment;
        }
        if (!isSupportedAssignmentComponent(assignment.component)) {
          return assignment;
        }
        const safeReport = {
          ...report,
          assignmentId: assignment.id,
          assignedComponent: assignment.component,
          componentValues: sanitizeComponentFormValues(
            assignment.component,
            report.componentValues,
          ),
          submittedAt: new Date().toISOString(),
        };
        return {
          ...assignment,
          report: safeReport,
          status: "Submitted",
          syncStatus: isOnline ? "synced" : "queued",
          audit: [
            ...assignment.audit,
            {
              id: uid("audit"),
              at: new Date().toISOString(),
              actor: assignment.officer,
              action: isOnline
                ? "Inspection submitted for QA"
                : "Submission queued offline",
              deviceId: getDeviceId(),
              deviceType: getDeviceType(),
            },
          ],
        };
      }),
    [isOnline, update],
  );

  const reviewReport = useCallback(
    (id: string, decision: "Approved" | "Re-inspection", note: string) =>
      update(id, (assignment) => {
        if (!canReviewReport(assignment.status)) return assignment;
        if (decision === "Re-inspection" && !note.trim()) return assignment;
        return {
          ...assignment,
          status: decision,
          arrival:
            decision === "Re-inspection" ? undefined : assignment.arrival,
          routeStartedAt:
            decision === "Re-inspection"
              ? undefined
              : assignment.routeStartedAt,
          report: assignment.report
            ? { ...assignment.report, reviewNote: note }
            : assignment.report,
          audit: [
            ...assignment.audit,
            {
              id: uid("audit"),
              at: new Date().toISOString(),
              actor: "Ibrahim Musa",
              action:
                decision === "Approved"
                  ? "Report approved after QA"
                  : "Returned for re-inspection",
              deviceId: getDeviceId(),
              deviceType: getDeviceType(),
            },
          ],
        };
      }),
    [update],
  );

  const reaReviewReport = useCallback(
    (id: string, decision: "Verified" | "Rejected", note: string) =>
      update(id, (assignment) => {
        if (!canReaReviewReport(assignment.status)) return assignment;
        if (decision === "Rejected" && !note.trim()) return assignment;
        const reviewedAt = new Date().toISOString();
        return {
          ...assignment,
          status: decision,
          report: assignment.report
            ? {
                ...assignment.report,
                reaReviewNote: note.trim(),
                reaReviewedAt: reviewedAt,
              }
            : assignment.report,
          audit: [
            ...assignment.audit,
            {
              id: uid("audit"),
              at: reviewedAt,
              actor: "REA Administrator",
              action:
                decision === "Verified"
                  ? "Report verified by REA"
                  : `Report rejected by REA: ${note.trim()}`,
              deviceId: getDeviceId(),
              deviceType: getDeviceType(),
            },
          ],
        };
      }),
    [update],
  );

  const syncNow = useCallback(() => {
    if (!isOnline) return;
    setAssignments((current) =>
      current.map((assignment) => ({ ...assignment, syncStatus: "synced" })),
    );
  }, [isOnline]);

  const resetDemo = useCallback(() => setAssignments(seedAssignments()), []);

  const value = useMemo(
    () => ({
      assignments,
      fieldOfficers,
      isOnline,
      assignProject,
      createFieldOfficer,
      setFieldOfficerStatus,
      startRoute,
      verifyArrival,
      saveReport,
      submitReport,
      reviewReport,
      reaReviewReport,
      syncNow,
      resetDemo,
    }),
    [
      assignments,
      fieldOfficers,
      isOnline,
      assignProject,
      createFieldOfficer,
      setFieldOfficerStatus,
      startRoute,
      verifyArrival,
      saveReport,
      submitReport,
      reviewReport,
      reaReviewReport,
      syncNow,
      resetDemo,
    ],
  );
  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useInspectionWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context)
    throw new Error(
      "useInspectionWorkflow must be used inside InspectionWorkflowProvider",
    );
  return context;
}
