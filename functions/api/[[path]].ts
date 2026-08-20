import { ApiError, bodyJson, fail, json, methodNotAllowed, numberValue, routeParts, sameOrigin, text } from "../_lib/http";
import { clearSessionCookie, cookieValue, hashPassword, randomToken, sessionCookie, sha256, verifyPassword } from "../_lib/security";

type Role = "rea" | "consultant" | "field";
type AssignmentStatus = "Assigned" | "En route" | "Arrived" | "Draft" | "Submitted" | "Approved" | "Verified" | "Rejected" | "Re-inspection";
type Bindings = Env & {
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  SESSION_TTL_SECONDS?: string;
};

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
  status: "active" | "disabled";
  created_at: string;
}

interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
}

interface AssignmentRow {
  id: string;
  project_id: string;
  field_officer_id: string;
  consultant_id: string | null;
  status: AssignmentStatus;
  scheduled_for: string | null;
  latitude: number | null;
  longitude: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const ROLE_VALUES = new Set<Role>(["rea", "consultant", "field"]);
const SESSION_DEFAULT_SECONDS = 60 * 60 * 12;
const MAX_SESSION_SECONDS = 60 * 60 * 24 * 7;

function now(): string {
  return new Date().toISOString();
}

function publicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
  };
}

function emailAddress(value: unknown): string {
  const email = text(value, "email", { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.", "invalid_email");
  }
  return email;
}

function enumValue<T extends string>(value: unknown, name: string, allowed: Set<T>): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ApiError(400, `${name} is invalid.`, "invalid_field");
  }
  return value as T;
}

function sessionTtl(env: Bindings): number {
  const value = Number(env.SESSION_TTL_SECONDS || SESSION_DEFAULT_SECONDS);
  if (!Number.isFinite(value) || value < 300) return SESSION_DEFAULT_SECONDS;
  return Math.min(Math.floor(value), MAX_SESSION_SECONDS);
}

async function audit(
  env: Bindings,
  request: Request,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip");
  const ipHash = ip ? await sha256(ip) : null;
  await env.VERITAS_DB.prepare(
    `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata_json, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(metadata), ipHash, now()).run();
}

async function maybeBootstrap(env: Bindings, submittedEmail: string, password: string): Promise<void> {
  const count = await env.VERITAS_DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if ((count?.count ?? 0) !== 0) return;
  const configuredEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!configuredEmail || !configuredPassword || submittedEmail !== configuredEmail || password !== configuredPassword) return;

  const passwordData = await hashPassword(password);
  const timestamp = now();
  await env.VERITAS_DB.prepare(
    `INSERT INTO users
      (id, email, display_name, role, password_salt, password_hash, password_iterations, status, created_at, updated_at)
     VALUES (?, ?, ?, 'rea', ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    configuredEmail,
    "Veritas Administrator",
    passwordData.salt,
    passwordData.hash,
    passwordData.iterations,
    timestamp,
    timestamp,
  ).run();
}

async function currentUser(request: Request, env: Bindings, required = true): Promise<UserRow | null> {
  const token = cookieValue(request, "veritas_session");
  if (!token) {
    if (required) throw new ApiError(401, "Authentication required.", "authentication_required");
    return null;
  }
  const tokenHash = await sha256(token);
  const user = await env.VERITAS_DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.password_salt, u.password_hash,
            u.password_iterations, u.status, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<UserRow>();
  if (!user && required) throw new ApiError(401, "Session is invalid or expired.", "invalid_session");
  return user ?? null;
}

function requireRole(user: UserRow, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw new ApiError(403, "You do not have permission for this action.", "forbidden");
}

async function assignmentForUser(env: Bindings, id: string, user: UserRow): Promise<AssignmentRow> {
  const assignment = await env.VERITAS_DB.prepare(
    `SELECT id, project_id, field_officer_id, consultant_id, status, scheduled_for,
            latitude, longitude, version, created_at, updated_at
       FROM assignments WHERE id = ?`,
  ).bind(id).first<AssignmentRow>();
  if (!assignment) throw new ApiError(404, "Assignment not found.", "not_found");
  if (
    user.role !== "rea" &&
    !(user.role === "field" && assignment.field_officer_id === user.id) &&
    !(user.role === "consultant" && assignment.consultant_id === user.id)
  ) {
    throw new ApiError(403, "You cannot access this assignment.", "forbidden");
  }
  return assignment;
}

async function handleLogin(request: Request, env: Bindings): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  sameOrigin(request);
  const body = await bodyJson<{ email?: unknown; password?: unknown }>(request, 4_096);
  const email = emailAddress(body.email);
  const password = text(body.password, "password", { required: true, max: 256 });
  await maybeBootstrap(env, email, password);

  const user = await env.VERITAS_DB.prepare(
    `SELECT id, email, display_name, role, password_salt, password_hash,
            password_iterations, status, created_at
       FROM users WHERE email = ?`,
  ).bind(email).first<UserRow>();
  const valid = user && user.status === "active"
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.password_iterations)
    : false;
  if (!valid || !user) throw new ApiError(401, "Email or password is incorrect.", "invalid_credentials");

  const token = randomToken();
  const ttl = sessionTtl(env);
  await env.VERITAS_DB.batch([
    env.VERITAS_DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)),
    env.VERITAS_DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    ).bind(await sha256(token), user.id, Math.floor(Date.now() / 1000) + ttl, now()),
  ]);
  await audit(env, request, user.id, "auth.login", "user", user.id);
  return json({ ok: true, user: publicUser(user) }, 200, { "set-cookie": sessionCookie(token, ttl) });
}

