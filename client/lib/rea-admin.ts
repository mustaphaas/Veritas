export type ReaStaffRole = "REA Administrator" | "Programme Manager" | "Verification Officer" | "Claims Officer" | "Analyst" | "Viewer";
export type ReaStaffStatus = "Active" | "Suspended" | "Invited";

export type ReaStaffAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  role: ReaStaffRole;
  status: ReaStaffStatus;
  password: string;
  lastLogin?: string;
  createdAt: string;
  access: string[];
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  category: "Authentication" | "User Management" | "Access Control" | "Claims" | "Verification" | "System";
  target: string;
  details: string;
  severity: "Info" | "Success" | "Warning" | "Critical";
};

export const REA_STAFF_STORAGE_KEY = "veritas-rea-staff-accounts";
export const REA_AUDIT_STORAGE_KEY = "veritas-rea-audit-trail";

export const reaAccessModules = ["Overview", "Claims", "Verification", "Contractors", "Analytics", "Reports", "Users", "Audit Trail"];

export const defaultReaStaff: ReaStaffAccount[] = [
  {
    id: "rea-admin-001",
    name: "REA Administrator",
    email: "rea.admin@demo.ng",
    department: "ICT / Administration",
    role: "REA Administrator",
    status: "Active",
    password: "REA2024!",
    lastLogin: "Today, 10:24 AM",
    createdAt: "2026-01-10T08:30:00.000Z",
    access: [...reaAccessModules],
  },
  {
    id: "rea-pm-002",
    name: "Fatima Bello",
    email: "fatima.bello@rea.gov.ng",
    department: "Programme Delivery",
    role: "Programme Manager",
    status: "Active",
    password: "ChangeMe2026!",
    lastLogin: "Yesterday, 4:18 PM",
    createdAt: "2026-03-03T09:00:00.000Z",
    access: ["Overview", "Claims", "Verification", "Contractors", "Analytics", "Reports"],
  },
  {
    id: "rea-ver-003",
    name: "Chinedu Okafor",
    email: "chinedu.okafor@rea.gov.ng",
    department: "Monitoring & Evaluation",
    role: "Verification Officer",
    status: "Active",
    password: "ChangeMe2026!",
    lastLogin: "2 days ago",
    createdAt: "2026-04-12T11:15:00.000Z",
    access: ["Overview", "Verification", "Analytics", "Reports"],
  },
  {
    id: "rea-claims-004",
    name: "Zainab Musa",
    email: "zainab.musa@rea.gov.ng",
    department: "Finance / Claims",
    role: "Claims Officer",
    status: "Suspended",
    password: "ChangeMe2026!",
    lastLogin: "18 Aug 2026",
    createdAt: "2026-02-18T13:40:00.000Z",
    access: ["Overview", "Claims", "Reports"],
  },
];

export const defaultAuditEvents: AuditEvent[] = [
  { id: "audit-001", timestamp: "2026-08-25T00:18:00.000Z", actor: "REA Administrator", action: "Signed in", category: "Authentication", target: "REA Dashboard", details: "Successful administrator login", severity: "Success" },
  { id: "audit-002", timestamp: "2026-08-24T15:42:00.000Z", actor: "Fatima Bello", action: "Exported report", category: "System", target: "DARES Monthly Report", details: "Programme report export generated", severity: "Info" },
  { id: "audit-003", timestamp: "2026-08-24T13:16:00.000Z", actor: "Chinedu Okafor", action: "Verified submission", category: "Verification", target: "Kano Mini Grid Project 04", details: "Field verification report approved", severity: "Success" },
  { id: "audit-004", timestamp: "2026-08-23T11:08:00.000Z", actor: "REA Administrator", action: "Suspended account", category: "User Management", target: "Zainab Musa", details: "Account access suspended pending review", severity: "Warning" },
];

export function readReaStaff(): ReaStaffAccount[] {
  if (typeof window === "undefined") return defaultReaStaff;
  try {
    const stored = window.localStorage.getItem(REA_STAFF_STORAGE_KEY);
    return stored ? JSON.parse(stored) as ReaStaffAccount[] : defaultReaStaff;
  } catch { return defaultReaStaff; }
}

export function writeReaStaff(accounts: ReaStaffAccount[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(REA_STAFF_STORAGE_KEY, JSON.stringify(accounts));
}

export function readAuditEvents(): AuditEvent[] {
  if (typeof window === "undefined") return defaultAuditEvents;
  try {
    const stored = window.localStorage.getItem(REA_AUDIT_STORAGE_KEY);
    return stored ? JSON.parse(stored) as AuditEvent[] : defaultAuditEvents;
  } catch { return defaultAuditEvents; }
}

export function appendAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  const next: AuditEvent = { ...event, id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString() };
  const current = readAuditEvents();
  window.localStorage.setItem(REA_AUDIT_STORAGE_KEY, JSON.stringify([next, ...current].slice(0, 500)));
  window.dispatchEvent(new CustomEvent("veritas-audit-updated"));
}
