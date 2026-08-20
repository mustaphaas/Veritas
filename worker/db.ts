import type {
  AuthSession,
  PublicUser,
  UserRole,
} from "../shared/backend";
import { sha256 } from "./crypto";
import { ApiError, cookieValue } from "./http";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  name: string;
  phone: string;
  zone: string;
  device: string;
  status: "Active" | "Suspended";
  created_at: string;
};

type AssignmentRow = {
  id: string;
  project_id: string;
  due_date: string;
  geofence_radius: number;
  status: string;
  route_started_at: string | null;
  arrival_latitude: number | null;
  arrival_longitude: number | null;
  arrival_at: string | null;
  arrival_distance: number | null;
  sync_status: "synced" | "queued";
  project_name: string;
  programme: string;
  component: string;
  contractor_name: string;
  state: string;
  lga: string;
  community: string;
  latitude: number;
  longitude: number;
  officer: string;
  officer_user_id: string;
  report_id: string | null;
  assigned_component: string | null;
  component_values: string | null;
  inspected_at: string | null;
  report_latitude: number | null;
  report_longitude: number | null;
  inspector: string | null;
  device_id: string | null;
  device_type: string | null;
  asset_code: string | null;
  report_data: string | null;
  community_signature: string | null;
  contractor_signature: string | null;
  submitted_at: string | null;
  consultant_review_note: string | null;
  consultant_reviewed_at: string | null;
  rea_review_note: string | null;
  rea_reviewed_at: string | null;
};

type EvidenceRow = {
  id: string;
  report_id: string;
  file_name: string;
  media_type: "photo" | "video";
  captured_at: string;
  latitude: number;
  longitude: number;
  inspector: string;
  device_id: string;
  device_type: string;
};

type AuditRow = {
  id: string;
  assignment_id: string;
  actor_name: string;
  action: string;
  device_id: string;
  device_type: string;
  created_at: string;
};

function roleLabel(role: UserRole) {
  return {
    rea: "REA Dashboard",
    consultant: "Consultant Admin",
    field: "Field Officer",
  }[role];
}

function rolePath(role: UserRole) {
  return {
    rea: "/",
    consultant: "/consultant-admin",
    field: "/field-officer",
  }[role];
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    roleLabel: roleLabel(row.role),
    name: row.name,
    initials: row.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
    path: rolePath(row.role),
    phone: row.phone,
    zone: row.zone,
    device: row.device,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function userByEmail(db: D1Database, email: string) {
  return db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1")
    .bind(email)
    .first<UserRow>();
}

export async function userById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first<UserRow>();
}

export async function authenticatedUser(
  request: Request,
  db: D1Database,
): Promise<AuthSession> {
  const token = cookieValue(request);
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<UserRow>();
  if (!row || row.status !== "Active") {
    throw new ApiError(401, "SESSION_EXPIRED", "Your session has expired.");
  }
  return toPublicUser(row);
}

export function requireRole(user: AuthSession, allowed: UserRole[]) {
  if (!allowed.includes(user.role)) {
    throw new ApiError(403, "ROLE_FORBIDDEN", "Your role cannot perform this action.");
  }
}