async function handleSession(request: Request, env: Bindings): Promise<Response> {
  if (request.method === "GET") {
    const user = await currentUser(request, env, false);
    return json({ ok: true, authenticated: Boolean(user), user: user ? publicUser(user) : null });
  }
  if (request.method === "DELETE") {
    sameOrigin(request);
    const token = cookieValue(request, "veritas_session");
    if (token) await env.VERITAS_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }
  return methodNotAllowed(["GET", "DELETE"]);
}

async function handleUsers(request: Request, env: Bindings): Promise<Response> {
  const actor = (await currentUser(request, env))!;
  requireRole(actor, "rea");
  if (request.method === "GET") {
    const results = await env.VERITAS_DB.prepare(
      `SELECT id, email, display_name AS displayName, role, status, created_at AS createdAt
         FROM users ORDER BY display_name`,
    ).all<PublicUser>();
    return json({ ok: true, users: results.results });
  }
  if (request.method === "POST") {
    sameOrigin(request);
    const body = await bodyJson<{ email?: unknown; displayName?: unknown; role?: unknown; password?: unknown }>(request);
    const email = emailAddress(body.email);
    const displayName = text(body.displayName, "displayName", { required: true, max: 100 });
    const role = enumValue(body.role, "role", ROLE_VALUES);
    const password = text(body.password, "password", { required: true, max: 256 });
    const passwordData = await hashPassword(password);
    const id = crypto.randomUUID();
    const timestamp = now();
    try {
      await env.VERITAS_DB.prepare(
        `INSERT INTO users
          (id, email, display_name, role, password_salt, password_hash, password_iterations, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(id, email, displayName, role, passwordData.salt, passwordData.hash, passwordData.iterations, timestamp, timestamp).run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new ApiError(409, "A user with that email already exists.", "duplicate_email");
      throw error;
    }
    await audit(env, request, actor.id, "user.create", "user", id, { email, role });
    return json({ ok: true, user: { id, email, displayName, role, status: "active", createdAt: timestamp } }, 201);
  }
  return methodNotAllowed(["GET", "POST"]);
}

async function handleUserStatus(request: Request, env: Bindings, userId: string): Promise<Response> {
  if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
  sameOrigin(request);
  const actor = (await currentUser(request, env))!;
  requireRole(actor, "rea");
  const body = await bodyJson<{ status?: unknown }>(request, 2_048);
  const status = enumValue(body.status, "status", new Set(["active", "disabled"] as const));
  if (actor.id === userId && status === "disabled") {
    throw new ApiError(400, "You cannot disable your own account.", "self_disable");
  }
  const result = await env.VERITAS_DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now(), userId).run();
  if (!result.meta.changes) throw new ApiError(404, "User not found.", "not_found");
  if (status === "disabled") await env.VERITAS_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await audit(env, request, actor.id, "user.status", "user", userId, { status });
  return json({ ok: true });
}

async function handleProjects(request: Request, env: Bindings): Promise<Response> {
  const actor = (await currentUser(request, env))!;
  if (request.method === "GET") {
    const results = await env.VERITAS_DB.prepare(
      `SELECT p.id, p.code, p.name, p.program, p.state, p.lga, p.description, p.status,
              p.created_at AS createdAt, COUNT(a.id) AS assignmentCount
         FROM projects p LEFT JOIN assignments a ON a.project_id = p.id
        GROUP BY p.id ORDER BY p.updated_at DESC`,
    ).all();
    return json({ ok: true, projects: results.results });
  }
  if (request.method === "POST") {
    sameOrigin(request);
    requireRole(actor, "rea");
    const body = await bodyJson<Record<string, unknown>>(request);
    const code = text(body.code, "code", { required: true, max: 32 }).toUpperCase();
    const name = text(body.name, "name", { required: true, max: 160 });
    const program = text(body.program, "program", { required: true, max: 120 });
    const state = text(body.state, "state", { required: true, max: 80 });
    const lga = text(body.lga, "lga", { required: true, max: 100 });
    const description = text(body.description, "description", { max: 2_000 });
    const id = crypto.randomUUID();
    const timestamp = now();
    try {
      await env.VERITAS_DB.prepare(
        `INSERT INTO projects
          (id, code, name, program, state, lga, description, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).bind(id, code, name, program, state, lga, description, actor.id, timestamp, timestamp).run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new ApiError(409, "That project code is already in use.", "duplicate_code");
      throw error;
    }
    await audit(env, request, actor.id, "project.create", "project", id, { code });
    return json({ ok: true, project: { id, code, name, program, state, lga, description, status: "active", createdAt: timestamp } }, 201);
  }
  return methodNotAllowed(["GET", "POST"]);
}

function assignmentWhere(user: UserRow): { sql: string; binding?: string } {
  if (user.role === "field") return { sql: "WHERE a.field_officer_id = ?", binding: user.id };
  if (user.role === "consultant") return { sql: "WHERE a.consultant_id = ?", binding: user.id };
  return { sql: "" };
}

async function handleAssignments(request: Request, env: Bindings): Promise<Response> {
  const actor = (await currentUser(request, env))!;
  if (request.method === "GET") {
    const scope = assignmentWhere(actor);
    let statement = env.VERITAS_DB.prepare(
      `SELECT a.id, a.project_id AS projectId, p.code AS projectCode, p.name AS projectName,
              a.field_officer_id AS fieldOfficerId, f.display_name AS fieldOfficerName,
              a.consultant_id AS consultantId, c.display_name AS consultantName,
              a.status, a.scheduled_for AS scheduledFor, a.latitude, a.longitude,
              a.version, a.created_at AS createdAt, a.updated_at AS updatedAt
         FROM assignments a
         JOIN projects p ON p.id = a.project_id
         JOIN users f ON f.id = a.field_officer_id
         LEFT JOIN users c ON c.id = a.consultant_id
         ${scope.sql} ORDER BY a.updated_at DESC`,
    );
    if (scope.binding) statement = statement.bind(scope.binding);
    const results = await statement.all();
    return json({ ok: true, assignments: results.results });
  }
  if (request.method === "POST") {
    sameOrigin(request);
    requireRole(actor, "rea");
    const body = await bodyJson<Record<string, unknown>>(request);
    const projectId = text(body.projectId, "projectId", { required: true, max: 64 });
    const fieldOfficerId = text(body.fieldOfficerId, "fieldOfficerId", { required: true, max: 64 });
    const consultantId = text(body.consultantId, "consultantId", { max: 64 }) || null;
    const scheduledFor = text(body.scheduledFor, "scheduledFor", { max: 64 }) || null;
    const [project, officer, consultant] = await Promise.all([
      env.VERITAS_DB.prepare("SELECT id FROM projects WHERE id = ? AND status = 'active'").bind(projectId).first(),
      env.VERITAS_DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'field' AND status = 'active'").bind(fieldOfficerId).first(),
      consultantId
        ? env.VERITAS_DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'consultant' AND status = 'active'").bind(consultantId).first()
        : Promise.resolve({ id: null }),
    ]);
    if (!project) throw new ApiError(400, "Select an active project.", "invalid_project");
    if (!officer) throw new ApiError(400, "Select an active field officer.", "invalid_field_officer");
    if (consultantId && !consultant) throw new ApiError(400, "Select an active consultant.", "invalid_consultant");
    const id = crypto.randomUUID();
    const timestamp = now();
    await env.VERITAS_DB.prepare(
      `INSERT INTO assignments
        (id, project_id, field_officer_id, consultant_id, status, scheduled_for, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Assigned', ?, ?, ?, ?)`,
    ).bind(id, projectId, fieldOfficerId, consultantId, scheduledFor, actor.id, timestamp, timestamp).run();
    await audit(env, request, actor.id, "assignment.create", "assignment", id, { projectId, fieldOfficerId, consultantId });
    return json({ ok: true, assignment: { id, projectId, fieldOfficerId, consultantId, status: "Assigned", scheduledFor, version: 1 } }, 201);
  }
  return methodNotAllowed(["GET", "POST"]);
}

function actionTransition(action: string, assignment: AssignmentRow, actor: UserRow): AssignmentStatus {
  const rules: Record<string, { role: Role; from: AssignmentStatus[]; to: AssignmentStatus }> = {
    "start-route": { role: "field", from: ["Assigned", "Re-inspection"], to: "En route" },
    "verify-arrival": { role: "field", from: ["En route"], to: "Arrived" },
    "save-draft": { role: "field", from: ["Arrived", "Draft", "Rejected", "Re-inspection"], to: "Draft" },
    submit: { role: "field", from: ["Arrived", "Draft", "Rejected", "Re-inspection"], to: "Submitted" },
    "consultant-approve": { role: "consultant", from: ["Submitted"], to: "Approved" },
    "consultant-reject": { role: "consultant", from: ["Submitted"], to: "Rejected" },
    "rea-verify": { role: "rea", from: ["Approved"], to: "Verified" },
    "rea-reinspect": { role: "rea", from: ["Approved"], to: "Re-inspection" },
  };
  const rule = rules[action];
  if (!rule) throw new ApiError(404, "Unknown workflow action.", "not_found");
  requireRole(actor, rule.role);
  if (!rule.from.includes(assignment.status)) {
    throw new ApiError(409, `Cannot ${action} while assignment is ${assignment.status}.`, "invalid_transition");
  }
  return rule.to;
}

async function handleAssignmentAction(request: Request, env: Bindings, id: string, action: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  sameOrigin(request);
  const actor = (await currentUser(request, env))!;
  const assignment = await assignmentForUser(env, id, actor);
  const nextStatus = actionTransition(action, assignment, actor);
  const body = await bodyJson<Record<string, unknown>>(request);
  const expectedVersion = numberValue(body.version, "version", 1, Number.MAX_SAFE_INTEGER);
  if (expectedVersion !== null && expectedVersion !== assignment.version) {
    throw new ApiError(409, "This assignment changed. Refresh before trying again.", "version_conflict");
  }
  const summary = text(body.summary, "summary", { max: 5_000 });
  const notes = text(body.notes, "notes", { max: 5_000 });
  const latitude = numberValue(body.latitude, "latitude", -90, 90);
  const longitude = numberValue(body.longitude, "longitude", -180, 180);
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
  const timestamp = now();
  const reportId = crypto.randomUUID();

  const statements = [
    env.VERITAS_DB.prepare(
      `UPDATE assignments
          SET status = ?, latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude),
              version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
    ).bind(nextStatus, latitude, longitude, timestamp, id, assignment.version),
  ];

  if (["save-draft", "submit"].includes(action)) {
    statements.push(env.VERITAS_DB.prepare(
      `INSERT INTO reports
        (id, assignment_id, summary, payload_json, submitted_at, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assignment_id) DO UPDATE SET
         summary = excluded.summary, payload_json = excluded.payload_json,
         submitted_at = excluded.submitted_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(reportId, id, summary, JSON.stringify(payload), action === "submit" ? timestamp : null, actor.id, timestamp, timestamp));
  } else if (action.startsWith("consultant-")) {
    statements.push(env.VERITAS_DB.prepare(
      `UPDATE reports SET consultant_notes = ?, consultant_reviewed_at = ?, updated_by = ?, updated_at = ?
        WHERE assignment_id = ?`,
    ).bind(notes, timestamp, actor.id, timestamp, id));
  } else if (action.startsWith("rea-")) {
    statements.push(env.VERITAS_DB.prepare(
      `UPDATE reports SET rea_notes = ?, rea_reviewed_at = ?, updated_by = ?, updated_at = ?
        WHERE assignment_id = ?`,
    ).bind(notes, timestamp, actor.id, timestamp, id));
  }
  const results = await env.VERITAS_DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, "Assignment changed during this request.", "version_conflict");
  await audit(env, request, actor.id, `assignment.${action}`, "assignment", id, { from: assignment.status, to: nextStatus });
  return json({ ok: true, assignment: { id, status: nextStatus, version: assignment.version + 1, updatedAt: timestamp } });
}

