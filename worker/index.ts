import { z } from "zod";
import { answerReaQuestion, type ReaAiRequest } from "../shared/rea-ai";
import type { AuthSession, UserRole } from "../shared/backend";
import { hashPassword, randomToken, sha256, timingSafeStringEqual, verifyPassword } from "./crypto";
import {
  assignmentAccess,
  audit,
  authenticatedUser,
  listWorkflow,
  requireRole,
  toPublicUser,
  userByEmail,
  userById,
} from "./db";
import {
  ApiError,
  clearSessionCookie,
  enforceSameOrigin,
  errorResponse,
  json,
  positiveInteger,
  readJson,
  requestMetadata,
  routeMatch,
  sessionCookie,
} from "./http";
import {
  arrivalSchema,
  assignmentSchema,
  bootstrapSchema,
  changePasswordSchema,
  contractorSchema,
  createUserSchema,
  evidenceUploadMetadataSchema,
  loginSchema,
  projectSchema,
  reaReviewSchema,
  reportSchema,
  reviewSchema,
  userStatusSchema,
  type ReportInput,
} from "./schemas";

type RuntimeEnv = Env & {
  BOOTSTRAP_TOKEN?: string;
  OPENAI_API_KEY?: string;
};

const ASSIGNMENT_STATUSES = [
  "Assigned",
  "En route",
  "Arrived",
  "Draft",
  "Submitted",
  "Approved",
  "Verified",
  "Rejected",
  "Re-inspection",
] as const;

type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

function now() {
  return new Date().toISOString();
}

function logEvent(
  level: "info" | "error",
  requestId: string,
  event: string,
  details: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({
    level,
    requestId,
    event,
    timestamp: now(),
    ...details,
  });
  if (level === "error") console.error(entry);
  else console.log(entry);
}

function sessionTtl(env: RuntimeEnv) {
  return Math.min(
    positiveInteger(env.SESSION_TTL_SECONDS, 8 * 60 * 60),
    7 * 24 * 60 * 60,
  );
}

async function createSession(
  request: Request,
  env: RuntimeEnv,
  userId: string,
) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const metadata = requestMetadata(request);
  const issuedAt = now();
  const ttl = sessionTtl(env);
  const expiresAt = new Date(Date.now() + ttl * 1_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, token_hash, user_id, expires_at, created_at, last_seen_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      tokenHash,
      userId,
      expiresAt,
      issuedAt,
      issuedAt,
      await sha256(metadata.ip),
      metadata.userAgent,
    )
    .run();
  return { token, ttl };
}

async function consumeLoginAttempt(
  env: RuntimeEnv,
  request: Request,
  email: string,
) {
  const metadata = requestMetadata(request);
  const key = await sha256(`${metadata.ip}|${email}`);
  const current = await env.DB.prepare(
    "SELECT attempts, window_started_at FROM auth_attempts WHERE key = ?",
  )
    .bind(key)
    .first<{ attempts: number; window_started_at: string }>();
  const cutoff = Date.now() - 15 * 60 * 1_000;
  const active = current && new Date(current.window_started_at).getTime() > cutoff;
  if (active && current.attempts >= 10) {
    throw new ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Try again later.");
  }
  const startedAt = active ? current.window_started_at : now();
  const attempts = active ? current.attempts + 1 : 1;
  await env.DB.prepare(
    `INSERT INTO auth_attempts (key, attempts, window_started_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts,
       window_started_at = excluded.window_started_at`,
  )
    .bind(key, attempts, startedAt)
    .run();
  return key;
}

async function clearLoginAttempts(env: RuntimeEnv, key: string) {
  await env.DB.prepare("DELETE FROM auth_attempts WHERE key = ?").bind(key).run();
}