function parseObject(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function listWorkflow(db: D1Database, user: AuthSession) {
  const restriction = user.role === "field" ? "WHERE a.officer_user_id = ?" : "";
  const statement = db.prepare(
    `SELECT
       a.*,
       p.name AS project_name, p.programme, p.component, p.contractor_name,
       p.state, p.lga, p.community, p.latitude, p.longitude,
       u.name AS officer,
       r.id AS report_id, r.assigned_component, r.component_values,
       r.inspected_at, r.latitude AS report_latitude,
       r.longitude AS report_longitude, r.inspector, r.device_id,
       r.device_type, r.asset_code, r.report_data,
       r.community_signature, r.contractor_signature, r.submitted_at,
       r.consultant_review_note, r.consultant_reviewed_at,
       r.rea_review_note, r.rea_reviewed_at
     FROM assignments a
     JOIN projects p ON p.id = a.project_id
     JOIN users u ON u.id = a.officer_user_id
     LEFT JOIN inspection_reports r ON r.assignment_id = a.id
     ${restriction}
     ORDER BY a.updated_at DESC, a.created_at DESC`,
  );
  const assignmentsResult = user.role === "field"
    ? await statement.bind(user.id).all<AssignmentRow>()
    : await statement.all<AssignmentRow>();
  const evidenceResult = await db
    .prepare(
      `SELECT e.* FROM evidence e
       JOIN inspection_reports r ON r.id = e.report_id
       JOIN assignments a ON a.id = r.assignment_id
       ${user.role === "field" ? "WHERE a.officer_user_id = ?" : ""}
       ORDER BY e.created_at ASC`,
    );
  const evidenceRows = user.role === "field"
    ? (await evidenceResult.bind(user.id).all<EvidenceRow>()).results
    : (await evidenceResult.all<EvidenceRow>()).results;
  const auditResult = db.prepare(
    `SELECT l.* FROM audit_log l
     LEFT JOIN assignments a ON a.id = l.assignment_id
     ${user.role === "field" ? "WHERE a.officer_user_id = ?" : ""}
     ORDER BY l.created_at ASC`,
  );
  const auditRows = user.role === "field"
    ? (await auditResult.bind(user.id).all<AuditRow>()).results
    : (await auditResult.all<AuditRow>()).results;
  const evidenceByReport = new Map<string, EvidenceRow[]>();
  for (const evidence of evidenceRows) {
    evidenceByReport.set(evidence.report_id, [
      ...(evidenceByReport.get(evidence.report_id) ?? []),
      evidence,
    ]);
  }
  const auditByAssignment = new Map<string, AuditRow[]>();
  for (const event of auditRows) {
    if (!event.assignment_id) continue;
    auditByAssignment.set(event.assignment_id, [
      ...(auditByAssignment.get(event.assignment_id) ?? []),
      event,
    ]);
  }
  const assignments = assignmentsResult.results.map((row) => {
    const reportData = parseObject(row.report_data);
    const report = row.report_id
      ? {
          ...reportData,
          assignmentId: row.id,
          assignedComponent: row.assigned_component,
          componentValues: parseObject(row.component_values),
          projectId: row.project_id,
          contractor: row.contractor_name,
          state: row.state,
          lga: row.lga,
          community: row.community,
          inspectedAt: row.inspected_at,
          latitude: row.report_latitude,
          longitude: row.report_longitude,
          inspector: row.inspector,
          deviceId: row.device_id,
          deviceType: row.device_type,
          assetCode: row.asset_code,
          communitySignature: row.community_signature ?? undefined,
          contractorSignature: row.contractor_signature ?? undefined,
          submittedAt: row.submitted_at ?? undefined,
          reviewNote: row.consultant_review_note ?? undefined,
          reaReviewNote: row.rea_review_note ?? undefined,
          reaReviewedAt: row.rea_reviewed_at ?? undefined,
          evidence: (evidenceByReport.get(row.report_id) ?? []).map((item) => ({
            id: item.id,
            name: item.file_name,
            type: item.media_type,
            capturedAt: item.captured_at,
            latitude: item.latitude,
            longitude: item.longitude,
            projectId: row.project_id,
            inspector: item.inspector,
            deviceId: item.device_id,
            deviceType: item.device_type,
            previewUrl: `/api/evidence/${item.id}`,
          })),
        }
      : undefined;
    return {
      id: row.id,
      projectName: row.project_name,
      programme: row.programme,
      component: row.component,
      contractor: row.contractor_name,
      state: row.state,
      lga: row.lga,
      community: row.community,
      officer: row.officer,
      dueDate: row.due_date,
      latitude: row.latitude,
      longitude: row.longitude,
      geofenceRadius: row.geofence_radius,
      routeStartedAt: row.route_started_at ?? undefined,
      status: row.status,
      arrival: row.arrival_at
        ? {
            latitude: row.arrival_latitude,
            longitude: row.arrival_longitude,
            at: row.arrival_at,
            distance: row.arrival_distance,
          }
        : undefined,
      report,
      syncStatus: row.sync_status,
      audit: (auditByAssignment.get(row.id) ?? []).map((event) => ({
        id: event.id,
        at: event.created_at,
        actor: event.actor_name,
        action: event.action,
        deviceId: event.device_id,
        deviceType: event.device_type,
      })),
    };
  });
  const fieldOfficers = user.role === "field"
    ? []
    : (
        await db
          .prepare(
            `SELECT * FROM users WHERE role = 'field' ORDER BY name COLLATE NOCASE`,
          )
          .all<UserRow>()
      ).results.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        zone: row.zone,
        device: row.device,
        status: row.status,
        createdAt: row.created_at,
      }));
  return { assignments, fieldOfficers };
}

export async function audit(
  db: D1Database,
  user: AuthSession,
  assignmentId: string | null,
  action: string,
  deviceId = "",
  deviceType = "",
  metadata: Record<string, unknown> = {},
) {
  await db
    .prepare(
      `INSERT INTO audit_log
       (id, assignment_id, actor_user_id, actor_name, action, device_id, device_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      assignmentId,
      user.id,
      user.name,
      action,
      deviceId,
      deviceType,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run();
}

export async function assignmentAccess(
  db: D1Database,
  user: AuthSession,
  assignmentId: string,
) {
  const row = await db
    .prepare(
      `SELECT a.*, p.component, p.name AS project_name, p.contractor_name,
              p.state, p.lga, p.community, p.latitude, p.longitude,
              u.name AS officer
       FROM assignments a
       JOIN projects p ON p.id = a.project_id
       JOIN users u ON u.id = a.officer_user_id
       WHERE a.id = ? LIMIT 1`,
    )
    .bind(assignmentId)
    .first<Record<string, string | number | null>>();
  if (!row) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment was not found.");
  if (user.role === "field" && row.officer_user_id !== user.id) {
    throw new ApiError(403, "ASSIGNMENT_FORBIDDEN", "This assignment is not assigned to you.");
  }
  return row;
}
