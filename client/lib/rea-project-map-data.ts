import type { Project } from "./dashboard-data";

export type ReaMapProjectRecord = {
  id: string;
  name: string;
  programme: string;
  component: string;
  contractor: string;
  consultantFirm: string;
  state: string;
  lga: string;
  community: string;
  reportingMonth: string;
  status: string;
  installedCapacityKw: number;
  households: number;
  verified: boolean | number;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMetres: number;
  dataSource: string;
  updatedAt: string;
};

export function resolveProjectCoordinate(project: Pick<ReaMapProjectRecord, "latitude" | "longitude"> | { latitude?: number | null; longitude?: number | null }): [number, number] | null {
  const latitude = project.latitude;
  const longitude = project.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [longitude, latitude];
}

export function reaRecordToDashboardProject(record: ReaMapProjectRecord): Project {
  const coordinate = resolveProjectCoordinate(record);
  return {
    id: record.id,
    name: record.name,
    state: record.state,
    lga: record.lga,
    community: record.community,
    programme: record.programme,
    component: record.component,
    contractor: record.contractor,
    month: record.reportingMonth || record.updatedAt,
    status: record.status,
    tone: record.verified === true || Number(record.verified) === 1 ? "green" : "amber",
    kw: Number(record.installedCapacityKw || 0),
    households: Number(record.households || 0),
    verified: record.verified === true || Number(record.verified) === 1,
    x: 0,
    y: 0,
    ...(coordinate ? { longitude: coordinate[0], latitude: coordinate[1] } : {}),
  };
}

export async function fetchReaMapProjects(apiToken: string): Promise<ReaMapProjectRecord[]> {
  const response = await fetch("/api/rea/projects", {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!response.ok) throw new Error("Unable to load REA project locations.");
  const payload = (await response.json()) as { projects?: ReaMapProjectRecord[] };
  return Array.isArray(payload.projects) ? payload.projects : [];
}

export type SatelliteVerificationVerdict = {
  status: "present" | "absent" | "inconclusive";
  imageQuality: "clear" | "degraded" | "unusable";
  confidence: number | null;
  estimatedNearbyHouses: number | null;
  notes: string;
};

export type SatelliteVerificationResult = {
  projectId: string;
  imageUrl: string;
  checkedAt: string;
  verdict: SatelliteVerificationVerdict;
};

// Fetches Esri satellite imagery for the project's stored GPS coordinates
// and asks Veritas AI (Gemini) to judge whether infrastructure consistent
// with the claimed project type is visible. Result is cached server-side,
// so this only re-spends imagery/model calls when the caller explicitly
// triggers a (re-)check.
export async function verifyProjectSatelliteImagery(
  projectId: string,
  apiToken: string,
): Promise<SatelliteVerificationResult> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/satellite-verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to complete the satellite verification check.");
  }
  return payload as SatelliteVerificationResult;
}