async function handleBootstrap(request: Request, env: RuntimeEnv) {
  if (!env.BOOTSTRAP_TOKEN || env.BOOTSTRAP_TOKEN.length < 32) {
    throw new ApiError(503, "BOOTSTRAP_DISABLED", "Bootstrap is not configured.");
  }
  const supplied = request.headers.get("x-bootstrap-token") ?? "";
  if (!(await timingSafeStringEqual(supplied, env.BOOTSTRAP_TOKEN))) {
    throw new ApiError(401, "BOOTSTRAP_TOKEN_INVALID", "Bootstrap token is invalid.");
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
  if ((count?.total ?? 0) > 0) {
    throw new ApiError(409, "BOOTSTRAP_ALREADY_COMPLETE", "The first administrator already exists.");
  }
  const input = await readJson(request, bootstrapSchema);
  const timestamp = now();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users
     (id, email, password_hash, role, name, status, password_changed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'rea', ?, 'Active', ?, ?, ?)`,
  )
    .bind(id, input.email, await hashPassword(input.password), input.name, timestamp, timestamp, timestamp)
    .run();
  const user = await userById(env.DB, id);
  if (!user) throw new ApiError(500, "BOOTSTRAP_FAILED", "Administrator could not be created.");
  return json({ user: toPublicUser(user) }, { status: 201 });
}

async function handleLogin(request: Request, env: RuntimeEnv) {
  const input = await readJson(request, loginSchema);
  const attemptKey = await consumeLoginAttempt(env, request, input.email);
  const row = await userByEmail(env.DB, input.email);
  const valid = row && row.status === "Active" && (await verifyPassword(input.password, row.password_hash));
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  await clearLoginAttempts(env, attemptKey);
  const { token, ttl } = await createSession(request, env, row.id);
  return json(
    { user: toPublicUser(row) },
    { status: 200, headers: { "Set-Cookie": sessionCookie(request, token, ttl) } },
  );
}

async function handleLogout(request: Request, env: RuntimeEnv) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)veritas_session=([^;]+)/)?.[1];
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(decodeURIComponent(token)))
      .run();
  }
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
}

async function handleChangePassword(request: Request, env: RuntimeEnv, user: AuthSession) {
  const input = await readJson(request, changePasswordSchema);
  const row = await userById(env.DB, user.id);
  if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
    throw new ApiError(401, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
  }
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
    ).bind(await hashPassword(input.newPassword), timestamp, timestamp, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  return json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request) } },
  );
}

async function listUsers(env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant"]);
  const roleClause = user.role === "consultant" ? "WHERE role = 'field'" : "";
  const rows = (
    await env.DB.prepare(`SELECT * FROM users ${roleClause} ORDER BY name COLLATE NOCASE`).all<Record<string, string>>()
  ).results;
  return json({ users: rows.map((row) => toPublicUser(row as never)) });
}

async function createUser(request: Request, env: RuntimeEnv, actor: AuthSession) {
  requireRole(actor, ["rea", "consultant"]);
  const input = await readJson(request, createUserSchema);
  if (actor.role === "consultant" && input.role !== "field") {
    throw new ApiError(403, "ROLE_FORBIDDEN", "Consultant administrators can only create field officers.");
  }
  if (await userByEmail(env.DB, input.email)) {
    throw new ApiError(409, "EMAIL_EXISTS", "A user with this email already exists.");
  }
  const id = crypto.randomUUID();
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO users
     (id, email, password_hash, role, name, phone, zone, device, status,
      password_changed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)`,
  )
    .bind(
      id,
      input.email,
      await hashPassword(input.password),
      input.role,
      input.name,
      input.phone,
      input.zone,
      input.device,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  await audit(env.DB, actor, null, `Created ${input.role} account for ${input.name}`);
  const created = await userById(env.DB, id);
  return json({ user: toPublicUser(created!) }, { status: 201 });
}

async function updateUserStatus(
  request: Request,
  env: RuntimeEnv,
  actor: AuthSession,
  id: string,
) {
  requireRole(actor, ["rea", "consultant"]);
  const target = await userById(env.DB, id);
  if (!target) throw new ApiError(404, "USER_NOT_FOUND", "User was not found.");
  if (actor.role === "consultant" && target.role !== "field") {
    throw new ApiError(403, "ROLE_FORBIDDEN", "Consultant administrators can only manage field officers.");
  }
  if (target.id === actor.id) {
    throw new ApiError(409, "SELF_SUSPENSION", "You cannot suspend your own account.");
  }
  const input = await readJson(request, userStatusSchema);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(input.status, now(), id),
    ...(input.status === "Suspended"
      ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id)]
      : []),
  ]);
  await audit(env.DB, actor, null, `${input.status === "Active" ? "Activated" : "Suspended"} ${target.name}`);
  return json({ ok: true });
}