function evidenceLimits(contentType: string): { kind: "photo" | "video" | "document" | "signature"; max: number } {
  if (contentType.startsWith("image/")) return { kind: "photo", max: 25 * 1024 * 1024 };
  if (contentType.startsWith("video/")) return { kind: "video", max: 200 * 1024 * 1024 };
  if (contentType === "application/pdf") return { kind: "document", max: 25 * 1024 * 1024 };
  throw new ApiError(415, "Only images, videos, and PDF evidence are accepted.", "unsupported_evidence");
}

async function handleEvidenceUpload(request: Request, env: Bindings, assignmentId: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  sameOrigin(request);
  const actor = (await currentUser(request, env))!;
  requireRole(actor, "rea", "field");
  const assignment = await assignmentForUser(env, assignmentId, actor);
  if (actor.role === "field" && ["Submitted", "Approved", "Verified"].includes(assignment.status)) {
    throw new ApiError(409, "Evidence cannot be added after submission.", "assignment_locked");
  }
  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const limits = evidenceLimits(contentType);
  const byteSize = Number(request.headers.get("content-length"));
  if (!Number.isInteger(byteSize) || byteSize < 1) {
    throw new ApiError(411, "Content-Length is required for evidence uploads.", "length_required");
  }
  if (byteSize > limits.max) throw new ApiError(413, "Evidence file is too large.", "evidence_too_large");
  if (!request.body) throw new ApiError(400, "Evidence body is required.", "missing_body");
  const url = new URL(request.url);
  const filename = text(url.searchParams.get("filename"), "filename", { required: true, max: 180 });
  const requestedKind = url.searchParams.get("kind");
  const kind = requestedKind === "signature" && contentType.startsWith("image/") ? "signature" : limits.kind;
  const latitude = numberValue(url.searchParams.get("latitude"), "latitude", -90, 90);
  const longitude = numberValue(url.searchParams.get("longitude"), "longitude", -180, 180);
  const capturedAt = text(url.searchParams.get("capturedAt"), "capturedAt", { max: 64 }) || null;
  const id = crypto.randomUUID();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
  const objectKey = `assignments/${assignmentId}/${id}-${safeFilename}`;
  await env.EVIDENCE_BUCKET.put(objectKey, request.body, {
    httpMetadata: { contentType },
    customMetadata: { assignmentId, uploadedBy: actor.id, filename },
  });
  try {
    await env.VERITAS_DB.prepare(
      `INSERT INTO evidence
        (id, assignment_id, uploaded_by, object_key, kind, filename, content_type, byte_size,
         latitude, longitude, captured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, assignmentId, actor.id, objectKey, kind, filename, contentType, byteSize, latitude, longitude, capturedAt, now()).run();
  } catch (error) {
    await env.EVIDENCE_BUCKET.delete(objectKey);
    throw error;
  }
  await audit(env, request, actor.id, "evidence.upload", "evidence", id, { assignmentId, kind, byteSize });
  return json({ ok: true, evidence: { id, assignmentId, kind, filename, contentType, byteSize, latitude, longitude, capturedAt } }, 201);
}

async function handleEvidenceGet(request: Request, env: Bindings, evidenceId: string): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const actor = (await currentUser(request, env))!;
  const evidence = await env.VERITAS_DB.prepare(
    `SELECT id, assignment_id, object_key, filename, content_type, byte_size FROM evidence WHERE id = ?`,
  ).bind(evidenceId).first<{ id: string; assignment_id: string; object_key: string; filename: string; content_type: string; byte_size: number }>();
  if (!evidence) throw new ApiError(404, "Evidence not found.", "not_found");
  await assignmentForUser(env, evidence.assignment_id, actor);
  const object = await env.EVIDENCE_BUCKET.get(evidence.object_key);
  if (!object) throw new ApiError(404, "Evidence object not found.", "not_found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", evidence.content_type);
  headers.set("content-length", String(evidence.byte_size));
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function handleDashboard(request: Request, env: Bindings): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const actor = (await currentUser(request, env))!;
  const scope = assignmentWhere(actor);
  let countsStatement = env.VERITAS_DB.prepare(
    `SELECT a.status, COUNT(*) AS count FROM assignments a ${scope.sql} GROUP BY a.status`,
  );
  let recentStatement = env.VERITAS_DB.prepare(
    `SELECT a.id, a.status, a.updated_at AS updatedAt, p.code AS projectCode, p.name AS projectName
       FROM assignments a JOIN projects p ON p.id = a.project_id ${scope.sql}
      ORDER BY a.updated_at DESC LIMIT 10`,
  );
  if (scope.binding) {
    countsStatement = countsStatement.bind(scope.binding);
    recentStatement = recentStatement.bind(scope.binding);
  }
  const [counts, recent] = await Promise.all([countsStatement.all(), recentStatement.all()]);
  return json({ ok: true, counts: counts.results, recentAssignments: recent.results });
}

async function authoritativeContext(env: Bindings): Promise<Record<string, unknown>> {
  const [projects, assignments, evidence, recentEvents] = await Promise.all([
    env.VERITAS_DB.prepare("SELECT status, COUNT(*) AS count FROM projects GROUP BY status").all(),
    env.VERITAS_DB.prepare("SELECT status, COUNT(*) AS count FROM assignments GROUP BY status").all(),
    env.VERITAS_DB.prepare("SELECT kind, COUNT(*) AS count, SUM(byte_size) AS bytes FROM evidence GROUP BY kind").all(),
    env.VERITAS_DB.prepare(
      `SELECT action, entity_type AS entityType, entity_id AS entityId, created_at AS createdAt
         FROM audit_events ORDER BY created_at DESC LIMIT 30`,
    ).all(),
  ]);
  return {
    generatedAt: now(),
    projectCounts: projects.results,
    assignmentCounts: assignments.results,
    evidenceCounts: evidence.results,
    recentEvents: recentEvents.results,
  };
}

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("\n");
}

async function handleAssistant(request: Request, env: Bindings): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  sameOrigin(request);
  const actor = (await currentUser(request, env))!;
  requireRole(actor, "rea", "consultant");
  if (!env.OPENAI_API_KEY) throw new ApiError(503, "The AI assistant is not configured.", "ai_not_configured");
  const body = await bodyJson<{ message?: unknown }>(request, 32_000);
  const message = text(body.message, "message", { required: true, max: 10_000 });
  const context = await authoritativeContext(env);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      instructions: "You are the Veritas monitoring assistant. Use only the supplied authoritative database summary. State clearly when detailed evidence is unavailable. Never invent project facts or personal data.",
      input: `Authoritative Veritas summary:\n${JSON.stringify(context)}\n\nUser request:\n${message}`,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error("OpenAI request failed", { status: response.status });
    throw new ApiError(502, "The AI assistant could not complete the request.", "ai_upstream_error");
  }
  await audit(env, request, actor.id, "assistant.query", "assistant", crypto.randomUUID());
  return json({ ok: true, response: responseText(result) });
}

async function dispatch(request: Request, env: Bindings): Promise<Response> {
  const parts = routeParts(request);
  if (parts.length === 1 && parts[0] === "health") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const database = await env.VERITAS_DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: database?.ok === 1, service: "veritas-api", time: now() });
  }
  if (parts[0] === "auth" && parts[1] === "login" && parts.length === 2) return handleLogin(request, env);
  if (parts[0] === "auth" && parts[1] === "session" && parts.length === 2) return handleSession(request, env);
  if (parts[0] === "auth" && parts[1] === "rea-session" && parts.length === 2) {
    return request.method === "POST" ? handleLogin(request, env) : handleSession(request, env);
  }
  if (parts[0] === "users" && parts.length === 1) return handleUsers(request, env);
  if (parts[0] === "users" && parts[2] === "status" && parts.length === 3) return handleUserStatus(request, env, parts[1]);
  if (parts[0] === "projects" && parts.length === 1) return handleProjects(request, env);
  if (parts[0] === "assignments" && parts.length === 1) return handleAssignments(request, env);
  if (parts[0] === "assignments" && parts[2] === "actions" && parts.length === 4) {
    return handleAssignmentAction(request, env, parts[1], parts[3]);
  }
  if (parts[0] === "assignments" && parts[2] === "evidence" && parts.length === 3) {
    return handleEvidenceUpload(request, env, parts[1]);
  }
  if (parts[0] === "evidence" && parts.length === 2) return handleEvidenceGet(request, env, parts[1]);
  if (parts[0] === "dashboard" && parts.length === 1) return handleDashboard(request, env);
  if (parts[0] === "rea-assistant" && parts.length === 1) return handleAssistant(request, env);
  throw new ApiError(404, "API route not found.", "not_found");
}

export const onRequest: PagesFunction<Bindings> = async ({ request, env }) => {
  try {
    return await dispatch(request, env);
  } catch (error) {
    return fail(error);
  }
};
