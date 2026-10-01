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
  // Added by the backend evidence policy; absent on older cached responses.
  evidenceClass?: "direct" | "limited" | "settlement_only";
  evidenceLocation?: "at_project_point" | "elsewhere_in_frame" | "none" | null;
  modelStatus?: "present" | "absent" | "inconclusive";
  limitation?: { code: string; message: string } | null;
  houseEstimateNote?: string | null;
};

export type SatelliteVerificationResult = {
  projectId: string;
  imageUrl: string | null;
  checkedAt: string;
  verdict: SatelliteVerificationVerdict;
  imagerySource?: string | null;
  imageryDate?: string | null;
  radiusMetres?: number | null;
  analysisMethod?: string | null;
  analysisVersion?: string | null;
  cached?: boolean;
};

async function satelliteVerificationRequest(
  projectId: string,
  apiToken: string,
  method: "GET" | "POST",
): Promise<SatelliteVerificationResult> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/satellite-verify`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to load the satellite verification result.");
    (error as Error & { code?: string; status?: number }).code = payload?.code;
    (error as Error & { code?: string; status?: number }).status = response.status;
    throw error;
  }
  return payload as SatelliteVerificationResult;
}

// Cache-first read. This never calls Gemini or downloads a fresh image.
export async function fetchCachedProjectSatelliteImagery(
  projectId: string,
  apiToken: string,
): Promise<SatelliteVerificationResult> {
  return satelliteVerificationRequest(projectId, apiToken, "GET");
}

// Explicit re-check. This is the only client path that spends a new Esri +
// Gemini verification call and replaces the stored result.
export async function verifyProjectSatelliteImagery(
  projectId: string,
  apiToken: string,
): Promise<SatelliteVerificationResult> {
  return satelliteVerificationRequest(projectId, apiToken, "POST");
}


export type NightLightImpact = {
  projectId: string;
  commissioningDate: string;
  dateBasis: string;
  radiusMetres: number;
  coreRadiusMetres: number;
  controlInnerMetres: number;
  controlOuterMetres: number;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
  baselineRadiance: number | null;
  afterRadiance: number | null;
  radianceDelta: number | null;
  percentChange: number | null;
  coreBaselineRadiance: number | null;
  coreAfterRadiance: number | null;
  coreRadianceDelta: number | null;
  corePercentChange: number | null;
  coreMeanBaselineRadiance: number | null;
  coreMeanAfterRadiance: number | null;
  coreP90BaselineRadiance: number | null;
  coreP90AfterRadiance: number | null;
  coreP90PercentChange: number | null;
  controlBaselineRadiance: number | null;
  controlAfterRadiance: number | null;
  controlPercentChange: number | null;
  differentialPercentagePoints: number | null;
  monthsBefore: number;
  monthsAfter: number;
  impactClass: "strong_increase" | "moderate_increase" | "no_clear_change" | "decrease" | "insufficient_data";
  dataQuality: "good" | "moderate" | "limited" | "insufficient" | string;
  detectionMetric: string;
  detectionReason: string;
  series: Array<{ month: string; projectRadiance: number | null; controlRadiance?: number | null }>;
  beforeGrid: unknown;
  afterGrid: unknown;
  sourceProduct: string;
  sourceName: string;
  sourceUrl: string;
  analysisMethod: string;
  checkedAt: string | null;
};

export type NightLightImpactResult = {
  project: {
    id: string;
    name: string;
    programme: string;
    component: string;
    state: string;
    lga: string;
    community: string;
    latitude: number;
    longitude: number;
    commissionedAt?: string | null;
  };
  impact: NightLightImpact;
};

export async function fetchProjectNightLightImpact(
  projectId: string,
  apiToken: string,
): Promise<NightLightImpactResult> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/nightlight-impact`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to load the NASA VIIRS night-time light impact analysis.");
    (error as Error & { code?: string }).code = payload?.code;
    throw error;
  }
  return payload as NightLightImpactResult;
}