async function listContractors(env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant"]);
  const rows = (await env.DB.prepare("SELECT * FROM contractors ORDER BY name COLLATE NOCASE").all()).results;
  return json({ contractors: rows });
}

async function createContractor(request: Request, env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant"]);
  const input = await readJson(request, contractorSchema);
  const id = input.id ?? crypto.randomUUID();
  const timestamp = now();
  try {
    await env.DB.prepare(
      `INSERT INTO contractors
       (id, name, contact_name, email, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)`,
    )
      .bind(id, input.name, input.contactName, input.email, input.phone, timestamp, timestamp)
      .run();
  } catch {
    throw new ApiError(409, "CONTRACTOR_EXISTS", "A contractor with this name already exists.");
  }
  await audit(env.DB, user, null, `Created contractor ${input.name}`);
  return json({ id }, { status: 201 });
}

async function listProjects(env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant", "field"]);
  const restriction =
    user.role === "field"
      ? "WHERE EXISTS (SELECT 1 FROM assignments a WHERE a.project_id = projects.id AND a.officer_user_id = ?)"
      : "";
  const statement = env.DB.prepare(
    `SELECT id, name, programme, component, contractor_id AS contractorId,
            contractor_name AS contractor, state, lga, community, latitude,
            longitude, capacity_kw AS kw, households, status, verified,
            created_at AS createdAt, updated_at AS updatedAt
     FROM projects ${restriction} ORDER BY updated_at DESC`,
  );
  const rows = (
    user.role === "field" ? await statement.bind(user.id).all() : await statement.all()
  ).results;
  return json({ projects: rows });
}

async function createProject(request: Request, env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant"]);
  const input = await readJson(request, projectSchema);
  const id = input.id ?? `REA-${crypto.randomUUID()}`;
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO projects
     (id, name, programme, component, contractor_id, contractor_name, state,
      lga, community, latitude, longitude, capacity_kw, households, status,
      verified, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       programme = excluded.programme,
       component = excluded.component,
       contractor_id = excluded.contractor_id,
       contractor_name = excluded.contractor_name,
       state = excluded.state,
       lga = excluded.lga,
       community = excluded.community,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       capacity_kw = excluded.capacity_kw,
       households = excluded.households,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      input.name,
      input.programme,
      input.component,
      input.contractorId ?? null,
      input.contractor,
      input.state,
      input.lga,
      input.community,
      input.latitude,
      input.longitude,
      input.kw,
      input.households,
      input.status,
      user.id,
      timestamp,
      timestamp,
    )
    .run();
  await audit(env.DB, user, null, `Created project ${input.name}`);
  return json({ id }, { status: 201 });
}

