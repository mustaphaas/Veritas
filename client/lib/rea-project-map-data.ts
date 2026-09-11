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

export async function fetchReaMapProjects(apiToken: string): Promise<ReaMapProjectRecord[]> {
  const response = await fetch("/api/rea/projects", {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!response.ok) throw new Error("Unable to load REA project locations.");
  const payload = (await response.json()) as { projects?: ReaMapProjectRecord[] };
  return Array.isArray(payload.projects) ? payload.projects : [];
}
