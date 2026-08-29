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

export const reaAccessModules = ["Overview", "Claims", "Verification", "Consultants", "Analytics", "Reports", "Users", "Audit Trail"];

export function normalizeReaAccess(value: unknown, fallback: string[] = []): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(
    source
      .filter((module): module is string => typeof module === "string")
      .map((module) => module === "Contractors" ? "Consultants" : module)
      .filter((module) => reaAccessModules.includes(module)),
  )];
}

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
    access: ["Overview", "Claims", "Verification", "Consultants", "Analytics", "Reports"],
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

function cloneDefaultStaff(): ReaStaffAccount[] {
  return defaultReaStaff.map((account) => ({ ...account, access: [...account.access] }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readReaStaff(): ReaStaffAccount[] {
  if (typeof window === "undefined") return cloneDefaultStaff();
  try {
    const stored = window.localStorage.getItem(REA_STAFF_STORAGE_KEY);
    if (!stored) return cloneDefaultStaff();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return cloneDefaultStaff();

    const accounts = parsed.flatMap((value, index): ReaStaffAccount[] => {
      if (!isRecord(value)) return [];
      const fallback = defaultReaStaff[index % defaultReaStaff.length];
      const role = typeof value.role === "string" && ["REA Administrator", "Programme Manager", "Verification Officer", "Claims Officer", "Analyst", "Viewer"].includes(value.role)
        ? value.role as ReaStaffRole
        : fallback.role;
      const status = value.status === "Suspended" || value.status === "Invited" ? value.status : "Active";
      return [{
        id: typeof value.id === "string" && value.id ? value.id : `rea-recovered-${index}`,
        name: typeof value.name === "string" && value.name ? value.name : fallback.name,
        email: typeof value.email === "string" ? value.email : fallback.email,
        phone: typeof value.phone === "string" ? value.phone : undefined,
        department: typeof value.department === "string" ? value.department : fallback.department,
        role,
        status,
        password: typeof value.password === "string" ? value.password : "",
        lastLogin: typeof value.lastLogin === "string" ? value.lastLogin : undefined,
        createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
        access: normalizeReaAccess(value.access, fallback.access),
      }];
    });
    return accounts.length ? accounts : cloneDefaultStaff();
  } catch {
    return cloneDefaultStaff();
  }
}

export function writeReaStaff(accounts: ReaStaffAccount[]) {
  if (typeof window === "undefined") return;
  try {
    const normalized = accounts.map((account) => ({
      ...account,
      access: normalizeReaAccess(account.access),
    }));
    window.localStorage.setItem(REA_STAFF_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("veritas-rea-staff-updated"));
  } catch {
    // Keep the current in-memory view usable when browser storage is unavailable.
  }
}

export function readAuditEvents(): AuditEvent[] {
  if (typeof window === "undefined") return [...defaultAuditEvents];
  try {
    const stored = window.localStorage.getItem(REA_AUDIT_STORAGE_KEY);
    if (!stored) return [...defaultAuditEvents];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...defaultAuditEvents];

    const events = parsed.flatMap((value, index): AuditEvent[] => {
      if (!isRecord(value)) return [];
      const fallback = defaultAuditEvents[index % defaultAuditEvents.length];
      const timestamp = typeof value.timestamp === "string" && !Number.isNaN(Date.parse(value.timestamp))
        ? value.timestamp
        : fallback.timestamp;
      const category = ["Authentication", "User Management", "Access Control", "Claims", "Verification", "System"].includes(String(value.category))
        ? value.category as AuditEvent["category"]
        : "System";
      const severity = ["Info", "Success", "Warning", "Critical"].includes(String(value.severity))
        ? value.severity as AuditEvent["severity"]
        : "Info";
      return [{
        id: typeof value.id === "string" && value.id ? value.id : `audit-recovered-${index}`,
        timestamp,
        actor: typeof value.actor === "string" ? value.actor : "Unknown user",
        action: typeof value.action === "string" ? value.action : "Activity recorded",
        category,
        target: typeof value.target === "string" ? value.target : "Veritas",
        details: typeof value.details === "string" ? value.details : "",
        severity,
      }];
    });
    return events.length ? events : [...defaultAuditEvents];
  } catch {
    return [...defaultAuditEvents];
  }
}

export function appendAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  const next: AuditEvent = { ...event, id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString() };
  const current = readAuditEvents();
  window.localStorage.setItem(REA_AUDIT_STORAGE_KEY, JSON.stringify([next, ...current].slice(0, 500)));
  window.dispatchEvent(new CustomEvent("veritas-audit-updated"));
}