async function createAssignment(request: Request, env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea", "consultant"]);
  const input = await readJson(request, assignmentSchema);
  const project = await env.DB.prepare("SELECT id, name FROM projects WHERE id = ?").bind(input.projectId).first<{ id: string; name: string }>();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
  const officer = await userById(env.DB, input.officerUserId);
  if (!officer || officer.role !== "field" || officer.status !== "Active") {
    throw new ApiError(400, "OFFICER_INVALID", "Choose an active field officer.");
  }
  const id = input.id ?? `assignment-${crypto.randomUUID()}`;
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO assignments
     (id, project_id, officer_user_id, due_date, geofence_radius, status,
      sync_status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Assigned', 'synced', ?, ?, ?)`,
  )
    .bind(id, input.projectId, input.officerUserId, input.dueDate, input.geofenceRadius, user.id, timestamp, timestamp)
    .run();
  await audit(env.DB, user, id, `Assigned ${project.name} to ${officer.name}`);
  return json({ id }, { status: 201 });
}

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(second.latitude - first.latitude);
  const dLon = radians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function startRoute(env: RuntimeEnv, user: AuthSession, assignmentId: string) {
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  const status = String(assignment.status) as AssignmentStatus;
  if (!["Assigned", "Draft", "Re-inspection"].includes(status)) {
    throw new ApiError(409, "INVALID_TRANSITION", "Navigation cannot start from the current status.");
  }
  const timestamp = now();
  await env.DB.prepare(
    "UPDATE assignments SET route_started_at = ?, status = 'En route', updated_at = ? WHERE id = ?",
  )
    .bind(timestamp, timestamp, assignmentId)
    .run();
  await audit(env.DB, user, assignmentId, "Navigation started");
  return json({ ok: true, routeStartedAt: timestamp });
}

async function verifyArrivalRoute(
  request: Request,
  env: RuntimeEnv,
  user: AuthSession,
  assignmentId: string,
) {
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  requireRole(user, ["field"]);
  const status = String(assignment.status) as AssignmentStatus;
  if (!["Assigned", "En route", "Draft", "Re-inspection"].includes(status)) {
    throw new ApiError(409, "INVALID_TRANSITION", "Arrival cannot be verified from the current status.");
  }
  const input = await readJson(request, arrivalSchema);
  const distance = distanceMeters(
    { latitude: Number(input.latitude), longitude: Number(input.longitude) },
    {
      latitude: Number(assignment.latitude),
      longitude: Number(assignment.longitude),
    },
  );
  const allowed = distance <= Number(assignment.geofence_radius);
  if (allowed) {
    const timestamp = now();
    await env.DB.prepare(
      `UPDATE assignments SET arrival_latitude = ?, arrival_longitude = ?,
       arrival_at = ?, arrival_distance = ?, status = 'Arrived', updated_at = ?
       WHERE id = ?`,
    )
      .bind(input.latitude, input.longitude, timestamp, distance, timestamp, assignmentId)
      .run();
  }
  await audit(
    env.DB,
    user,
    assignmentId,
    allowed
      ? `Arrival verified within geofence (${distance} m)`
      : `Arrival blocked outside geofence (${distance} m)`,
    input.deviceId,
    input.deviceType,
    { latitude: input.latitude, longitude: input.longitude, distance, allowed },
  );
  return json({ allowed, distance });
}

function reportData(input: ReportInput) {
  const {
    evidence: _evidence,
    componentValues: _componentValues,
    communitySignature: _communitySignature,
    contractorSignature: _contractorSignature,
    submittedAt: _submittedAt,
    reviewNote: _reviewNote,
    reaReviewNote: _reaReviewNote,
    reaReviewedAt: _reaReviewedAt,
    ...data
  } = input;
  return data;
}

