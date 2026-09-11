export type ReaRecentActivity = {
  id: string;
  assignmentId: string | null;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  projectId: string | null;
  projectName: string | null;
  programme: string | null;
  component: string | null;
  contractor: string | null;
  state: string | null;
  lga: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export async function fetchReaRecentActivity(apiToken: string): Promise<ReaRecentActivity[]> {
  const response = await fetch("/api/rea/recent-activity", {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!response.ok) throw new Error("Unable to load recent activity.");
  const payload = await response.json() as { activities?: ReaRecentActivity[] };
  return Array.isArray(payload.activities) ? payload.activities : [];
}
