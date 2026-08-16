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

export type AssignmentStatus =
  | "Assigned"
  | "En route"
  | "Arrived"
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Verified"
  | "Re-inspection";

export type AssignmentDisplayStatus =
  "Assigned" | "Draft" | "Approved" | "Verified";

export function getAssignmentDisplayStatus(
  status: AssignmentStatus,
): AssignmentDisplayStatus {
  if (status === "Approved") return "Approved";
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
    status === "Submitted" || status === "Approved" || status === "Verified"
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
    report.evidence.length > 0 &&
    Boolean(report.communitySignature) &&
    Boolean(report.contractorSignature)
  );
}

export function canReviewReport(status: AssignmentStatus) {
  return status === "Submitted";
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
  equipmentInstalled: string;
  capacity: string;
  meterDetails: string;
  transformerDetails: string;
  poleCount: string;
  cableLength: string;
  beneficiaries: string;
  observations: string;
  defects: string;
  recommendations: string;
  assetCode: string;
  evidence: EvidenceItem[];
  communitySignature?: string;
  contractorSignature?: string;
  submittedAt?: string;
  reviewNote?: string;
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

export const fieldOfficers = [
  { name: "Amina Yusuf", zone: "North West", device: "REA-AY-1042" },
  { name: "Chinedu Okafor", zone: "South East", device: "REA-CO-1178" },
  { name: "Fatima Bello", zone: "North East", device: "REA-FB-1094" },
  { name: "Tunde Adebayo", zone: "South West", device: "REA-TA-1210" },
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
  return {
    id,
    projectName: project.name,
    programme: project.programme,
    component: project.component,
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

function seedAssignments() {
  const preferred = projects.filter((project) =>
    ["Kano", "Kaduna", "Katsina", "Sokoto", "Zamfara", "Jigawa"].includes(
      project.state,
    ),
  );
  const today = new Date();
  return preferred.slice(2, 14).map((project, index) => {
    const due = new Date(today);
    due.setDate(today.getDate() + (index % 7));
    const assignment = createAssignment(
      project,
      "Amina Yusuf",
      due.toISOString(),
      index,
    );
    if (index === 1 || index === 2 || index === 3 || index === 4) {
      assignment.status =
        index === 1
          ? "Draft"
          : index === 2
            ? "Submitted"
            : index === 3
              ? "Approved"
              : "Verified";
      assignment.arrival = {
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        at: new Date().toISOString(),
        distance: 0,
      };
      assignment.report = {
        projectId: assignment.id,
        contractor: assignment.contractor,
        state: assignment.state,
        lga: assignment.lga,
        community: assignment.community,
        inspectedAt: new Date().toISOString(),
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        inspector: assignment.officer,
        deviceId: getDeviceId(),
        deviceType: getDeviceType(),
        equipmentInstalled: "Solar modules, inverter and distribution board",
        capacity: `${project.kw} kW`,
        meterDetails: "Smart prepaid meter installed and commissioned",
        transformerDetails: "500 kVA distribution transformer",
        poleCount: "18",
        cableLength: "2.4 km",
        beneficiaries: String(project.households),
        observations:
          "Installation is operational and major equipment matches the approved schedule.",
        defects: "Minor cable labelling and warning signage outstanding.",
        recommendations:
          "Complete cable labels and safety signage before final handover.",
        assetCode: `${assignment.id}-ASSET-01`,
        evidence: [
          {
            id: uid("evidence"),
            name: "site-overview.jpg",
            type: "photo",
            capturedAt: new Date().toISOString(),
            latitude: assignment.latitude,
            longitude: assignment.longitude,
            projectId: assignment.id,
            inspector: assignment.officer,
            deviceId: getDeviceId(),
            deviceType: getDeviceType(),
          },
        ],
        communitySignature: "demo-community-signature",
        contractorSignature: "demo-contractor-signature",
        submittedAt: index === 1 ? undefined : new Date().toISOString(),
      };
    }
    return assignment;
  });
}

type WorkflowContextValue = {
  assignments: InspectionAssignment[];
  isOnline: boolean;
  assignProject: (
    project: Project,
    officer: string,
    dueDate: string,
  ) => InspectionAssignment;
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
  syncNow: () => void;
  resetDemo: () => void;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function loadAssignments() {
  if (typeof window === "undefined") return seedAssignments();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? (JSON.parse(stored) as InspectionAssignment[])
      : seedAssignments();
  } catch {
    return seedAssignments();
  }
}

export function InspectionWorkflowProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [assignments, setAssignments] =
    useState<InspectionAssignment[]>(loadAssignments);
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
    const synchronizeRoleTabs = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const incoming = JSON.parse(event.newValue) as InspectionAssignment[];
        setAssignments((current) =>
          JSON.stringify(current) === event.newValue ? current : incoming,
        );
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
    [assignments.length],
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
        if (!canEditReport(assignment)) {
          return assignment;
        }
        return {
          ...assignment,
          report,
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
        return {
          ...assignment,
          report: { ...report, submittedAt: new Date().toISOString() },
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
      isOnline,
      assignProject,
      startRoute,
      verifyArrival,
      saveReport,
      submitReport,
      reviewReport,
      syncNow,
      resetDemo,
    }),
    [
      assignments,
      isOnline,
      assignProject,
      startRoute,
      verifyArrival,
      saveReport,
      submitReport,
      reviewReport,
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