async function saveReport(
  request: Request,
  env: RuntimeEnv,
  user: AuthSession,
  assignmentId: string,
  submit: boolean,
) {
  requireRole(user, ["field"]);
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  const input = await readJson(request, reportSchema, 5_000_000);
  if (input.assignmentId !== assignmentId || input.projectId !== assignment.project_id) {
    throw new ApiError(400, "REPORT_ASSIGNMENT_MISMATCH", "Report does not match this assignment.");
  }
  if (input.assignedComponent !== assignment.component) {
    throw new ApiError(400, "REPORT_COMPONENT_MISMATCH", "Report component does not match the assigned component.");
  }
  const status = String(assignment.status) as AssignmentStatus;
  if (["Submitted", "Approved", "Verified", "Rejected"].includes(status)) {
    throw new ApiError(409, "REPORT_LOCKED", "This report is locked for review.");
  }
  const arrivalAt = assignment.arrival_at ? new Date(String(assignment.arrival_at)).getTime() : 0;
  if (!arrivalAt || Date.now() - arrivalAt > 15 * 60 * 1_000) {
    throw new ApiError(409, "ARRIVAL_REQUIRED", "Verify arrival again before saving the report.");
  }
  const existing = await env.DB.prepare("SELECT id FROM inspection_reports WHERE assignment_id = ?")
    .bind(assignmentId)
    .first<{ id: string }>();
  const reportId = existing?.id ?? crypto.randomUUID();
  const timestamp = now();
  if (submit) {
    if (!existing) {
      throw new ApiError(409, "REPORT_REQUIRED", "Save a report draft before submission.");
    }
    if (!input.communitySignature || !input.contractorSignature) {
      throw new ApiError(400, "SIGNATURES_REQUIRED", "Both signatures are required before submission.");
    }
    const evidence = await env.DB.prepare("SELECT COUNT(*) AS total FROM evidence WHERE report_id = ?")
      .bind(reportId)
      .first<{ total: number }>();
    if ((evidence?.total ?? 0) < 1) {
      throw new ApiError(400, "EVIDENCE_REQUIRED", "Upload at least one evidence file before submission.");
    }
  }
  await env.DB.prepare(
    `INSERT INTO inspection_reports
     (id, assignment_id, assigned_component, component_values, inspected_at,
      latitude, longitude, inspector, device_id, device_type, asset_code,
      report_data, community_signature, contractor_signature, submitted_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(assignment_id) DO UPDATE SET
       assigned_component = excluded.assigned_component,
       component_values = excluded.component_values,
       inspected_at = excluded.inspected_at,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       inspector = excluded.inspector,
       device_id = excluded.device_id,
       device_type = excluded.device_type,
       asset_code = excluded.asset_code,
       report_data = excluded.report_data,
       community_signature = excluded.community_signature,
       contractor_signature = excluded.contractor_signature,
       submitted_at = excluded.submitted_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      reportId,
      assignmentId,
      input.assignedComponent,
      JSON.stringify(input.componentValues),
      input.inspectedAt,
      input.latitude,
      input.longitude,
      input.inspector,
      input.deviceId,
      input.deviceType,
      input.assetCode,
      JSON.stringify(reportData(input)),
      input.communitySignature ?? null,
      input.contractorSignature ?? null,
      submit ? timestamp : null,
      timestamp,
      timestamp,
    )
    .run();
  await env.DB.prepare("UPDATE assignments SET status = ?, sync_status = 'synced', updated_at = ? WHERE id = ?")
    .bind(submit ? "Submitted" : "Draft", timestamp, assignmentId)
    .run();
  await audit(
    env.DB,
    user,
    assignmentId,
    submit ? "Inspection submitted for QA" : "Inspection draft saved",
    input.deviceId,
    input.deviceType,
  );
  return json({ ok: true, reportId, status: submit ? "Submitted" : "Draft" });
}

async function consultantReview(
  request: Request,
  env: RuntimeEnv,
  user: AuthSession,
  assignmentId: string,
) {
  requireRole(user, ["consultant"]);
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  if (assignment.status !== "Submitted") {
    throw new ApiError(409, "INVALID_TRANSITION", "Only submitted reports can be reviewed.");
  }
  const input = await readJson(request, reviewSchema);
  if (input.decision === "Re-inspection" && !input.note) {
    throw new ApiError(400, "REVIEW_NOTE_REQUIRED", "A re-inspection reason is required.");
  }
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE assignments SET status = ?,
       arrival_latitude = CASE WHEN ? = 'Re-inspection' THEN NULL ELSE arrival_latitude END,
       arrival_longitude = CASE WHEN ? = 'Re-inspection' THEN NULL ELSE arrival_longitude END,
       arrival_at = CASE WHEN ? = 'Re-inspection' THEN NULL ELSE arrival_at END,
       arrival_distance = CASE WHEN ? = 'Re-inspection' THEN NULL ELSE arrival_distance END,
       route_started_at = CASE WHEN ? = 'Re-inspection' THEN NULL ELSE route_started_at END,
       updated_at = ? WHERE id = ?`,
    ).bind(input.decision, input.decision, input.decision, input.decision, input.decision, input.decision, timestamp, assignmentId),
    env.DB.prepare(
      `UPDATE inspection_reports SET consultant_review_note = ?,
       consultant_reviewed_at = ?, updated_at = ? WHERE assignment_id = ?`,
    ).bind(input.note, timestamp, timestamp, assignmentId),
  ]);
  await audit(env.DB, user, assignmentId, input.decision === "Approved" ? "Report approved after QA" : "Returned for re-inspection");
  return json({ ok: true, status: input.decision });
}

