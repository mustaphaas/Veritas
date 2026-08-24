import { projects } from "./dashboard-data";
import { defaultFieldOfficers } from "./inspection-workflow";

export type ConsultantStatus = "Active" | "Inactive" | "Pending Activation";

export type ConsultantRecord = {
  id: string;
  firmName: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  regions: string[];
  states: string[];
  status: ConsultantStatus;
  engagementRef: string;
  scopeNote?: string;
  engagementStart?: string;
  engagementEnd?: string;
  temporaryPassword: string;
};

export type ConsultantActivity = {
  id: string;
  consultantId: string;
  timestamp: string;
  action: string;
  details: string;
  actor: string;
  tone: "success" | "info" | "warning";
};

export const CONSULTANTS_STORAGE_KEY = "veritas-consultants";
export const CONSULTANT_ACTIVITY_STORAGE_KEY = "veritas-consultant-activity";

export const defaultConsultants: ConsultantRecord[] = [
  { id: "con-001", firmName: "Oyelaran & Co", adminName: "Tunde Oyelaran", adminEmail: "admin@oyelaran.ng", adminPhone: "0803 145 2190", regions: ["North West"], states: ["Kano", "Kaduna", "Katsina", "Jigawa"], status: "Active", engagementRef: "REA/CONS/2026/001", scopeNote: "Independent verification and QA support for DARES sites.", engagementStart: "2026-01-15", engagementEnd: "2026-12-31", temporaryPassword: "Consult2026!" },
  { id: "con-002", firmName: "Meridian Energy Advisory", adminName: "Aisha Lawal", adminEmail: "aisha@meridianenergy.ng", adminPhone: "0806 220 4188", regions: ["North Central"], states: ["Niger", "Kwara", "Kogi", "Nasarawa", "FCT"], status: "Active", engagementRef: "REA/CONS/2026/004", scopeNote: "Verification oversight for grid extension and mini-grid projects.", engagementStart: "2026-02-01", engagementEnd: "2027-01-31", temporaryPassword: "Consult2026!" },
  { id: "con-003", firmName: "GreenField Technical Partners", adminName: "Ngozi Eze", adminEmail: "ngozi@greenfieldtp.ng", adminPhone: "0805 711 3094", regions: ["South East", "South South"], states: ["Abia", "Anambra", "Enugu", "Imo", "Rivers", "Delta"], status: "Pending Activation", engagementRef: "REA/CONS/2026/009", scopeNote: "New consultant mobilisation pending credential activation.", engagementStart: "2026-09-01", temporaryPassword: "Consult2026!" },
];

export const defaultConsultantActivity: ConsultantActivity[] = [
  { id: "ca-001", consultantId: "con-001", timestamp: "2026-08-24T14:42:00.000Z", action: "Report approved", details: "Kano Mini Grid Project 04 approved after QA review", actor: "Tunde Oyelaran", tone: "success" },
  { id: "ca-002", consultantId: "con-001", timestamp: "2026-08-23T09:18:00.000Z", action: "Field officer assigned", details: "Amina Yusuf assigned to Kaduna verification batch", actor: "Tunde Oyelaran", tone: "info" },
  { id: "ca-003", consultantId: "con-002", timestamp: "2026-08-22T16:03:00.000Z", action: "Report returned", details: "Niger Grid Extension Project 03 returned for re-inspection", actor: "Aisha Lawal", tone: "warning" },
];

export function readConsultants(): ConsultantRecord[] {
  if (typeof window === "undefined") return defaultConsultants;
  try { const raw = localStorage.getItem(CONSULTANTS_STORAGE_KEY); return raw ? JSON.parse(raw) as ConsultantRecord[] : defaultConsultants; }
  catch { return defaultConsultants; }
}

export function writeConsultants(records: ConsultantRecord[]) {
  if (typeof window !== "undefined") localStorage.setItem(CONSULTANTS_STORAGE_KEY, JSON.stringify(records));
}

export function readConsultantActivity(): ConsultantActivity[] {
  if (typeof window === "undefined") return defaultConsultantActivity;
  try { const raw = localStorage.getItem(CONSULTANT_ACTIVITY_STORAGE_KEY); return raw ? JSON.parse(raw) as ConsultantActivity[] : defaultConsultantActivity; }
  catch { return defaultConsultantActivity; }
}

export function appendConsultantActivity(event: Omit<ConsultantActivity, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  const next: ConsultantActivity = { ...event, id: `ca-${Date.now()}`, timestamp: new Date().toISOString() };
  localStorage.setItem(CONSULTANT_ACTIVITY_STORAGE_KEY, JSON.stringify([next, ...readConsultantActivity()].slice(0, 300)));
}

export function consultantMetrics(record: ConsultantRecord) {
  const assignedProjects = projects.filter((p) => record.states.includes(p.state));
  const fieldOfficers = defaultFieldOfficers.filter((_, index) => index % Math.max(1, defaultConsultants.length) === defaultConsultants.findIndex((c) => c.id === record.id));
  const reviewed = assignedProjects.filter((p) => p.status !== "In progress").length;
  const approved = assignedProjects.filter((p) => p.verified).length;
  const approvalRate = reviewed ? Math.round((approved / reviewed) * 100) : 0;
  const averageTurnaroundHours = Math.max(6, 34 - (record.id.charCodeAt(record.id.length - 1) % 16));
  const reinspectionRate = Math.max(2, 18 - (approvalRate % 11));
  return { fieldOfficers, assignedProjects, reviewed, approved, approvalRate, averageTurnaroundHours, reinspectionRate };
}
