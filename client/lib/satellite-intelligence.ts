export type SatelliteAnalysisRecord = {
  id: string;
  projectId: string;
  projectName: string;
  analysisType: "current" | "historical_compare";
  provider: string;
  latitudeUsed: number;
  longitudeUsed: number;
  baselineImageDate: string | null;
  comparisonImageDate: string | null;
  baselineReleaseDate: string | null;
  comparisonReleaseDate: string | null;
  baselineSourceRef: string | null;
  comparisonSourceRef: string | null;
  quality: Record<string, unknown>;
  observations: {
    summary?: string;
    observations?: string[];
    visibleInfrastructure?: string[];
    limitations?: string[];
  };
  change: { categories?: string[]; summary?: string | null };
  confidenceScore: number;
  confidenceLevel: "high" | "medium" | "low" | "inconclusive";
  reviewRequired: boolean;
  reviewStatus: "unreviewed" | "accepted" | "needs_followup" | "dismissed";
  reviewNote: string;
  reviewedAt: string | null;
  modelProvider: string | null;
  modelName: string | null;
  createdAt: string;
  updatedAt: string;
};

async function request<T>(apiToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Satellite Intelligence request failed.");
  return payload as T;
}

export async function fetchSatelliteAnalyses(apiToken: string, projectId: string): Promise<SatelliteAnalysisRecord[]> {
  const payload = await request<{ analyses?: SatelliteAnalysisRecord[] }>(apiToken, `/api/projects/${encodeURIComponent(projectId)}/satellite-analysis`);
  return Array.isArray(payload.analyses) ? payload.analyses : [];
}

export async function runSatelliteAnalysis(apiToken: string, projectId: string): Promise<SatelliteAnalysisRecord> {
  const payload = await request<{ analysis: SatelliteAnalysisRecord }>(apiToken, `/api/projects/${encodeURIComponent(projectId)}/satellite-analysis`, { method: "POST" });
  return payload.analysis;
}

export async function compareSatelliteImagery(apiToken: string, projectId: string): Promise<SatelliteAnalysisRecord> {
  const payload = await request<{ analysis: SatelliteAnalysisRecord }>(apiToken, `/api/projects/${encodeURIComponent(projectId)}/satellite-analysis/compare`, { method: "POST" });
  return payload.analysis;
}

export async function reviewSatelliteAnalysis(
  apiToken: string,
  analysisId: string,
  reviewStatus: "accepted" | "needs_followup" | "dismissed",
  reviewNote = "",
): Promise<SatelliteAnalysisRecord> {
  const payload = await request<{ analysis: SatelliteAnalysisRecord }>(apiToken, `/api/satellite-analysis/${encodeURIComponent(analysisId)}/review`, {
    method: "PATCH",
    body: JSON.stringify({ reviewStatus, reviewNote }),
  });
  return payload.analysis;
}
