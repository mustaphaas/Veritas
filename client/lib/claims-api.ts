export type ClaimRecord = {
  id: string; claimId: string; projectId: string; programme: string; state: string; lga: string; community: string;
  latitude: number; longitude: number; contractor: string; claimAmount: number; claimDate: string;
  consultantId: string; consultantFirm: string; allocationStatus: 'Assigned'|'Unassigned'; verificationStatus: string;
  auditStatus: string; source: string; sourceReference: string; submittedDate: string;
};
export type ActiveConsultant = { id: string; firmName: string; status: string };
export type ImportClaimRow = Partial<ClaimRecord> & { claimId: string; state: string; lga: string; contractor: string; claimAmount: number };

const SESSION_KEY = 'rea-demo-session';
function token() {
  try { const raw = window.sessionStorage.getItem(SESSION_KEY); return raw ? (JSON.parse(raw) as { apiToken?: string }).apiToken : undefined; } catch { return undefined; }
}
async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const apiToken = token();
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}), ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}
export async function listClaimsApi(allocation: 'All'|'Assigned'|'Unassigned' = 'All') {
  return requestJson<{claims: ClaimRecord[]}>(`/api/rea/claims?allocation=${encodeURIComponent(allocation)}`);
}
export async function listActiveConsultantsApi() {
  return requestJson<{consultants: ActiveConsultant[]}>('/api/rea/consultants');
}
export async function importClaimsApi(claims: ImportClaimRow[]) {
  return requestJson<{ok: true; imported: number}>('/api/rea/claims/import', { method: 'POST', body: JSON.stringify({ claims }) });
}
export async function assignClaimApi(id: string, consultantId: string) {
  return requestJson<{ok: true; claim: ClaimRecord}>(`/api/rea/claims/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify({ consultantId }) });
}
export async function updateClaimApi(id: string, patch: { verificationStatus?: string; auditStatus?: string }) {
  return requestJson<{ok: true; claim: ClaimRecord}>(`/api/rea/claims/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
