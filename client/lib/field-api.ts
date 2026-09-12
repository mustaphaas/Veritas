const SESSION_KEY = "rea-demo-session";

export type FieldApiSession = { apiToken?: string };

function token() {
  try { return (JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}") as FieldApiSession).apiToken; } catch { return undefined; }
}

async function call(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(`/api/field${path}`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Veritas API returned ${response.status}.`);
  return payload;
}

async function consultantCall(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(`/api/consultant${path}`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Veritas API returned ${response.status}.`);
  return payload;
}

async function reaCall(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(`/api/rea${path}`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Veritas API returned ${response.status}.`);
  return payload;
}

export async function authenticateFieldApi(identifier: string, password: string) {
  const response = await fetch("/api/field/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to authenticate with Veritas.");
  return payload;
}

export const fetchFieldAssignments = () => call("/assignments");
export const reviewFieldAssignment = (id: string, status: string, note: string) => call(`/assignments/${encodeURIComponent(id)}/review`, { method: "PATCH", body: JSON.stringify({ status, note }) });
export const createFieldAssignment = (assignment: unknown) => call("/assignments", { method: "POST", body: JSON.stringify(assignment) });
export const createFieldOfficerApi = (officer: unknown) => call("/users/field-officers", { method: "POST", body: JSON.stringify(officer) });
export const createConsultantApi = (consultant: unknown) => reaCall("/consultants", { method: "POST", body: JSON.stringify(consultant) });
export const updateFieldOfficerStatusApi = (id: string, status: "Active" | "Suspended") => call(`/users/field-officers/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const deleteFieldOfficerApi = (id: string) => call(`/users/field-officers/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchConsultantFieldOfficers = () => consultantCall("/field-officers");
export async function fetchConsultantProfileWithToken(apiToken: string) {
  const response = await fetch("/api/consultant/profile", { headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Veritas API returned ${response.status}.`);
  return payload;
}

export function normalizeCloudAssignment(item: any) {
  const report = item.report ? {
    ...item.report,
    assignmentId: item.id,
    assignedComponent: item.component,
    componentValues: item.report.componentValues ?? item.report.values ?? {},
    projectId: item.projectId ?? item.id,
    contractor: item.contractor,
    state: item.state,
    lga: item.lga,
    community: item.community,
    inspectedAt: item.report.updatedAt ?? item.updatedAt,
    latitude: item.arrival?.latitude ?? item.latitude,
    longitude: item.arrival?.longitude ?? item.longitude,
    inspector: item.officer,
    deviceId: item.report.deviceAudit?.androidId ?? "Android device",
    deviceType: item.report.deviceAudit?.modelName ?? "Mobile phone",
    assetCode: `${item.id}-ASSET-01`,
    evidence: item.report.evidence ?? [],
    communitySignature: item.report.communitySignatory || item.report.communitySignature,
    contractorSignature: item.report.contractorSignatory || item.report.contractorSignature,
  } : undefined;
  return {
    ...item,
    geofenceRadius: item.geofenceRadiusMetres ?? 250,
    arrival: item.arrival ? { latitude: item.arrival.latitude, longitude: item.arrival.longitude, at: item.arrival.verifiedAt ?? item.arrival.at, distance: item.arrival.distanceMetres ?? item.arrival.distance } : undefined,
    report,
    syncStatus: "synced",
    audit: item.audit ?? [],
  };
}