async function reaReview(
  request: Request,
  env: RuntimeEnv,
  user: AuthSession,
  assignmentId: string,
) {
  requireRole(user, ["rea"]);
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  if (assignment.status !== "Approved") {
    throw new ApiError(409, "INVALID_TRANSITION", "Only consultant-approved reports can be verified.");
  }
  const input = await readJson(request, reaReviewSchema);
  if (input.decision === "Rejected" && !input.note) {
    throw new ApiError(400, "REVIEW_NOTE_REQUIRED", "A rejection reason is required.");
  }
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?").bind(input.decision, timestamp, assignmentId),
    env.DB.prepare(
      `UPDATE inspection_reports SET rea_review_note = ?, rea_reviewed_at = ?,
       updated_at = ? WHERE assignment_id = ?`,
    ).bind(input.note, timestamp, timestamp, assignmentId),
    env.DB.prepare(
      `UPDATE projects SET verified = ?, status = ?, updated_at = ?
       WHERE id = (SELECT project_id FROM assignments WHERE id = ?)`,
    ).bind(input.decision === "Verified" ? 1 : 0, input.decision, timestamp, assignmentId),
  ]);
  await audit(env.DB, user, assignmentId, input.decision === "Verified" ? "Report verified by REA" : "Report rejected by REA");
  return json({ ok: true, status: input.decision });
}

function safeFileName(value: string) {
  return value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120) || "evidence";
}

