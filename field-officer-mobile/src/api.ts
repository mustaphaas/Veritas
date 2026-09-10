import * as FileSystem from "expo-file-system/legacy";

import type { ArrivalRecord, Assignment, EvidenceRecord, InspectionReport } from "./types";

const API_BASE = (process.env.EXPO_PUBLIC_VERITAS_API_BASE_URL || "https://veritas.mustaphaaliyu236.workers.dev/api").replace(/\/$/, "");

async function request(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}/field${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Veritas API returned ${response.status}.`);
  return payload;
}

export async function apiLogin(identifier: string, password: string) {
  return request("/auth/login", undefined, { method: "POST", body: JSON.stringify({ identifier, password }) });
}

export async function apiAssignments(token: string, since?: string): Promise<{ assignments: Assignment[]; serverTime: string }> {
  return request(`/assignments${since ? `?since=${encodeURIComponent(since)}` : ""}`, token);
}

export async function apiArrival(token: string, assignmentId: string, arrival: ArrivalRecord) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}/arrival`, token, { method: "PUT", body: JSON.stringify(arrival) });
}

export async function apiDraft(token: string, assignmentId: string, report: InspectionReport) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}/draft`, token, { method: "PUT", body: JSON.stringify({ report }) });
}

export async function apiEvidence(token: string, assignmentId: string, evidence: EvidenceRecord) {
  const base64 = await FileSystem.readAsStringAsync(evidence.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return request(`/assignments/${encodeURIComponent(assignmentId)}/evidence/${encodeURIComponent(evidence.id)}`, token, {
    method: "POST",
    body: bytes,
    headers: {
      "Content-Type": evidence.type === "video" ? "video/mp4" : "image/jpeg",
      "X-Content-SHA256": evidence.integrityHash || "",
      "X-Veritas-Metadata": encodeURIComponent(JSON.stringify(evidence)),
    },
  });
}

export async function apiSubmit(token: string, assignmentId: string, report: InspectionReport) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}/submit`, token, {
    method: "POST",
    body: JSON.stringify({ report, formIntegrityHash: report.formIntegrityHash, signatureIntegrityHash: report.signatureIntegrityHash }),
  });
}
