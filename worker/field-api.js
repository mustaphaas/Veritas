const encoder = new TextEncoder();
const SESSION_DAYS = 7;

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
const now = () => new Date().toISOString();
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
}

async function verifyPassword(password, salt, expected) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 100000 }, key, 256);
  return b64(bits) === expected;
}

async function passwordRecord(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 100000 }, key, 256);
  return { salt: b64(saltBytes), hash: b64(bits) };
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function currentUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return null;
  const tokenHash = await digest(bearer);
  const user = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.phone,u.role,u.consultant_firm AS consultantFirm
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`).bind(tokenHash, now()).first();
  if (user) await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").bind(now(), tokenHash).run();
  return user;
}

function distanceMetres(aLat, aLon, bLat, bLon) {
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function audit(env, request, user, assignmentId, action, details = {}) {
  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), assignmentId, user.id, action, JSON.stringify(details), request.headers.get("CF-Connecting-IP"), now()).run();
}

async function assignedRecord(env, id, user) {
  const scope = user.role === "field_officer" ? "AND a.officer_id=?" : user.role === "consultant_admin" ? "AND p.consultant_firm=?" : "";
  const value = user.role === "field_officer" ? user.id : user.consultantFirm;
  const sql = `SELECT a.*,p.name AS project_name,p.programme,p.component,p.contractor,p.consultant_firm,p.state,p.lga,p.community,p.latitude,p.longitude,p.geofence_radius_metres,u.name AS officer_name
    FROM assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.officer_id WHERE a.id=? ${scope}`;
  return value ? env.DB.prepare(sql).bind(id, value).first() : env.DB.prepare(sql).bind(id).first();
}

function assignmentJson(row) {
  return {
    id: row.id, projectId: row.project_id, projectName: row.project_name, programme: row.programme, component: row.component,
    contractor: row.contractor, consultantFirm: row.consultant_firm, state: row.state, lga: row.lga, community: row.community,
    latitude: row.latitude, longitude: row.longitude, geofenceRadiusMetres: row.geofence_radius_metres, officer: row.officer_name,
    dueDate: row.due_date, status: row.status, arrival: row.arrival_json ? JSON.parse(row.arrival_json) : undefined,
    report: row.report_json ? JSON.parse(row.report_json) : undefined, syncRevision: row.sync_revision, updatedAt: row.updated_at,
  };
}

async function login(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.identifier || !body?.password) return response({ error: "Phone/email and password are required." }, 400);
  const identifier = String(body.identifier).trim().toLowerCase();
  const user = await env.DB.prepare(`SELECT u.*,r.staff_role,r.department,r.access_json
    FROM users u LEFT JOIN rea_staff_accounts r ON r.user_id=u.id
    WHERE (lower(u.email)=? OR u.phone=?) AND u.status='active'`).bind(identifier, identifier).first();
  if (!user) return response({ error: "Invalid credentials." }, 401);
  let passwordMatches = false;
  try {
    passwordMatches = await verifyPassword(String(body.password), user.password_salt, user.password_hash);
  } catch (error) {
    console.error(JSON.stringify({ event: "password-verification-failed", name: error?.name, message: error?.message }));
    return response({ error: "The authentication service could not verify this account.", code: "PASSWORD_VERIFICATION_FAILED", detail: error?.message || error?.name || "Unknown verification error." }, 500);
  }
  if (!passwordMatches) return response({ error: "Invalid credentials." }, 401);
  const sessionToken = token(), createdAt = now(), expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)").bind(await digest(sessionToken), user.id, createdAt, expiresAt, createdAt).run();
  await audit(env, request, user, null, "login", { sessionExpiresAt: expiresAt });
  const effectiveRole = user.role === "rea_admin" && user.staff_role && user.staff_role !== "REA Administrator" ? "rea_staff" : user.role;
  return response({ token: sessionToken, expiresAt, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: effectiveRole, consultantFirm: user.consultant_firm, staffRole: user.staff_role || "", department: user.department || "", access: (() => { try { return JSON.parse(user.access_json || "[]"); } catch { return []; } })() } });
}

async function listAssignments(env, user, url) {
  const since = url.searchParams.get("since") || "1970-01-01T00:00:00.000Z";
  let sql = `SELECT a.*,p.name AS project_name,p.programme,p.component,p.contractor,p.consultant_firm,p.state,p.lga,p.community,p.latitude,p.longitude,p.geofence_radius_metres,u.name AS officer_name
    FROM assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.officer_id WHERE a.updated_at>?`;
  const args = [since];
  if (user.role === "field_officer") { sql += " AND a.officer_id=?"; args.push(user.id); }
  if (user.role === "consultant_admin") { sql += " AND p.consultant_firm=?"; args.push(user.consultantFirm); }
  sql += " ORDER BY a.updated_at DESC";
  const result = await env.DB.prepare(sql).bind(...args).all();
  return response({ assignments: result.results.map(assignmentJson), serverTime: now() });
}

async function createAssignment(request, env, user) {
  if (!["consultant_admin", "rea_admin"].includes(user.role)) return response({ error: "Consultant or REA access required." }, 403);
  const body = await request.json().catch(() => null), project = body?.project ?? body;
  const officer = await env.DB.prepare("SELECT id,name,consultant_firm FROM users WHERE role='field_officer' AND status='active' AND (id=? OR name=? OR lower(email)=? OR phone=?)")
    .bind(body?.officerId || "", body?.officer || "", String(body?.officerEmail || "").toLowerCase(), body?.officerPhone || "").first();
  if (!officer) return response({ error: "Active field officer not found." }, 422);
  if (user.role === "consultant_admin" && officer.consultant_firm !== user.consultantFirm) return response({ error: "Officer is outside your consultant firm." }, 403);
  const required = ["id", "projectName", "programme", "component", "contractor", "state", "lga", "community", "latitude", "longitude", "dueDate"];
  if (required.some((key) => project?.[key] === undefined || project?.[key] === "")) return response({ error: "Complete project and assignment details are required." }, 400);
  const projectId = project.projectId || project.id, timestamp = now(), consultantFirm = user.role === "consultant_admin" ? user.consultantFirm : project.consultantFirm || officer.consultant_firm;
  await env.DB.prepare(`INSERT INTO projects(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,programme=excluded.programme,component=excluded.component,contractor=excluded.contractor,consultant_firm=excluded.consultant_firm,state=excluded.state,lga=excluded.lga,community=excluded.community,latitude=excluded.latitude,longitude=excluded.longitude,updated_at=excluded.updated_at`)
    .bind(projectId, project.projectName, project.programme, project.component, project.contractor, consultantFirm, project.state, project.lga, project.community, Number(project.latitude), Number(project.longitude), Number(project.geofenceRadius || project.geofenceRadiusMetres || 250), timestamp, timestamp).run();
  await env.DB.prepare("INSERT INTO assignments(id,project_id,officer_id,status,due_date,sync_revision,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET officer_id=excluded.officer_id,due_date=excluded.due_date,updated_at=excluded.updated_at,sync_revision=assignments.sync_revision+1")
    .bind(project.id, projectId, officer.id, "Assigned", project.dueDate, timestamp, timestamp).run();
  await audit(env, request, user, project.id, "assignment-created", { officerId: officer.id, projectId });
  return response({ ok: true, assignmentId: project.id, serverTime: timestamp }, 201);
}

async function createFieldOfficer(request, env, user) {
  if (!["consultant_admin", "rea_admin"].includes(user.role)) return response({ error: "Consultant or REA access required." }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.password || (!body?.email && !body?.phone)) return response({ error: "Name, password and phone or email are required." }, 400);
  const consultantFirm = user.role === "consultant_admin" ? user.consultantFirm : body.consultantFirm;
  if (!consultantFirm) return response({ error: "Consultant firm is required." }, 400);
  const credentials = await passwordRecord(String(body.password));
  const id = body.id || `officer-${crypto.randomUUID()}`, timestamp = now();
  try {
    await env.DB.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(id, String(body.name).trim(), body.email ? String(body.email).trim().toLowerCase() : null, body.phone ? String(body.phone).trim() : null, "field_officer", consultantFirm, credentials.salt, credentials.hash, "active", timestamp).run();
  } catch { return response({ error: "A user with this email or phone already exists." }, 409); }
  await audit(env, request, user, null, "field-officer-created", { officerId: id, consultantFirm });
  return response({ ok: true, user: { id, name: body.name, email: body.email, phone: body.phone, role: "field_officer", consultantFirm } }, 201);
}

async function saveArrival(request, env, user, assignment) {
  if (user.role !== "field_officer") return response({ error: "Field officer access required." }, 403);
  const body = await request.json().catch(() => null);
  if (!Number.isFinite(body?.latitude) || !Number.isFinite(body?.longitude)) return response({ error: "Valid GPS coordinates are required." }, 400);
  const distance = distanceMetres(body.latitude, body.longitude, assignment.latitude, assignment.longitude);
  if (distance > assignment.geofence_radius_metres) return response({ error: "Outside project geofence.", distanceMetres: distance }, 422);
  const arrival = { ...body, distanceMetres: distance, verifiedAt: now(), serverReceivedAt: now() };
  await env.DB.prepare("UPDATE assignments SET arrival_json=?,sync_revision=sync_revision+1,updated_at=? WHERE id=?")
    .bind(JSON.stringify(arrival), now(), assignment.id).run();
  await audit(env, request, user, assignment.id, "arrival-verified", { distanceMetres: distance, accuracyMetres: body.accuracyMetres });
  return response({ arrival, serverTime: now() });
}

async function saveDraft(request, env, user, assignment) {
  if (user.role !== "field_officer" || assignment.officer_id !== user.id) return response({ error: "Not assigned to this officer." }, 403);
  if (!assignment.arrival_json) return response({ error: "GPS verification is required before saving a draft." }, 423);
  if (["Submitted", "Approved", "Verified"].includes(assignment.status)) return response({ error: "Inspection is locked." }, 423);
  const body = await request.json().catch(() => null);
  if (!body?.report || typeof body.report !== "object") return response({ error: "Report is required." }, 400);
  const updatedAt = now();
  await env.DB.prepare("UPDATE assignments SET report_json=?,status='Draft',sync_revision=sync_revision+1,updated_at=? WHERE id=?")
    .bind(JSON.stringify({ ...body.report, serverReceivedAt: updatedAt }), updatedAt, assignment.id).run();
  await audit(env, request, user, assignment.id, "draft-saved", { clientUpdatedAt: body.report.updatedAt });
  return response({ ok: true, status: "Draft", serverTime: updatedAt });
}

async function uploadEvidence(request, env, user, assignment, evidenceId) {
  if (!env.EVIDENCE) return response({ error: "Evidence storage is not enabled. This upload will remain queued on the device." }, 503);
  if (user.role !== "field_officer" || assignment.officer_id !== user.id) return response({ error: "Not assigned to this officer." }, 403);
  if (!assignment.arrival_json) return response({ error: "GPS verification is required." }, 423);
  if (["Submitted", "Approved", "Verified"].includes(assignment.status)) return response({ error: "Inspection is locked." }, 423);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 100 * 1024 * 1024) return response({ error: "Evidence must be between 1 byte and 100 MB." }, 413);
  const actualHash = await digest(bytes), claimedHash = request.headers.get("X-Content-SHA256")?.toLowerCase();
  if (!claimedHash || claimedHash !== actualHash) return response({ error: "Evidence integrity check failed." }, 422);
  const metadata = JSON.parse(decodeURIComponent(request.headers.get("X-Veritas-Metadata") || "%7B%7D"));
  const mediaType = metadata.type === "video" ? "video" : "photo";
  const key = `assignments/${assignment.id}/${evidenceId}`;
  await env.EVIDENCE.put(key, bytes, { httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" }, customMetadata: { sha256: actualHash, assignmentId: assignment.id } });
  await env.DB.prepare("INSERT OR REPLACE INTO evidence(id,assignment_id,r2_key,media_type,content_type,size_bytes,sha256,metadata_json,captured_at,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(evidenceId, assignment.id, key, mediaType, request.headers.get("Content-Type") || "application/octet-stream", bytes.byteLength, actualHash, JSON.stringify(metadata), metadata.capturedAt || now(), now()).run();
  await audit(env, request, user, assignment.id, "evidence-uploaded", { evidenceId, mediaType, sizeBytes: bytes.byteLength, sha256: actualHash });
  return response({ ok: true, evidenceId, sha256: actualHash, serverTime: now() }, 201);
}

async function submit(request, env, user, assignment) {
  if (user.role !== "field_officer" || assignment.officer_id !== user.id) return response({ error: "Not assigned to this officer." }, 403);
  if (!assignment.arrival_json) return response({ error: "GPS verification is required." }, 423);
  if (["Submitted", "Approved", "Verified"].includes(assignment.status)) return response({ error: "Inspection is locked." }, 423);
  const body = await request.json().catch(() => null);
  const evidence = await env.DB.prepare("SELECT COUNT(*) AS count FROM evidence WHERE assignment_id=?").bind(assignment.id).first();
  if (!body?.report || !body.formIntegrityHash || !body.signatureIntegrityHash || Number(evidence?.count || 0) < 1) return response({ error: "Complete report, signatures, integrity hashes and evidence are required." }, 422);
  const signatures = { community: body.report.communitySignature, contractor: body.report.contractorSignature };
  const expectedSignatureHash = await digest(canonicalJson(signatures));
  const expectedFormHash = await digest(canonicalJson({ assignmentId: assignment.id, values: body.report.values ?? {}, evidence: (body.report.evidence ?? []).map((item) => item.integrityHash ?? item.id), signatures }));
  if (expectedSignatureHash !== body.signatureIntegrityHash || expectedFormHash !== body.formIntegrityHash) return response({ error: "Submitted report integrity check failed." }, 422);
  const submittedAt = now();
  await env.DB.prepare("UPDATE assignments SET report_json=?,form_hash=?,signature_hash=?,status='Submitted',submitted_at=?,locked_at=?,sync_revision=sync_revision+1,updated_at=? WHERE id=?")
    .bind(JSON.stringify({ ...body.report, serverReceivedAt: submittedAt }), body.formIntegrityHash, body.signatureIntegrityHash, submittedAt, submittedAt, submittedAt, assignment.id).run();
  await audit(env, request, user, assignment.id, "inspection-submitted", { formIntegrityHash: body.formIntegrityHash });
  return response({ ok: true, status: "Submitted", serverReceivedAt: submittedAt });
}

async function review(request, env, user, assignment) {
  const body = await request.json().catch(() => null), status = body?.status;
  const valid = user.role === "consultant_admin" && assignment.status === "Submitted" && ["Approved", "Re-inspection"].includes(status)
    || user.role === "rea_admin" && assignment.status === "Approved" && ["Verified", "Re-inspection"].includes(status);
  if (!valid) return response({ error: "Invalid review transition or role." }, 403);
  const timestamp = now(), column = status === "Approved" ? "approved_at" : status === "Verified" ? "verified_at" : null;
  const sql = column ? `UPDATE assignments SET status=?,${column}=?,sync_revision=sync_revision+1,updated_at=? WHERE id=?` : "UPDATE assignments SET status=?,locked_at=NULL,sync_revision=sync_revision+1,updated_at=? WHERE id=?";
  const args = column ? [status, timestamp, timestamp, assignment.id] : [status, timestamp, assignment.id];
  await env.DB.prepare(sql).bind(...args).run();
  await audit(env, request, user, assignment.id, `inspection-${status.toLowerCase()}`, { note: body.note || "" });
  return response({ ok: true, status, serverTime: timestamp });
}



async function collaborativeStaff(env) {
  const result = await env.DB.prepare(`SELECT u.id,u.name,u.email,
      COALESCE(r.staff_role,'REA Administrator') AS role
    FROM users u LEFT JOIN rea_staff_accounts r ON r.user_id=u.id
    WHERE u.role='rea_admin' AND u.status='active' ORDER BY u.name`).all();
  return result.results;
}

async function collaborativeTeams(env) {
  const result = await env.DB.prepare(`
    SELECT t.id,t.name,t.team_lead_id,t.status,
      lead.name AS team_lead_name
    FROM inspection_teams t
    JOIN users lead ON lead.id=t.team_lead_id
    ORDER BY t.updated_at DESC
  `).all();
  const teams = [];
  for (const row of result.results) {
    const members = await env.DB.prepare(`
      SELECT u.id,u.name,u.email
      FROM inspection_team_members m JOIN users u ON u.id=m.user_id
      WHERE m.team_id=? ORDER BY u.name
    `).bind(row.id).all();
    teams.push({ id: row.id, name: row.name, teamLeadId: row.team_lead_id, teamLeadName: row.team_lead_name, status: row.status, members: members.results });
  }
  return teams;
}

async function collaborativeInspections(env) {
  const result = await env.DB.prepare(`
    SELECT i.id,i.team_id,i.project_id,i.status,i.due_date,i.form_json,i.section_assignments_json,
      i.version,i.last_saved_by,i.created_at,i.updated_at,i.submitted_at,
      p.name AS project_name,p.programme,p.component,p.contractor,p.state,p.lga,p.community,
      t.name AS team_name
    FROM collaborative_inspections i
    JOIN projects p ON p.id=i.project_id
    JOIN inspection_teams t ON t.id=i.team_id
    ORDER BY i.updated_at DESC
  `).all();
  return result.results.map((row) => ({
    id: row.id, teamId: row.team_id, projectId: row.project_id, status: row.status,
    dueDate: row.due_date, form: JSON.parse(row.form_json || "{}"),
    sectionAssignments: JSON.parse(row.section_assignments_json || "{}"),
    version: row.version, updatedAt: row.updated_at, lastSavedBy: row.last_saved_by,
    submittedAt: row.submitted_at, projectName: row.project_name, teamName: row.team_name,
    programme: row.programme, component: row.component, contractor: row.contractor,
    state: row.state, lga: row.lga, community: row.community,
  }));
}

async function handleCollaborativeInspections(request, env, user) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith("/api/field/rea-inspections")) return null;
  if (user.role !== "rea_admin" && user.role !== "rea_staff") return response({ error: "REA access required." }, 403);

  if (path === "/api/field/rea-inspections" && request.method === "GET") {
    return response({
      staff: await collaborativeStaff(env),
      teams: await collaborativeTeams(env),
      projects: (await env.DB.prepare("SELECT id,name,programme,component,contractor,state,lga,community FROM projects ORDER BY name").all()).results,
      inspections: await collaborativeInspections(env),
      serverTime: now(),
    });
  }

  if (path === "/api/field/rea-inspections/teams" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const memberIds = [...new Set([body?.teamLeadId, ...(Array.isArray(body?.memberIds) ? body.memberIds : [])].filter(Boolean))];
    if (!body?.name || !body?.teamLeadId || !memberIds.length) return response({ error: "Team name, Team Lead and at least one staff member are required." }, 400);
    const lead = await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='rea_admin' AND status='active'").bind(body.teamLeadId).first();
    if (!lead) return response({ error: "Team Lead must be an active REA staff member." }, 422);
    const placeholders = memberIds.map(() => "?").join(",");
    const valid = await env.DB.prepare(`SELECT u.id FROM users u WHERE u.role='rea_admin' AND u.status='active' AND u.id IN (\${placeholders})`).bind(...memberIds).all();
    if (valid.results.length !== memberIds.length) return response({ error: "All team members must be active REA staff." }, 422);
    const id = `team-${crypto.randomUUID()}`, timestamp = now();
    await env.DB.prepare("INSERT INTO inspection_teams(id,name,team_lead_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .bind(id, String(body.name).trim(), body.teamLeadId, "Active", timestamp, timestamp).run();
    for (const memberId of memberIds) {
      await env.DB.prepare("INSERT INTO inspection_team_members(team_id,user_id,created_at) VALUES(?,?,?)").bind(id, memberId, timestamp).run();
    }
    await audit(env, request, user, null, "inspection-team-created", { teamId: id, teamLeadId: body.teamLeadId, memberIds });
    return response({ ok: true, teamId: id }, 201);
  }

  if (path === "/api/field/rea-inspections/assign" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const team = await env.DB.prepare("SELECT id FROM inspection_teams WHERE id=? AND status='Active'").bind(body?.teamId).first();
    const project = await env.DB.prepare("SELECT id FROM projects WHERE id=?").bind(body?.projectId).first();
    if (!team || !project) return response({ error: "Active team and valid project are required." }, 422);
    const existing = await env.DB.prepare("SELECT id FROM collaborative_inspections WHERE team_id=? AND project_id=?").bind(body.teamId, body.projectId).first();
    if (existing) return response({ error: "This project is already assigned to this team.", inspectionId: existing.id }, 409);
    const id = `insp-${crypto.randomUUID()}`, timestamp = now();
    await env.DB.prepare(`INSERT INTO collaborative_inspections(id,team_id,project_id,status,due_date,form_json,section_assignments_json,version,last_saved_by,created_at,updated_at)
      VALUES(?,?,?,?,?,'{}','{}',1,?,?,?)`)
      .bind(id, body.teamId, body.projectId, "In Progress", body.dueDate || null, user.id, timestamp, timestamp).run();
    await audit(env, request, user, null, "collaborative-inspection-assigned", { inspectionId: id, teamId: body.teamId, projectId: body.projectId });
    return response({ ok: true, inspectionId: id }, 201);
  }

  const match = path.match(/^\/api\/field\/rea-inspections\/([^/]+)(?:\/(submit))?$/);
  if (!match) return response({ error: "Endpoint not found." }, 404);
  const inspectionId = decodeURIComponent(match[1]);
  const inspection = await env.DB.prepare("SELECT * FROM collaborative_inspections WHERE id=?").bind(inspectionId).first();
  if (!inspection) return response({ error: "Inspection not found." }, 404);
  const team = await env.DB.prepare("SELECT * FROM inspection_teams WHERE id=?").bind(inspection.team_id).first();
  if (!team) return response({ error: "Inspection team not found." }, 404);
  const member = await env.DB.prepare("SELECT 1 FROM inspection_team_members WHERE team_id=? AND user_id=?").bind(team.id, user.id).first();
  if (!member) return response({ error: "You are not a member of this inspection team." }, 403);

  if (match[2] === "submit" && request.method === "POST") {
    if (team.team_lead_id !== user.id) return response({ error: "Only the Team Lead can submit the inspection." }, 403);
    if (["Submitted","Approved","Verified"].includes(inspection.status)) return response({ error: "Inspection is already locked." }, 423);
    const form = JSON.parse(inspection.form_json || "{}");
    const requiredFields = [
      "Project reference confirmed","Programme and component","Contractor details","Site condition","GPS/location notes",
      "Access and surroundings","Equipment installed","Capacity / specification","Condition and operation","Beneficiary count",
      "Community served","Service availability","Photo references","Supporting documents","Evidence notes","HSE observations",
      "Environmental observations","Corrective actions","Overall observation","Outstanding issues","Recommendation"
    ];
    const missing = requiredFields.filter((field) => !String(form[field] || "").trim());
    if (missing.length) return response({ error: "Complete all required inspection fields before submission.", missing }, 422);
    const timestamp = now();
    await env.DB.prepare("UPDATE collaborative_inspections SET status='Submitted',submitted_at=?,locked_at=?,updated_at=?,version=version+1,last_saved_by=? WHERE id=?")
      .bind(timestamp, timestamp, timestamp, user.id, inspection.id).run();
    await audit(env, request, user, null, "collaborative-inspection-submitted", { inspectionId: inspection.id, teamId: team.id });
    return response({ ok: true, status: "Submitted", submittedAt: timestamp });
  }

  if (request.method === "PATCH") {
    if (["Submitted","Approved","Verified"].includes(inspection.status)) return response({ error: "Inspection is locked." }, 423);
    const body = await request.json().catch(() => null);
    const currentForm = JSON.parse(inspection.form_json || "{}");
    const currentAssignments = JSON.parse(inspection.section_assignments_json || "{}");
    const nextForm = body?.formPatch && typeof body.formPatch === "object" ? { ...currentForm, ...body.formPatch } : currentForm;
    const nextAssignments = body?.sectionAssignments && typeof body.sectionAssignments === "object" ? body.sectionAssignments : currentAssignments;
    if (body?.sectionAssignments && team.team_lead_id !== user.id) return response({ error: "Only the Team Lead can assign sections." }, 403);
    const timestamp = now();
    await env.DB.prepare("UPDATE collaborative_inspections SET form_json=?,section_assignments_json=?,status='In Progress',version=version+1,last_saved_by=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify(nextForm), JSON.stringify(nextAssignments), user.id, timestamp, inspection.id).run();
    await audit(env, request, user, null, "collaborative-inspection-saved", { inspectionId: inspection.id, changedFields: Object.keys(body?.formPatch || {}), sectionAssignmentsChanged: Boolean(body?.sectionAssignments) });
    return response({ ok: true, version: inspection.version + 1, updatedAt: timestamp, savedBy: user.name });
  }

  return response({ error: "Method not allowed." }, 405);
}

export async function handleFieldApi(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith("/api/field/")) return null;
  if (!env.DB) return response({ error: "Veritas field database is not configured." }, 503);
  if (path === "/api/field/auth/login" && request.method === "POST") return login(request, env);
  const user = await currentUser(request, env);
  if (!user) return response({ error: "Authentication required." }, 401);
  const collaborativeResponse = await handleCollaborativeInspections(request, env, user);
  if (collaborativeResponse) return collaborativeResponse;
  if (path === "/api/field/auth/logout" && request.method === "POST") {
    const bearer = request.headers.get("Authorization").replace(/^Bearer\s+/i, "");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(bearer)).run();
    return response({ ok: true });
  }
  if (path === "/api/field/assignments" && request.method === "GET") return listAssignments(env, user, url);
  if (path === "/api/field/assignments" && request.method === "POST") return createAssignment(request, env, user);
  if (path === "/api/field/users/field-officers" && request.method === "POST") return createFieldOfficer(request, env, user);
  const match = path.match(/^\/api\/field\/assignments\/([^/]+)(?:\/(arrival|draft|submit|review|evidence)(?:\/([^/]+))?)?$/);
  if (!match) return response({ error: "Endpoint not found." }, 404);
  const assignment = await assignedRecord(env, decodeURIComponent(match[1]), user);
  if (!assignment) return response({ error: "Assignment not found." }, 404);
  const action = match[2];
  if (!action && request.method === "GET") return response({ assignment: assignmentJson(assignment), serverTime: now() });
  if (action === "arrival" && request.method === "PUT") return saveArrival(request, env, user, assignment);
  if (action === "draft" && request.method === "PUT") return saveDraft(request, env, user, assignment);
  if (action === "evidence" && match[3] && request.method === "POST") return uploadEvidence(request, env, user, assignment, decodeURIComponent(match[3]));
  if (action === "submit" && request.method === "POST") return submit(request, env, user, assignment);
  if (action === "review" && request.method === "PATCH") return review(request, env, user, assignment);
  return response({ error: "Method not allowed." }, 405);
}

export const fieldApiTest = { distanceMetres, passwordRecord, verifyPassword };