async function uploadEvidence(
  request: Request,
  env: RuntimeEnv,
  user: AuthSession,
  assignmentId: string,
) {
  requireRole(user, ["field"]);
  const assignment = await assignmentAccess(env.DB, user, assignmentId);
  if (["Submitted", "Approved", "Verified", "Rejected"].includes(String(assignment.status))) {
    throw new ApiError(409, "REPORT_LOCKED", "Evidence cannot be changed after submission.");
  }
  const maximum = Math.min(positiveInteger(env.MAX_UPLOAD_BYTES, 10_485_760), 25_000_000);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maximum + 100_000) throw new ApiError(413, "FILE_TOO_LARGE", "Evidence file is too large.");
  const form = await request.formData();
  const file = form.get("file");
  const metadataText = form.get("metadata");
  if (!(file instanceof File) || typeof metadataText !== "string") {
    throw new ApiError(400, "EVIDENCE_INVALID", "Evidence file and metadata are required.");
  }
  if (file.size < 1 || file.size > maximum) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Evidence file is empty or too large.");
  }
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new ApiError(415, "EVIDENCE_TYPE_INVALID", "Only image and video evidence is accepted.");
  }
  let metadataValue: unknown;
  try {
    metadataValue = JSON.parse(metadataText);
  } catch {
    throw new ApiError(400, "EVIDENCE_METADATA_INVALID", "Evidence metadata is invalid.");
  }
  const parsed = evidenceUploadMetadataSchema.safeParse(metadataValue);
  if (!parsed.success) throw new ApiError(400, "EVIDENCE_METADATA_INVALID", "Evidence metadata is invalid.");
  const metadata = parsed.data;
  const report = await env.DB.prepare("SELECT id FROM inspection_reports WHERE assignment_id = ?")
    .bind(assignmentId)
    .first<{ id: string }>();
  if (!report) {
    throw new ApiError(409, "REPORT_REQUIRED", "Save the report draft before uploading evidence.");
  }
  const evidenceId = crypto.randomUUID();
  const key = `${assignmentId}/${report.id}/${evidenceId}-${safeFileName(file.name || metadata.name)}`;
  const uploaded = await env.EVIDENCE.put(key, file, {
    httpMetadata: { contentType: file.type, contentDisposition: `inline; filename="${safeFileName(file.name)}"` },
    customMetadata: { assignmentId, reportId: report.id, evidenceId, uploadedBy: user.id },
  });
  if (!uploaded) throw new ApiError(502, "EVIDENCE_UPLOAD_FAILED", "Evidence could not be stored.");
  try {
    await env.DB.prepare(
      `INSERT INTO evidence
       (id, report_id, object_key, file_name, media_type, content_type,
        size_bytes, captured_at, latitude, longitude, inspector, device_id,
        device_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        evidenceId,
        report.id,
        key,
        file.name || metadata.name,
        file.type.startsWith("video/") ? "video" : "photo",
        file.type,
        file.size,
        metadata.capturedAt,
        metadata.latitude,
        metadata.longitude,
        metadata.inspector,
        metadata.deviceId,
        metadata.deviceType,
        now(),
      )
      .run();
  } catch (error) {
    await env.EVIDENCE.delete(key);
    throw error;
  }
  await audit(env.DB, user, assignmentId, `Uploaded evidence ${file.name || metadata.name}`, metadata.deviceId, metadata.deviceType, { evidenceId, size: file.size });
  return json(
    {
      evidence: {
        ...metadata,
        id: evidenceId,
        name: file.name || metadata.name,
        type: file.type.startsWith("video/") ? "video" : "photo",
        previewUrl: `/api/evidence/${evidenceId}`,
      },
    },
    { status: 201 },
  );
}

async function getEvidence(env: RuntimeEnv, user: AuthSession, evidenceId: string) {
  const row = await env.DB.prepare(
    `SELECT e.object_key, e.content_type, e.file_name, a.officer_user_id
     FROM evidence e
     JOIN inspection_reports r ON r.id = e.report_id
     JOIN assignments a ON a.id = r.assignment_id
     WHERE e.id = ? LIMIT 1`,
  )
    .bind(evidenceId)
    .first<{ object_key: string; content_type: string; file_name: string; officer_user_id: string }>();
  if (!row) throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found.");
  if (user.role === "field" && row.officer_user_id !== user.id) {
    throw new ApiError(403, "EVIDENCE_FORBIDDEN", "You cannot access this evidence.");
  }
  const object = await env.EVIDENCE.get(row.object_key);
  if (!object) throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence object was not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.content_type);
  headers.set("Content-Disposition", `inline; filename="${safeFileName(row.file_name)}"`);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

async function handleReaAssistant(request: Request, env: RuntimeEnv, user: AuthSession) {
  requireRole(user, ["rea"]);
  const input = await readJson(request, z.custom<ReaAiRequest>(), 1_000_000);
  const result = await answerReaQuestion(input, env);
  return json(result.body, { status: result.status });
}

async function routeApi(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
  requestId: string,
) {
  const url = new URL(request.url);
  const path = url.pathname;
  enforceSameOrigin(request);

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "veritas", environment: env.ENVIRONMENT });
  }
  if (path === "/api/setup/bootstrap" && request.method === "POST") {
    return handleBootstrap(request, env);
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    return handleLogout(request, env);
  }

  const user = await authenticatedUser(request, env.DB);
  if (path === "/api/auth/session" && request.method === "GET") return json({ user });
  if (path === "/api/auth/change-password" && request.method === "POST") {
    return handleChangePassword(request, env, user);
  }
  if (path === "/api/workflow" && request.method === "GET") {
    return json(await listWorkflow(env.DB, user));
  }
  if (path === "/api/users" && request.method === "GET") return listUsers(env, user);
  if (path === "/api/users" && request.method === "POST") return createUser(request, env, user);
  const userStatusMatch = routeMatch(path, /^\/api\/users\/([^/]+)\/status$/);
  if (userStatusMatch && request.method === "PATCH") {
    return updateUserStatus(request, env, user, decodeURIComponent(userStatusMatch[1]));
  }
  if (path === "/api/contractors" && request.method === "GET") return listContractors(env, user);
  if (path === "/api/contractors" && request.method === "POST") return createContractor(request, env, user);
  if (path === "/api/projects" && request.method === "GET") return listProjects(env, user);
  if (path === "/api/projects" && request.method === "POST") return createProject(request, env, user);
  if (path === "/api/assignments" && request.method === "POST") return createAssignment(request, env, user);

  const routeStartMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/route$/);
  if (routeStartMatch && request.method === "POST") {
    return startRoute(env, user, decodeURIComponent(routeStartMatch[1]));
  }
  const arrivalMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/arrival$/);
  if (arrivalMatch && request.method === "POST") {
    return verifyArrivalRoute(request, env, user, decodeURIComponent(arrivalMatch[1]));
  }
  const reportMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/report$/);
  if (reportMatch && request.method === "PUT") {
    return saveReport(request, env, user, decodeURIComponent(reportMatch[1]), false);
  }
  const submitMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/submit$/);
  if (submitMatch && request.method === "POST") {
    return saveReport(request, env, user, decodeURIComponent(submitMatch[1]), true);
  }
  const consultantMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/consultant-review$/);
  if (consultantMatch && request.method === "POST") {
    return consultantReview(request, env, user, decodeURIComponent(consultantMatch[1]));
  }
  const reaMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/rea-review$/);
  if (reaMatch && request.method === "POST") {
    return reaReview(request, env, user, decodeURIComponent(reaMatch[1]));
  }
  const evidenceUploadMatch = routeMatch(path, /^\/api\/assignments\/([^/]+)\/evidence$/);
  if (evidenceUploadMatch && request.method === "POST") {
    return uploadEvidence(request, env, user, decodeURIComponent(evidenceUploadMatch[1]));
  }
  const evidenceGetMatch = routeMatch(path, /^\/api\/evidence\/([^/]+)$/);
  if (evidenceGetMatch && request.method === "GET") {
    return getEvidence(env, user, decodeURIComponent(evidenceGetMatch[1]));
  }
  if (path === "/api/rea-assistant" && request.method === "POST") {
    return handleReaAssistant(request, env, user);
  }

  ctx.waitUntil(
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now()).run(),
  );
  throw new ApiError(404, "ROUTE_NOT_FOUND", "API route was not found.");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      const response = await routeApi(request, env, ctx, requestId);
      response.headers.set("X-Request-Id", requestId);
      logEvent("info", requestId, "request.complete", {
        method: request.method,
        path: url.pathname,
        status: response.status,
      });
      return response;
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
      logEvent("error", requestId, "request.error", {
        method: request.method,
        path: url.pathname,
        status: apiError.status,
        code: apiError.code,
        error: error instanceof Error ? error.message : String(error),
      });
      const response = errorResponse(apiError, requestId);
      response.headers.set("X-Request-Id", requestId);
      return response;
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
