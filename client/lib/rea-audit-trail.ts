import type { AuditEvent } from "./rea-admin";

export type ReaDatabaseAuditEvent = AuditEvent & {
  actorId: string;
  actorRole: string;
  email: string;
  assignmentId: string | null;
  projectId: string | null;
  ipAddress: string | null;
};

type AuditTrailResponse = {
  events?: ReaDatabaseAuditEvent[];
  error?: string;
};

export async function fetchReaAuditTrail(apiToken: string): Promise<ReaDatabaseAuditEvent[]> {
  const response = await fetch("/api/rea/audit-trail", {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const payload = await response.json().catch(() => ({})) as AuditTrailResponse;
  if (!response.ok) throw new Error(payload.error || "Unable to load audit trail.");
  return Array.isArray(payload.events) ? payload.events : [];
}
