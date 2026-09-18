import { handleFieldApi } from "./field-api.js";
import { analyticsCatalog, analyticsAnswerPrompt, deterministicAnalyticsPlan, executeAnalyticsPlan, parsePlannerJson, plannerPrompt, validateAnalyticsPlan } from "./analytics.js";
import { handleSatelliteVerify } from "./satellite-verify.js";

const BUILD_ID = "veritas-2026-09-11-public-rea-team-r4";
const encoder = new TextEncoder();
const managementB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function managementPasswordRecord(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 100000 }, key, 256);
  return { salt: managementB64(saltBytes), hash: managementB64(bits) };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Veritas-Build": BUILD_ID,
    },
  });

const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
}

async function authenticatedDatabaseUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  const tokenHash = await digest(bearer);
  return env.DB.prepare(`SELECT u.id,u.name,
    CASE WHEN u.role='rea_admin' AND COALESCE(r.staff_role,'REA Administrator')<>'REA Administrator' THEN 'rea_staff' ELSE u.role END AS role,
    u.consultant_firm AS consultantFirm
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN rea_staff_accounts r ON r.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)
    .bind(tokenHash, new Date().toISOString())
    .first();
}

async function consultantFieldOfficerResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" && user.role !== "rea_admin") {
    return json({ error: "Consultant or REA access required." }, 403);
  }

  let consultantFirm = user.consultantFirm;
  if (user.role === "rea_admin") {
    consultantFirm = new URL(request.url).searchParams.get("consultantFirm") || consultantFirm;
  }
  if (!consultantFirm) return json({ error: "Consultant firm is required." }, 400);

  const result = await env.DB.prepare(`SELECT id,name,email,phone,consultant_firm AS consultantFirm,status,created_at AS createdAt
    FROM users
    WHERE role='field_officer' AND consultant_firm=?
    ORDER BY name COLLATE NOCASE`)
    .bind(consultantFirm)
    .all();

  return json({
    consultantFirm,
    fieldOfficers: (result.results || []).map((officer) => ({
      id: officer.id,
      name: officer.name,
      email: officer.email || "",
      phone: officer.phone || "",
      consultantFirm: officer.consultantFirm,
      status: String(officer.status).toLowerCase() === "active" ? "Active" : "Suspended",
      createdAt: officer.createdAt,
    })),
    serverTime: new Date().toISOString(),
  });
}

async function reaUsersResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (!String(user.role || "").startsWith("rea_")) return json({ error: "REA access required." }, 403);

  const result = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.phone,u.role,u.consultant_firm AS consultantFirm,u.status,
    r.staff_role AS staffRole,r.department,r.access_json AS accessJson,u.created_at AS createdAt
    FROM users u LEFT JOIN rea_staff_accounts r ON r.user_id=u.id ORDER BY u.role,u.name`).all();
  const users = (result.results || []).map((record) => ({
    id: record.id,
    name: record.name,
    email: record.email || "",
    phone: record.phone || "",
    role: record.staffRole || record.role,
    databaseRole: record.role,
    access: (() => { try { return JSON.parse(record.accessJson || "[]"); } catch { return []; } })(),
    department: record.department || "",
    classification: String(record.role || "").startsWith("rea_")
      ? "REA Staff"
      : record.role === "consultant_admin"
        ? "Consultant Admin"
        : record.role === "field_officer"
          ? "Field Officer"
          : "Other",
    consultantFirm: record.consultantFirm || "",
    status: String(record.status || "").toLowerCase() === "active" ? "Active" : "Suspended",
    createdAt: record.createdAt,
  }));

  return json({
    users,
    summary: {
      totalPortalUsers: users.length,
      reaStaff: users.filter((record) => record.classification === "REA Staff").length,
      consultantAdmins: users.filter((record) => record.classification === "Consultant Admin").length,
      fieldOfficers: users.filter((record) => record.classification === "Field Officer").length,
      active: users.filter((record) => record.status === "Active").length,
      suspended: users.filter((record) => record.status === "Suspended").length,
    },
    serverTime: new Date().toISOString(),
  });
}

async function reaStaffCreateResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin") return json({ error: "REA Administrator access required." }, 403);

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = body?.phone ? String(body.phone).trim() : null;
  const staffRole = String(body?.staffRole || "Viewer").trim();
  const department = String(body?.department || "").trim();
  const access = Array.isArray(body?.access) ? [...new Set(body.access.filter((item) => typeof item === "string"))] : [];
  const password = String(body?.temporaryPassword || "");

  if (!name || !email || !password) return json({ error: "Name, email and temporary password are required." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "A valid REA staff email is required." }, 400);
  if (password.length < 8) return json({ error: "Temporary password must be at least 8 characters." }, 400);
  if (!access.length) return json({ error: "Select at least one access module." }, 400);

  const duplicateEmail = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(email).first();
  if (duplicateEmail) return json({ error: "A Veritas account with this email already exists." }, 409);
  const duplicatePhone = phone ? await env.DB.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first() : null;
  if (duplicatePhone) return json({ error: "This phone number already belongs to another Veritas account." }, 409);

  const id = `rea-staff-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const credentials = await managementPasswordRecord(password);

  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, name, email, phone, "rea_admin", null, credentials.salt, credentials.hash, "active", timestamp),
      env.DB.prepare("INSERT INTO rea_staff_accounts(user_id,staff_role,department,access_json,created_at) VALUES(?,?,?,?,?)")
        .bind(id, staffRole, department || null, JSON.stringify(access), timestamp),
    ]);
  } catch (error) {
    console.error(JSON.stringify({ event: "rea-staff-create-failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return json({ error: "Unable to create the REA staff account in the database." }, 409);
  }

  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, user.id, "rea-staff-created", JSON.stringify({ staffId: id, name, email, staffRole, department, access }), request.headers.get("CF-Connecting-IP"), timestamp)
    .run();

  return json({ ok: true, user: { id, name, email, phone, role: "rea_staff", staffRole, department, access, status: "Active", createdAt: timestamp } }, 201);
}

async function reaUserAudit(env, request, user, action, details) {
  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, user.id, action, JSON.stringify(details || {}), request.headers.get("CF-Connecting-IP"), new Date().toISOString())
    .run();
}


async function sendGmailRelayEmail(env, { to, subject, html }) {
  const relayUrl = String(env.GMAIL_RELAY_URL || "").trim();
  const relaySecret = String(env.GMAIL_RELAY_SECRET || "").trim();
  if (!relayUrl || !relaySecret) {
    throw new Error("Gmail password reset relay is not configured.");
  }
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Veritas-Relay-Secret": relaySecret,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || payload?.message || `Gmail relay returned HTTP ${response.status}.`));
  }
  return payload;
}

async function createPasswordReset(env, userId, requestedBy = null) {
  const rawToken = token();
  const tokenHash = await digest(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL").bind(userId),
    env.DB.prepare("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,requested_by,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), userId, tokenHash, expiresAt, null, requestedBy, createdAt),
  ]);
  return { rawToken, expiresAt };
}

async function sendPasswordResetForUser(request, env, targetId, actor = null) {
  const target = await env.DB.prepare("SELECT id,name,email,status FROM users WHERE id=?").bind(targetId).first();
  if (!target) return { ok: false, status: 404, error: "User not found." };
  if (!target.email) return { ok: false, status: 422, error: "This user does not have an email address." };
  if (!env.GMAIL_RELAY_URL || !env.GMAIL_RELAY_SECRET) return { ok: false, status: 503, error: "Password reset email is not configured. Configure the Gmail relay first." };
  const { rawToken, expiresAt } = await createPasswordReset(env, target.id, actor?.id || null);
  const baseUrl = String(env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const resetUrl = `\${baseUrl}/reset-password?token=\${encodeURIComponent(rawToken)}`;
  await sendGmailRelayEmail(env, {
    to: target.email,
    subject: "Reset your Veritas password",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#173b2a"><div style="padding:24px 0;border-bottom:1px solid #d6e9da"><strong style="font-size:24px;color:#08733f">Veritas</strong><div style="font-size:11px;color:#64748b;margin-top:4px">REA Monitoring Platform</div></div><div style="padding:28px 0"><h2 style="margin:0 0 12px">Reset your password</h2><p style="line-height:1.6;color:#475569">Hello \${String(target.name || "there").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;" }[c]))}, a password reset was requested for your Veritas account.</p><p style="line-height:1.6;color:#475569">Use the button below to create a new password. This link expires in 30 minutes and can only be used once.</p><p style="margin:28px 0"><a href="\${resetUrl}" style="display:inline-block;background:#08733f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Reset Password</a></p><p style="font-size:12px;color:#64748b;line-height:1.6">If you did not request this, you can ignore this email. Your current password will remain unchanged.</p><p style="font-size:11px;color:#94a3b8;word-break:break-all">\${resetUrl}</p></div></div>`,
  });
  return { ok: true, target, expiresAt };
}

async function publicForgotPasswordResponse(request, env) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  const user = await env.DB.prepare("SELECT id,status FROM users WHERE lower(email)=lower(?) LIMIT 1").bind(email).first();
  if (user && String(user.status).toLowerCase() === "active" && env.GMAIL_RELAY_URL && env.GMAIL_RELAY_SECRET) {
    try { await sendPasswordResetForUser(request, env, user.id, null); }
    catch (error) { console.error(JSON.stringify({ event: "public-password-reset-email-failed", message: error instanceof Error ? error.message : "Unknown error" })); }
  }
  return json({ ok: true, message: "If an active Veritas account exists for that email, a password reset link has been sent." });
}

async function publicResetPasswordResponse(request, env) {
  const body = await request.json().catch(() => null);
  const rawToken = String(body?.token || "");
  const password = String(body?.password || "");
  if (!rawToken || password.length < 8) return json({ error: "A valid reset token and a password of at least 8 characters are required." }, 400);
  const tokenHash = await digest(rawToken);
  const record = await env.DB.prepare("SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash=? LIMIT 1").bind(tokenHash).first();
  if (!record || record.used_at || Date.parse(record.expires_at) <= Date.now()) return json({ error: "This password reset link is invalid or has expired." }, 400);
  const credentials = await managementPasswordRecord(password);
  const timestamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_salt=?,password_hash=?,status='active' WHERE id=?").bind(credentials.salt, credentials.hash, record.user_id),
    env.DB.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").bind(timestamp, record.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(record.user_id),
    env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), null, record.user_id, "rea-user-password-reset-completed", JSON.stringify({ userId: record.user_id }), request.headers.get("CF-Connecting-IP"), timestamp),
  ]);
  return json({ ok: true, message: "Password updated successfully. You can now sign in with your new password." });
}

async function reaUserPasswordResetEmailResponse(request, env, targetId) {
  const actor = await authenticatedDatabaseUser(request, env);
  if (!actor) return json({ error: "Authentication required." }, 401);
  if (actor.role !== "rea_admin") return json({ error: "Only the REA Administrator can send password reset emails." }, 403);
  try {
    const result = await sendPasswordResetForUser(request, env, targetId, actor);
    if (!result.ok) return json({ error: result.error }, result.status);
    await reaUserAudit(env, request, actor, "rea-user-password-reset-email-sent", { targetUserId: targetId, expiresAt: result.expiresAt });
    return json({ ok: true, message: `Password reset email sent to \${result.target.email}.` });
  } catch (error) {
    console.error(JSON.stringify({ event: "rea-password-reset-email-failed", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
    return json({ error: "Unable to send the password reset email. Check the email service configuration." }, 502);
  }
}

async function reaUserLifecycleResponse(request, env, targetId, action) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin") return json({ error: "Only the REA Administrator can manage users." }, 403);
  const target = await env.DB.prepare("SELECT u.*, r.staff_role, r.department, r.access_json FROM users u LEFT JOIN rea_staff_accounts r ON r.user_id=u.id WHERE u.id=?").bind(targetId).first();
  if (!target) return json({ error: "User not found." }, 404);
  if (target.id === user.id && ["suspend","delete"].includes(action)) return json({ error: "You cannot suspend or delete your own administrator account." }, 409);

  if (action === "status") {
    const body = await request.json().catch(() => null);
    const status = body?.status === "Suspended" ? "suspended" : body?.status === "Active" ? "active" : "";
    if (!status) return json({ error: "Status must be Active or Suspended." }, 400);
    await env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(status, target.id).run();
    await reaUserAudit(env, request, user, "rea-user-status-changed", { targetUserId: target.id, status });
    return json({ ok: true, status: status === "active" ? "Active" : "Suspended" });
  }

  if (action === "access") {
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.access)) return json({ error: "Access must be an array." }, 400);
    if (!target.staff_role && !String(target.role).startsWith("rea_")) return json({ error: "Dashboard access controls are available for REA staff accounts." }, 422);
    const access = [...new Set(body.access.map((item) => String(item).trim()).filter(Boolean))];
    await env.DB.prepare("INSERT INTO rea_staff_accounts(user_id,staff_role,department,access_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET access_json=excluded.access_json")
      .bind(target.id, target.staff_role || "Viewer", target.department || "", JSON.stringify(access), target.created_at || now()).run();
    await reaUserAudit(env, request, user, "rea-user-access-updated", { targetUserId: target.id, access });
    return json({ ok: true, access });
  }

  if (action === "password") {
    const body = await request.json().catch(() => null);
    const password = String(body?.password || "");
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    const record = await managementPasswordRecord(password);
    await env.DB.prepare("UPDATE users SET password_salt=?,password_hash=?,status='active' WHERE id=?").bind(record.salt, record.hash, target.id).run();
    await reaUserAudit(env, request, user, "rea-user-password-reset", { targetUserId: target.id });
    return json({ ok: true, status: "Active" });
  }

  if (action === "delete") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rea_staff_accounts WHERE user_id=?").bind(target.id),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(target.id)
    ]);
    await reaUserAudit(env, request, user, "rea-user-deleted", { targetUserId: target.id });
    return json({ ok: true });
  }

  return json({ error: "Unsupported user action." }, 400);
}

async function reaProjectsResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin") return json({ error: "REA access required." }, 403);
  const result = await env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
    reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
    households,verified,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
    data_source AS dataSource,updated_at AS updatedAt
    FROM projects ORDER BY state,name`).all();
  return json({
    projects: (result.results || []).map((project) => ({
      ...project,
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
      verified: Number(project.verified) === 1,
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
      geofenceRadiusMetres: Number(project.geofenceRadiusMetres || 250),
    })),
    serverTime: new Date().toISOString(),
  });
}

async function reaConsultantCreateResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin") return json({ error: "REA access required." }, 403);

  const body = await request.json().catch(() => null);
  const required = ["firmName", "adminName", "adminEmail", "engagementRef", "temporaryPassword"];
  if (!body || required.some((key) => !String(body[key] || "").trim()) || !Array.isArray(body.states) || !body.states.length) {
    return json({ error: "Complete the firm, admin, email, engagement reference, password and at least one state." }, 400);
  }
  const email = String(body.adminEmail).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "A valid consultant admin email is required." }, 400);
  const firmName = String(body.firmName).trim();
  const phone = body.adminPhone ? String(body.adminPhone).trim() : null;
  const duplicateConsultant = await env.DB.prepare("SELECT id FROM consultants WHERE lower(firm_name)=lower(?) OR lower(admin_email)=lower(?)").bind(firmName, email).first();
  const duplicateUser = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(email).first();
  if (duplicateConsultant || duplicateUser) return json({ error: "A consultant with this firm name or admin email already exists." }, 409);
  const duplicatePhone = phone ? await env.DB.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first() : null;
  if (duplicatePhone) return json({ error: "This phone number already belongs to another Veritas account." }, 409);

  const id = String(body.id || `con-${crypto.randomUUID()}`);
  const adminUserId = `consultant-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const credentials = await managementPasswordRecord(String(body.temporaryPassword));
  const consultantStatus = ["Active", "Inactive", "Pending Activation"].includes(body.status) ? body.status : "Active";
  const userStatus = consultantStatus === "Active" ? "active" : "suspended";

  try {
    await env.DB.prepare(`INSERT INTO consultants
      (id,firm_name,admin_name,admin_email,admin_phone,regions_json,states_json,status,engagement_ref,scope_note,engagement_start,engagement_end,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, firmName, String(body.adminName).trim(), email, phone,
        JSON.stringify(Array.isArray(body.regions) ? body.regions : []), JSON.stringify(body.states), consultantStatus,
        String(body.engagementRef).trim(), body.scopeNote ? String(body.scopeNote).trim() : "",
        body.engagementStart || null, body.engagementEnd || null, timestamp, timestamp).run();
    try {
      await env.DB.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(adminUserId, String(body.adminName).trim(), email, phone,
          "consultant_admin", firmName, credentials.salt, credentials.hash, userStatus, timestamp).run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM consultants WHERE id=?").bind(id).run();
      throw error;
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "consultant-create-failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return json({ error: "Unable to create the consultant account in the database." }, 409);
  }

  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, user.id, "consultant-created", JSON.stringify({ consultantId: id, firmName, adminUserId }), request.headers.get("CF-Connecting-IP"), timestamp).run();
  return json({ ok: true, consultant: { ...body, id, firmName, adminEmail: email, status: consultantStatus } }, 201);
}

async function consultantProjectsResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" && user.role !== "rea_admin") {
    return json({ error: "Consultant or REA access required." }, 403);
  }

  let consultantFirm = user.consultantFirm;
  if (user.role === "rea_admin") {
    consultantFirm = new URL(request.url).searchParams.get("consultantFirm") || consultantFirm;
  }
  if (!consultantFirm) return json({ error: "Consultant firm is required." }, 400);

  const result = await env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
    reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
    households,verified,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
    data_source AS dataSource,updated_at AS updatedAt
    FROM projects WHERE consultant_firm=? ORDER BY state,name`)
    .bind(consultantFirm)
    .all();

  return json({
    consultantFirm,
    projects: (result.results || []).map((project) => ({
      ...project,
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
      verified: Number(project.verified) === 1,
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
      geofenceRadiusMetres: Number(project.geofenceRadiusMetres || 250),
    })),
    serverTime: new Date().toISOString(),
  });
}

async function consultantProfileResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" || !user.consultantFirm) return json({ error: "Consultant access required." }, 403);
  const record = await env.DB.prepare(`SELECT id,firm_name AS firmName,admin_name AS adminName,admin_email AS adminEmail,admin_phone AS adminPhone,
    regions_json AS regionsJson,states_json AS statesJson,status,engagement_ref AS engagementRef,scope_note AS scopeNote,
    engagement_start AS engagementStart,engagement_end AS engagementEnd FROM consultants WHERE firm_name=?`)
    .bind(user.consultantFirm).first();
  if (!record) return json({ error: "Consultant profile not found." }, 404);
  return json({ consultant: {
    id: record.id, firmName: record.firmName, adminName: record.adminName, adminEmail: record.adminEmail,
    adminPhone: record.adminPhone || "", regions: JSON.parse(record.regionsJson || "[]"), states: JSON.parse(record.statesJson || "[]"),
    status: record.status, engagementRef: record.engagementRef || "", scopeNote: record.scopeNote || "",
    engagementStart: record.engagementStart || "", engagementEnd: record.engagementEnd || "", temporaryPassword: "Managed in D1",
  } });
}

async function fieldOfficerLifecycleResponse(request, env, officerId, action) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (!["consultant_admin", "rea_admin"].includes(user.role)) return json({ error: "Consultant or REA access required." }, 403);

  const officer = await env.DB.prepare("SELECT id,name,role,consultant_firm AS consultantFirm,status FROM users WHERE id=? AND role='field_officer'")
    .bind(officerId).first();
  if (!officer) return json({ error: "Field officer not found." }, 404);
  if (user.role === "consultant_admin" && officer.consultantFirm !== user.consultantFirm) {
    return json({ error: "Field officer is outside your consultant firm." }, 403);
  }

  const timestamp = new Date().toISOString();
  if (action === "status") {
    const body = await request.json().catch(() => null);
    if (!body || !["Active", "Suspended"].includes(body.status)) return json({ error: "Status must be Active or Suspended." }, 400);
    const databaseStatus = body.status === "Active" ? "active" : "suspended";
    await env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(databaseStatus, officerId).run();
    if (databaseStatus !== "active") await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(officerId).run();
    await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), null, user.id, "field-officer-status-changed", JSON.stringify({ officerId, consultantFirm: officer.consultantFirm, status: body.status }), request.headers.get("CF-Connecting-IP"), timestamp).run();
    return json({ ok: true, officerId, status: body.status });
  }

  const assignmentCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM assignments WHERE officer_id=?").bind(officerId).first();
  if (Number(assignmentCount?.count || 0) > 0) {
    return json({ error: "Cannot delete a field officer with assignment history. Suspend the account instead." }, 409);
  }
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(officerId).run();
  await env.DB.prepare("DELETE FROM users WHERE id=? AND role='field_officer'").bind(officerId).run();
  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, user.id, "field-officer-deleted", JSON.stringify({ officerId, consultantFirm: officer.consultantFirm }), request.headers.get("CF-Connecting-IP"), timestamp).run();
  return json({ ok: true, officerId, deleted: true });
}

function latestQuestion(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === "user")?.content?.trim() || "";
}

function compactConversation(messages = []) {
  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
    .join("\n\n");
}

function compactContext(databaseContext = {}, question = "") {
  const context = { ...databaseContext };
  const q = String(question || "").toLowerCase();

  const needsProjects = /\b(project name|which projects?|list projects?|project id|community|lga|specific project)\b/i.test(q);
  const needsAssignments = /\b(assignments?|field officers?|officer|submitted reports?|re-?inspection|due date)\b/i.test(q);
  const needsConsultants = /\b(consultants?|consultant firm|consultant admin)\b/i.test(q);

  if (Array.isArray(context.projects)) {
    if (needsProjects) {
      const total = context.projects.length;
      context.projects = context.projects.slice(0, 40);
      if (total > context.projects.length) context.projectRecordNote = "Showing 40 of " + total + " project records; portfolio aggregates remain complete.";
    } else {
      delete context.projects;
    }
  }

  if (Array.isArray(context.assignments)) {
    if (needsAssignments) {
      const total = context.assignments.length;
      context.assignments = context.assignments.slice(0, 40);
      if (total > context.assignments.length) context.assignmentRecordNote = "Showing 40 of " + total + " assignment records; status aggregates remain complete.";
    } else {
      delete context.assignments;
    }
  }

  if (!needsConsultants) delete context.consultants;
  delete context.componentStateProgramme;

  if (context.users && !/\b(users?|portal users?|field officers?|consultant admins?|rea staff|rea admins?)\b/i.test(q)) {
    context.users = {
      fieldOfficerCount: Array.isArray(context.users.fieldOfficers) ? context.users.fieldOfficers.length : 0,
      consultantAdminCount: Array.isArray(context.users.consultantAdmins) ? context.users.consultantAdmins.length : 0,
      reaStaffCount: Array.isArray(context.users.reaStaff) ? context.users.reaStaff.length : 0,
    };
  }

  return context;
}

function aggregateBy(rows, key, mapper) {
  const groups = new Map();
  for (const row of rows) {
    const label = row[key] ?? "Unknown";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups.entries()].map(([label, group]) => mapper(label, group));
}

async function liveDatabaseContext(env) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");

  const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult] = await Promise.all([
    env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
      reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
      households,verified,data_source AS dataSource,updated_at AS updatedAt
      FROM projects ORDER BY state,name`).all(),
    env.DB.prepare(`SELECT id,name,role,consultant_firm AS consultantFirm,status,created_at AS createdAt
      FROM users ORDER BY role,name`).all(),
    env.DB.prepare(`SELECT a.id,a.status,a.due_date AS dueDate,a.submitted_at AS submittedAt,a.approved_at AS approvedAt,
      a.verified_at AS verifiedAt,a.updated_at AS updatedAt,p.name AS projectName,p.programme,p.component,p.contractor,
      p.consultant_firm AS consultantFirm,p.state,p.lga,p.community,u.name AS officer
      FROM assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.officer_id
      ORDER BY a.updated_at DESC`).all(),
    env.DB.prepare(`SELECT id,firm_name AS firmName,admin_name AS adminName,regions_json AS regionsJson,states_json AS statesJson,
      status,engagement_ref AS engagementRef,scope_note AS scopeNote,engagement_start AS engagementStart,engagement_end AS engagementEnd
      FROM consultants ORDER BY firm_name`).all(),
    env.DB.prepare(`SELECT assignment_id AS assignmentId,COUNT(*) AS count FROM evidence GROUP BY assignment_id`).all(),
    env.DB.prepare(`SELECT action,COUNT(*) AS count FROM audit_events GROUP BY action ORDER BY count DESC`).all(),
  ]);

  const projects = projectResult.results || [];
  const users = userResult.results || [];
  const assignments = assignmentResult.results || [];
  const evidenceCounts = Object.fromEntries((evidenceResult.results || []).map((row) => [row.assignmentId, Number(row.count || 0)]));
  const fieldOfficers = users.filter((user) => user.role === "field_officer");
  const consultantAdmins = users.filter((user) => user.role === "consultant_admin");
  const reaStaff = users.filter((user) => String(user.role || "").startsWith("rea_"));
  const verifiedProjects = projects.filter((project) => Number(project.verified) === 1).length;
  const installedCapacityKw = projects.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0);
  const households = projects.reduce((sum, project) => sum + Number(project.households || 0), 0);

  const componentStateProgramme = [...new Map(
    projects.map((project) => {
      const key = `${project.component || "Unknown"}||${project.state || "Unknown"}||${project.programme || "Unknown"}`;
      return [key, {
        component: project.component || "Unknown",
        state: project.state || "Unknown",
        programme: project.programme || "Unknown",
      }];
    }),
  ).values()].map((row) => ({
    ...row,
    projects: projects.filter((project) =>
      (project.component || "Unknown") === row.component &&
      (project.state || "Unknown") === row.state &&
      (project.programme || "Unknown") === row.programme,
    ).length,
  }));

  const projectSummary = (label, group, labelKey) => ({
    [labelKey]: label,
    projects: group.length,
    installedCapacityKw: group.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0),
    households: group.reduce((sum, project) => sum + Number(project.households || 0), 0),
    verified: group.filter((project) => Number(project.verified) === 1).length,
    pending: group.filter((project) => Number(project.verified) !== 1).length,
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "Cloudflare D1 live database",
    dataScope: "Current Veritas production database snapshot. Browser localStorage is not authoritative for this AI response.",
    privacyScope: "Passwords, hashes, salts, session tokens, phone numbers, email addresses, signatures, device IDs and precise coordinates are excluded.",
    portfolio: {
      totalProjects: projects.length,
      installedCapacityKw,
      householdsReached: households,
      verifiedProjects,
      pendingProjects: projects.length - verifiedProjects,
      verificationRatePercent: projects.length ? Math.round((verifiedProjects / projects.length) * 100) : 0,
    },
    programmePerformance: aggregateBy(projects, "programme", (label, group) => projectSummary(label, group, "programme")),
    componentPerformance: aggregateBy(projects, "component", (label, group) => projectSummary(label, group, "component")),
    componentStateProgramme,
    statePerformance: aggregateBy(projects, "state", (label, group) => projectSummary(label, group, "state")),
    lgaPerformance: aggregateBy(projects, "lga", (label, group) => projectSummary(label, group, "lga")),
    contractorPerformance: aggregateBy(projects, "contractor", (label, group) => projectSummary(label, group, "contractor")),
    consultantPerformance: aggregateBy(projects, "consultantFirm", (label, group) => projectSummary(label, group, "consultantFirm")),
    consultants: (consultantResult.results || []).map((row) => ({
      id: row.id,
      firmName: row.firmName,
      adminName: row.adminName,
      regions: JSON.parse(row.regionsJson || "[]"),
      states: JSON.parse(row.statesJson || "[]"),
      status: row.status,
      engagementRef: row.engagementRef,
      scopeNote: row.scopeNote,
      engagementStart: row.engagementStart,
      engagementEnd: row.engagementEnd,
    })),
    users: {
      fieldOfficers: fieldOfficers.map(({ id, name, consultantFirm, status, createdAt }) => ({ id, name, consultantFirm, status, createdAt })),
      consultantAdmins: consultantAdmins.map(({ id, name, consultantFirm, status, createdAt }) => ({ id, name, consultantFirm, status, createdAt })),
      reaStaff: reaStaff.map(({ id, name, role, status, createdAt }) => ({ id, name, role, status, createdAt })),
    },
    assignments: assignments.map((assignment) => ({ ...assignment, evidenceCount: evidenceCounts[assignment.id] || 0 })),
    assignmentStatusCounts: Object.fromEntries(
      [...new Set(assignments.map((assignment) => assignment.status))].map((status) => [
        status,
        assignments.filter((assignment) => assignment.status === status).length,
      ]),
    ),
    auditSummary: auditResult.results || [],
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      programme: project.programme,
      component: project.component,
      contractor: project.contractor,
      consultantFirm: project.consultantFirm,
      state: project.state,
      lga: project.lga,
      community: project.community,
      reportingMonth: project.reportingMonth,
      status: project.status,
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
      verified: Number(project.verified) === 1,
      dataSource: project.dataSource,
      updatedAt: project.updatedAt,
    })),
  };
}

function buildInput(messages, databaseContext) {
  const conversation = compactConversation(messages);
  const question = latestQuestion(messages);
  const context = JSON.stringify(compactContext(databaseContext || {}, question));

  return `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.

Answer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.

OPENING VOICE STANDARD:
- Start like an experienced REA professional speaking to a colleague, director, or management team. The first sentence should sound assured, informed, and purposeful.
- Lead with the conclusion or strongest confirmed finding. Do not begin with generic setup such as "Based on the data", "According to the information provided", "Here is an analysis", "The data shows", "It appears", "It seems", "As an AI", or similar chatbot language.
- Use confident declarative language when the evidence is clear. Reserve words such as "may", "could", and "warrants review" for interpretation or uncertainty, not for confirmed facts.
- Make the opening persuasive through evidence, not exaggeration. Pair the main conclusion with the most relevant figure or contrast when one is available.
- The opening should feel human and executive-ready, not formulaic. Avoid announcing sections before giving the answer.
- Never use confidence to overstate causation, policy, authority, or facts that the evidence does not establish.

The CURRENT VERITAS CONTEXT below is generated directly from the live Cloudflare D1 production database for this request and is authoritative for internal Veritas questions. Never substitute browser state or invent an internal figure. Authoritative aggregate summaries and multidimensional production analytics cover the full live dataset even when the project list is sampled. For counts, totals, percentages, rankings, and comparisons, use the exact full-database aggregates whenever available. For questions that combine multiple dimensions such as component, state, and programme, use the authoritative full-database aggregate results rather than the sampled project list. Never estimate or extrapolate a portfolio-wide figure from the sampled project list. If an exact aggregate is unavailable, say so rather than estimating from the sample.

PUBLIC REA KNOWLEDGE ROUTING:
- Questions about current REA leadership are public REA knowledge questions, not Veritas database questions.
- Use the official REA team snapshot before general model knowledge.
- Never substitute an older officeholder when the authoritative snapshot contains the requested role.
For general questions that do not require private Veritas data, answer from your general knowledge. Never expose passwords, password hashes, salts, session tokens, personal phone numbers, email addresses, signatures, device IDs, or precise private evidence coordinates.

The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.

EVIDENCE AND CAUSALITY RULES:
- Separate confirmed facts from interpretation. A database status, count, date, or missing record does not by itself prove the cause of that condition.
- Never convert correlation, concentration, missing data, a status snapshot, or timing proximity into a causal or operational certainty unless the live Veritas data or an authoritative REA workflow rule explicitly supports it.
- Do not state that a workflow is blocked, frozen, impossible to progress, delayed, inflated, unsupported, without oversight, without capacity, or dependent on a single entity unless the evidence explicitly establishes that claim.
- Do not assume that a named bucket such as "REA Unallocated" is a consultant, contractor, or responsible delivery entity unless the data model explicitly identifies it that way. Treat it as an allocation/status category if that is all the context establishes.
- Do not assume that a pending consultant activation means a region lacks active oversight, or that reassignment is feasible, unless current assignments, coverage and authority data prove it.
- Do not assume that zero visible evidence records means evidence does not exist elsewhere or that submission is impossible. Say that no evidence records are visible in the available Veritas dataset and recommend checking field activity, evidence capture, sync or recording status as appropriate.
- When the evidence supports concern but not causation, use disciplined wording such as "may indicate", "creates a management risk", "warrants review", or "the available data does not establish the cause".
- Recommendations must follow from confirmed findings and should avoid asserting authority, feasibility, resource availability or mandatory workflow conditions that are not explicitly present in the context.

NUMERIC POLICY AND RECOMMENDATION RULES:
- Never invent a target, threshold, deadline, SLA, cutoff, quota, percentage, time window, minimum evidence count, workload share, or escalation interval.
- A numeric management target may be stated only when that exact target is present in the authoritative Veritas context, explicitly supplied by the user, or identified as an established REA rule in the available source material.
- Do not turn an observed database value into a recommended threshold. For example, do not recommend "raise verification above 75%", "reduce unallocated projects below 40%", "escalate within 48 hours", or any similar number unless that number is explicitly supported.
- You may calculate and report descriptive values from authoritative data, including counts, totals, percentages, rates, differences and rankings, but clearly treat them as current observations rather than policy targets.
- When a management threshold would be useful but none is supplied, say "set a management-approved target", "prioritise approaching due dates", or recommend that management define the threshold; do not choose the number yourself.
- Recommendations must be traceable to confirmed findings. Do not claim an operational constraint, blocked workflow, required evidence minimum, resource availability, consultant capacity, or reassignment feasibility unless the context supports it.

RESPONSE QUALITY STANDARD:
- Answer the management question immediately in the opening one or two sentences. Lead with the strongest finding supported by the data, not with a generic introduction.
- For analytical or management questions, use this order when useful: key finding -> what the data confirms -> what it may mean -> what management should review or do next.
- Keep confirmed facts separate from interpretation. Use only the few figures needed to support the conclusion; do not dump long raw record lists unless the user explicitly asks for them.
- Rank issues by materiality when the user asks for priorities, risks, pressure points, or management attention.
- Recommendations must be specific to the observed issue. Prefer practical checks such as reviewing assigned records, validating field progress, checking sync or submission status, reviewing consultant coverage, or monitoring downstream review capacity when those checks are relevant.
- Avoid generic filler, repeated caveats, and long lists of hypothetical causes. If the cause is unknown, name only the most plausible categories that the available data makes relevant and state that the cause is not established.
- Use concise REA operational language and sound like an experienced programme and monitoring professional briefing management.
- Do not say "Based on the data provided", "As an AI", or expose implementation details.
- If a question spans multiple subject areas and the available evidence fully supports only one of them, state what is confirmed and what requires a separate review rather than pretending the answer is comprehensive.
- A short bottom line may be used when it adds a clear management takeaway; do not repeat the opening conclusion.

REPORT GENERATION STANDARD:
- When the user asks to generate, prepare, create, produce, compile or write a report, switch from normal chat style to a complete formal REA management report.
- Use only the CURRENT VERITAS CONTEXT as factual evidence for internal figures. Never invent a project count, verification figure, contractor result, consultant status, state result, LGA result, assignment status, date, target, deadline or cause.
- State the reporting scope or period at the top. If no explicit period is supplied, say that the report reflects the current live Veritas production snapshot and do not invent a month or reporting period.
- Use this default structure unless the user asks for another format: Report Title; Reporting Scope; Executive Summary; Portfolio Overview; Performance Analysis; Verification & QA; Geographic Performance; Programme Performance; Consultant/Contractor Observations when supported; Key Risks & Exceptions; Confirmed Facts; Interpretation; Data Gaps; Management Actions; Conclusion.
- For State/LGA performance reports, prioritise statePerformance and lgaPerformance. Compare project volume, installed capacity, households reached, verified projects, pending projects and descriptive verification shares where the source values support calculation. Do not infer actual electrification need from Veritas portfolio size alone.
- For programme reports, prioritise programmePerformance. For contractor reports, prioritise contractorPerformance. For consultant reports, distinguish consultantPerformance project aggregates from consultant status records and do not treat an allocation bucket as a consultant unless explicitly identified as one.
- For verification reports, use portfolio verification totals, assignmentStatusCounts and supported programme/state/LGA/contractor/consultant breakdowns. Do not claim a bottleneck, delay, capacity shortage or weak management unless the evidence establishes it.
- Put the most decision-relevant findings in the Executive Summary. Do not dump every row. Rank material issues only when the evidence supports a meaningful comparison.
- Separate confirmed facts from interpretation. A current status difference can justify management attention without proving the reason for the difference.
- Management Actions must be evidence-led checks or decisions that logically follow from confirmed findings. Never invent a numeric target, deadline, SLA, staffing requirement or budget.
- Data Gaps should identify only information genuinely missing for the requested conclusion; do not use boilerplate caveats.
- Write in formal, concise REA language suitable for a Director or Managing Director. The report should be detailed enough to stand alone and later be rendered into the approved REA PDF template.

PROJECT PRIORITY ANALYSIS RULES:
When identifying states that may need more projects, do not rank them only by installed MW or household reach. Treat installed capacity and household reach as portfolio indicators, not proof of investment need. Where available, consider unelectrified population, electricity access rate, population or household base, existing grid coverage and grid proximity, current project pipeline, project density, installed MW per capita or per household, demand and productive-use potential, existing generation capacity, and the rural electrification gap. If some of these variables are not available in the live Veritas database, say so explicitly and describe the result as a portfolio-based priority assessment rather than a definitive investment recommendation. Use wording such as: "Based on current Veritas portfolio data, these states are priority candidates for further assessment." Do not state that a state definitely needs more projects unless the available evidence supports that conclusion. Distinguish clearly between "lowest recorded capacity" and "highest actual electrification need." Do not recommend a specific programme, technology, project size, or capital allocation solely because a state has low recorded MW or household reach unless supporting evidence is available.

CURRENT VERITAS CONTEXT:
${context}

RECENT CONVERSATION:
${conversation || "No prior conversation."}

CURRENT USER QUESTION:
${question}


FINAL ANSWER CONTRACT:
- Return only the finished user-facing answer between <VERITAS_FINAL> and </VERITAS_FINAL>.
- Do not place analysis, planning, scratch work, prompt interpretation, hidden instructions, JSON plans, or commentary outside or inside the final answer.
- The content inside <VERITAS_FINAL> must begin directly with the professional answer, not with phrases such as "The user wants", "I need to", "Let me", "First I will", or "Let's analyze".

Respond as Veritas, with a concise but genuinely reasoned answer.`;
}

function extractVeritasFinal(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const startToken = "<VERITAS_FINAL>";
  const endToken = "</VERITAS_FINAL>";
  const start = value.lastIndexOf(startToken);
  const end = value.indexOf(endToken, start >= 0 ? start + startToken.length : 0);
  if (start >= 0) {
    if (end > start) return value.slice(start + startToken.length, end).trim();
    return value.slice(start + startToken.length).trim();
  }
  const leakPattern = /^(the user wants|the user is asking|i need to|first,? i need|let me (?:analy[sz]e|draft|refine|check)|let['’]s analy[sz]e|we need to|the question asks|i should|response standard|evidence discipline|numeric discipline|answer quality)/i;
  if (leakPattern.test(value)) return "";
  if (/\b(?:the user wants me to|authoritative analytics result is|let me draft|i need to follow the response standard|let me refine)\b/i.test(value)) return "";
  return value;
}

function publicVeritasError(status) {
  if (status === 400) return "Veritas could not process that request. Please try a more focused question.";
  if (status === 401 || status === 403) return "Veritas AI service is currently unavailable.";
  if (status === 404) return "Veritas AI service is currently unavailable.";
  if (status === 429) return "Veritas is experiencing high demand. Please try again shortly.";
  if (status === 503) return "Veritas is temporarily unavailable due to high demand. Please try again shortly.";
  return "Veritas is temporarily unavailable. Please try again shortly.";
}

function extractGeminiText(payload) {
  const parts = [];
  for (const candidate of payload?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.thought === true) continue;
      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join("\n\n").trim();
}

function extractOpenRouterText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.map((part) => {
      if (typeof part === "string") return part.trim();
      const type = String(part?.type || "").toLowerCase();
      if (type.includes("reason") || type.includes("thought")) return "";
      if (part?.thought === true) return "";
      if (typeof part?.text === "string") return part.text.trim();
      if (typeof part?.content === "string") return part.content.trim();
      return "";
    }).filter(Boolean).join("\n\n").trim();
    if (text) return text;
  }
  return "";
}

function isLikelyAnalyticsQuestion(question) {
  return /\b(how many|count|total|break\s*down|breakdown|compare|rank|highest|lowest|average|sum|by state|by programme|by program|by component|by contractor|by consultant|by officer|verified|pending|verification|capacity|households?|assignments?|projects?)\b/i.test(String(question || ""));
}

function isManagementAnalysisQuestion(question) {
  return /\b(analy[sz]e|analysis|management|risk|pressure|issue|implication|recommend|action|attention|why|what does|interpret|priority|prioritise|prioritize|concern|bottleneck|trend|performance|review next)\b/i.test(String(question || ""));
}

function isReportRequest(question) {
  return /\b(generate|create|prepare|produce|write|draft|compile|build)\b[\s\S]{0,80}\b(report|brief|briefing|management report|monthly report|performance report|verification report)\b|\b(report|brief|briefing)\b[\s\S]{0,80}\b(generate|create|prepare|produce|write|draft|compile|build)\b/i.test(String(question || ""));
}

function isPublicReaQuestion(question) {
  const q = String(question || "").trim();
  return /\b(?:who is|who.?s|current|name of|what is|tell me about|when was|where is|leadership|management|managing director|md\/?ceo|ceo|chairman|minister|programmes?|programs?|policy|policies|mandate|history|announcement|news|official)\b/i.test(q) && /\b(?:rea|rural electrification agency|managing director|md\/?ceo)\b/i.test(q);
}

function deterministicReaTeamAnswer(question) {
  const q = String(question || "").toLowerCase();
  if (/\b(?:md|md\/?ceo|managing director|chief executive officer|ceo)\b/.test(q) && /\b(?:rea|rural electrification agency)\b/.test(q)) {
    return "Abba Abubakar Aliyu is the Managing Director/Chief Executive Officer (MD/CEO) of the Rural Electrification Agency (REA).";
  }
  if (/technical services/.test(q)) return "Engr. Umar Abdullahi Umar, FNSE, is the Executive Director, Technical Services, of the Rural Electrification Agency (REA).";
  if (/rural electrification fund|\bref\b/.test(q)) return "Engr. Doris Uboh is the Executive Director, Rural Electrification Fund (REF), of the Rural Electrification Agency (REA).";
  if (/corporate services/.test(q)) return "Ayoade Abdulrazak Adegboyega is the Executive Director, Corporate Services, of the Rural Electrification Agency (REA).";
  return "";
}

function publicReaKnowledgePrompt(question) {
  return [
    "You are Veritas, the Rural Electrification Agency internal intelligence assistant. Answer the user public REA information question using current, authoritative information.",
    "",
    "REA TEAM AUTHORITATIVE SNAPSHOT - OFFICIAL REA SOURCE:\n- Primary source: https://rea.gov.ng/meet-the-team.html\n- Managing Director/Chief Executive Officer (MD/CEO): Abba Abubakar Aliyu.\n- Executive Director, Technical Services: Engr. Umar Abdullahi Umar, FNSE.\n- Executive Director, Rural Electrification Fund (REF): Engr. Doris Uboh.\n- Executive Director, Corporate Services: Ayoade Abdulrazak Adegboyega.\n- For questions about these roles or people, this official REA team snapshot overrides model memory and older officeholder information.\n- Never answer that Danjuma Maigida is the current REA MD/CEO.\n- If the user asks for another current REA team member not listed in this snapshot, verify against the official REA Meet the Team page before answering.\n",
    "PUBLIC REA SOURCE RULES:",
    "- Use Google Search grounding to verify current facts when needed.",
    "- Treat only official Rural Electrification Agency domains ending in rea.gov.ng as authoritative for REA leadership, programmes, mandate, policies, announcements and organisational facts.",
    "- If the authoritative team snapshot directly answers the question, use it and do not replace it with model memory.",
    "- If official REA sources do not confirm the fact, say that you could not verify it from an official REA source rather than guessing.",
    "",
    "USER QUESTION:",
    String(question || ""),
  ].join("\n");
}

function isGeneralCapabilityQuestion(question) {
  return /^(?:what can you do|what do you do|how can you help|help me|capabilities|your capabilities|what are your capabilities)[?.! ]*$/i.test(String(question || "").trim());
}
function responseTokenBudget(question) {
  if (isReportRequest(question)) return 4500;
  return isManagementAnalysisQuestion(question) ? 2500 : 1600;
}

function geminiModelsToTry(env) {
  const primary = env.GEMINI_MODEL || "gemini-3.8-flash";
  const configuredFallbacks = String(env.GEMINI_MODEL_FALLBACKS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const builtInFallbacks = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
  return [...new Set([primary, ...configuredFallbacks, ...builtInFallbacks])];
}

// Calls Gemini's generateContent, rotating through GEMINI_MODEL and
// GEMINI_MODEL_FALLBACKS in order. Only moves to the next model on 429
// (quota exhausted) or 404 (model unavailable to this key) - any other
// failure (bad request, network error) is returned immediately rather than
// masked by silently retrying against a different model.
async function callGeminiWithFallback(env, requestBody, { timeoutMs = 20000 } = {}) {
  const models = geminiModelsToTry(env);
  let lastStatus = 0;
  let lastMessage = "Veritas AI service is currently unavailable.";
  let lastFinishReason = null;
  let lastBlockReason = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const visibleText = extractGeminiText(payload);
        if (visibleText) return { ok: true, model, payload };
        lastStatus = 200;
        lastFinishReason = payload?.candidates?.[0]?.finishReason || null;
        lastBlockReason = payload?.promptFeedback?.blockReason || null;
        lastMessage = "Gemini returned HTTP 200 without visible answer text.";
        console.error(JSON.stringify({
          event: "veritas_gemini_model_empty_completion",
          model,
          status: 200,
          finishReason: lastFinishReason,
          blockReason: lastBlockReason,
          candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
          usageMetadata: payload?.usageMetadata || null,
          build: BUILD_ID,
        }));
        continue;
      }
      lastStatus = response.status;
      lastMessage = String(payload?.error?.message || payload?.error || "Unknown upstream error");
      console.error(JSON.stringify({
        event: "veritas_gemini_model_failure",
        model,
        status: response.status,
        message: lastMessage,
        build: BUILD_ID,
      }));
      if (response.status !== 429 && response.status !== 404 && response.status !== 503) {
        return { ok: false, model, status: response.status, message: lastMessage };
      }
      // 429 (quota), 404 (model unavailable to this key), or 503 (upstream
      // overloaded, usually transient) - all worth trying the next model
      // in the list rather than failing the whole request outright.
    } catch (error) {
      lastStatus = 0;
      lastMessage = error instanceof Error ? error.message : "Network or timeout error";
      console.error(JSON.stringify({
        event: "veritas_gemini_model_network_error",
        model,
        message: lastMessage,
        build: BUILD_ID,
      }));
    }
  }

  return { ok: false, model: models[models.length - 1], status: lastStatus, message: lastMessage, finishReason: lastFinishReason, blockReason: lastBlockReason };
}

async function publicReaKnowledgeResponse(question, env) {
  const deterministic = deterministicReaTeamAnswer(question);
  if (deterministic) return deterministic;
  if (!env.GEMINI_API_KEY) return "";
  const prompt = publicReaKnowledgePrompt(question);
  const result = await callGeminiWithFallback(env, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1200 },
  });
  if (!result.ok) return "";
  return extractVeritasFinal(extractGeminiText(result.payload));
}
async function analyticsPlannerResponse(question, env) {
  const prompt = plannerPrompt(question, analyticsCatalog());

  if (env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://veritas.mustaphaaliyu236.workers.dev",
          "X-Title": "Veritas",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "google/gemini-3.8-flash",
          models: ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openrouter/free"],
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0,
          provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },
        }),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const text = extractOpenRouterText(payload);
        if (text) return text;
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "veritas_analytics_planner_openrouter_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
    }
  }

  if (env.GEMINI_API_KEY) {
    const result = await callGeminiWithFallback(env, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 700 },
    }, { timeoutMs: 12000 });
    if (result.ok) return extractGeminiText(result.payload);
  }

  return "";
}

function deterministicAnalyticsAnswer(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) return "No matching records were found in the current Veritas production database.";
  const lines = rows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? "—"}`).join(" | "));
  const limitNote = result.truncated ? "\n\nThe result reached the configured row limit, so it may not include every matching group." : "";
  return `Authoritative Veritas production database result (${rows.length} row${rows.length === 1 ? "" : "s"}):\n\n${lines.join("\n")}${limitNote}`;
}

async function veritasResponse(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON request.", build: BUILD_ID }, 400);
  }

  const question = latestQuestion(body?.messages);
  if (!question) return json({ error: "Ask Veritas a question.", build: BUILD_ID }, 400);
  if (!env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    console.error(JSON.stringify({ event: "veritas_provider_unconfigured", provider: "veritas-ai", build: BUILD_ID }));
    return json({ error: "Veritas AI service is currently unavailable.", build: BUILD_ID }, 503);
  }

  if (isPublicReaQuestion(question)) {
    const publicAnswer = await publicReaKnowledgeResponse(question, env);
    if (publicAnswer) {
      return json({ answer: publicAnswer, sources: [], mode: "veritas-public-rea", build: BUILD_ID });
    }
  }
  let analyticsResult = null;
  let plan = deterministicAnalyticsPlan(question);
  if (!plan && isLikelyAnalyticsQuestion(question) && !isReportRequest(question)) {
    const plannerText = await analyticsPlannerResponse(question, env);
    const rawPlan = parsePlannerJson(plannerText);
    plan = validateAnalyticsPlan(rawPlan);
  }
  if (plan) {
    try {
      analyticsResult = await executeAnalyticsPlan(env, plan);
    } catch (error) {
      console.error(JSON.stringify({ event: "veritas_analytics_execution_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
    }
  }

  let databaseContext = null;
  let prompt;
  if (analyticsResult && !isManagementAnalysisQuestion(question)) {
    const exactAnswer = deterministicAnalyticsAnswer(analyticsResult);
    return json({ answer: exactAnswer, sources: [], mode: "veritas-safe-analytics", build: BUILD_ID });
  } else if (analyticsResult) {
    // Management/interpretive questions still use exact D1 analytics as the evidence base,
    // but pass the result through the reasoning layer for a concise management response.
    prompt = analyticsAnswerPrompt(question, analyticsResult);
  } else {
    if (isGeneralCapabilityQuestion(question)) {
      databaseContext = {
        generatedAt: new Date().toISOString(),
        source: "General Veritas capability request",
        dataScope: "No live D1 query required for this general AI capability question.",
      };
    } else {
      try {
        databaseContext = await liveDatabaseContext(env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "veritas_d1_context_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({
          error: "Veritas could not load the current production data required for this request.",
          code: "VERITAS_D1_CONTEXT_UNAVAILABLE",
          build: BUILD_ID,
        }, 503);
      }
    }
    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";
    if (exactCrossTabAnswer) {
      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });
    }
    prompt = buildInput(body.messages, databaseContext);
  }
  let upstream;
  let payload = {};
  let openrouterMessage = "";
  let provider = "gemini";
  let model = env.GEMINI_MODEL || "gemini-3.8-flash";
  let answer = "";
  const outputTokenBudget = responseTokenBudget(question);
  const geminiOutputTokenBudget = isReportRequest(question) ? 8192 : outputTokenBudget;

  if (env.OPENROUTER_API_KEY) {
    provider = "openrouter";
    model = env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://veritas.mustaphaaliyu236.workers.dev",
          "X-Title": "Veritas",
        },
        body: JSON.stringify({
          model,
          models: ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openrouter/free"],
          messages: [{ role: "user", content: prompt }],
          max_tokens: outputTokenBudget,
          temperature: 0.3,
          provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },
        }),
        signal: AbortSignal.timeout(25000),
      });
      payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) {
      answer = extractVeritasFinal(extractOpenRouterText(payload));
      if (!answer) {
        openrouterMessage = "Upstream returned 200 but no usable text (empty/blocked completion).";
        console.error(JSON.stringify({ event: "veritas_openrouter_empty_answer", status: upstream.status, finishReason: payload?.choices?.[0]?.finish_reason || null, returnedModel: payload?.model || null, build: BUILD_ID }));
      }
    } else {
      openrouterMessage = String(payload?.error?.message || payload?.error || `HTTP ${upstream.status}`);
    }
    } catch (error) {
      openrouterMessage = error instanceof Error ? error.message : "Network or timeout error";
      console.error(JSON.stringify({
        event: "veritas_openrouter_timeout_or_network_error",
        message: openrouterMessage,
        build: BUILD_ID,
      }));
    }

    if (!upstream?.ok || !answer) {
      console.error(JSON.stringify({
        event: "veritas_openrouter_fallback",
        status: upstream?.status || 0,
        model,
        upstreamMessage: openrouterMessage,
        build: BUILD_ID,
      }));
    }
  }

  let geminiStatus = 0;
  let geminiMessage = "";
  if (!answer && env.GEMINI_API_KEY) {
    provider = "gemini";
    const result = await callGeminiWithFallback(env, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: geminiOutputTokenBudget, thinkingConfig: { thinkingLevel: "low" } },
    }, { timeoutMs: 30000 });
    model = result.model;
    geminiStatus = result.ok ? 200 : result.status;
    geminiMessage = result.ok ? "" : result.message;
    const geminiFinishReason = result.finishReason || null;
    const geminiBlockReason = result.blockReason || null;
    if (result.ok) {
      answer = extractVeritasFinal(extractGeminiText(result.payload));
      if (!answer) {
        geminiMessage = "Upstream returned 200 but no usable text (empty/blocked completion).";
        console.error(JSON.stringify({
          event: "veritas_direct_gemini_empty_answer",
          finishReason: result.payload?.candidates?.[0]?.finishReason || null,
          blockReason: result.payload?.promptFeedback?.blockReason || null,
          model,
          build: BUILD_ID,
        }));
      }
    }
  }

  if (!answer && analyticsResult) {
    answer = deterministicAnalyticsAnswer(analyticsResult);
  }

  if (!answer) {
    const failureStatus = geminiStatus || upstream?.status || 0;
    console.error(JSON.stringify({
      event: "veritas_all_ai_routes_failed",
      provider,
      status: failureStatus,
      model,
      upstreamMessage: String(payload?.error?.message || payload?.error || ""),
      build: BUILD_ID,
    }));
    return json({
      error: publicVeritasError(failureStatus || 503),
      code: "VERITAS_AI_PROVIDERS_FAILED",
      attemptedProviders: {
        openrouter: Boolean(env.OPENROUTER_API_KEY),
        gemini: Boolean(env.GEMINI_API_KEY),
      },
      debug: {
        openrouter: env.OPENROUTER_API_KEY ? { status: upstream?.status || 0, message: openrouterMessage } : null,
        gemini: env.GEMINI_API_KEY ? { status: geminiStatus, message: geminiMessage, model } : null,
      },
      build: BUILD_ID,
    }, failureStatus === 429 ? 429 : 503);
  }
  if (!answer) {
    console.error(JSON.stringify({ event: "veritas_empty_provider_response", provider: "gemini", model, build: BUILD_ID }));
    return json({ error: "Veritas could not complete that response. Please try again shortly.", build: BUILD_ID }, 503);
  }

  return json({ answer, sources: [], mode: analyticsResult ? "veritas-safe-analytics" : "veritas-live-d1", build: BUILD_ID });
}

async function pingGemini(env) {
  if (!env.GEMINI_API_KEY) return { configured: false };
  // Checks each configured model individually (rather than just the first
  // that succeeds) so the health check surfaces exactly which models are
  // rate-limited or unavailable today, not just whether Veritas overall works.
  const models = geminiModelsToTry(env);
  const perModel = [];
  for (const model of models) {
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 8 },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const payload = await upstream.json().catch(() => ({}));
      perModel.push({
        model,
        ok: upstream.ok,
        status: upstream.status,
        message: upstream.ok ? "" : String(payload?.error?.message || payload?.error || "Unknown upstream error"),
      });
    } catch (error) {
      perModel.push({
        model,
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "Network or timeout error",
      });
    }
  }
  return { configured: true, models: perModel, ok: perModel.some((m) => m.ok) };
}

async function pingOpenRouter(env) {
  if (!env.OPENROUTER_API_KEY) return { configured: false };
  const model = env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await upstream.json().catch(() => ({}));
    return {
      configured: true,
      model,
      ok: upstream.ok,
      status: upstream.status,
      message: upstream.ok ? "" : String(payload?.error?.message || payload?.error || "Unknown upstream error"),
    };
  } catch (error) {
    return {
      configured: true,
      model,
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Network or timeout error",
    };
  }
}

async function veritasHealthResponse(request, env, url) {
  const wantsLive = url.searchParams.get("live") === "1";

  if (!wantsLive) {
    return json({
      build: BUILD_ID,
      openrouter: { configured: Boolean(env.OPENROUTER_API_KEY) },
      gemini: { configured: Boolean(env.GEMINI_API_KEY) },
      note: "Add ?live=1 with a valid session Authorization header to run a live upstream check.",
    });
  }

  const user = await authenticatedDatabaseUser(request, env);
  if (!user) {
    return json({ error: "A valid session is required for a live health check." }, 401);
  }

  const [openrouter, gemini] = await Promise.all([pingOpenRouter(env), pingGemini(env)]);
  return json({ build: BUILD_ID, openrouter, gemini });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/veritas/health") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await veritasHealthResponse(request, env, url);
      } catch (error) {
        console.error(JSON.stringify({ event: "veritas_health_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to run the Veritas health check." }, 503);
      }
    }

    if (url.pathname === "/api/rea/projects") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await reaProjectsResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "rea_projects_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load REA projects." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/field-officers") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantFieldOfficerResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_roster_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant field-officer roster." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/projects") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantProjectsResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_projects_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant project portfolio." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/profile") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return consultantProfileResponse(request, env);
    }

    if (url.pathname === "/api/auth/forgot-password") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return publicForgotPasswordResponse(request, env);
    }
    if (url.pathname === "/api/auth/reset-password") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return publicResetPasswordResponse(request, env);
    }
    const reaPasswordResetMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)\/password-reset$/);
    if (reaPasswordResetMatch && request.method === "POST") return reaUserPasswordResetEmailResponse(request, env, decodeURIComponent(reaPasswordResetMatch[1]));

    const reaUserActionMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)\/(status|access|password)$/);
    if (reaUserActionMatch && request.method === "PATCH") {
      return reaUserLifecycleResponse(request, env, decodeURIComponent(reaUserActionMatch[1]), reaUserActionMatch[2]);
    }
    const reaUserDeleteMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)$/);
    if (reaUserDeleteMatch && request.method === "DELETE") {
      return reaUserLifecycleResponse(request, env, decodeURIComponent(reaUserDeleteMatch[1]), "delete");
    }

    if (url.pathname === "/api/rea/users") {
      if (request.method === "GET") return reaUsersResponse(request, env);
      if (request.method === "POST") return reaStaffCreateResponse(request, env);
      return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
    }

    if (url.pathname === "/api/rea/consultants") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return reaConsultantCreateResponse(request, env);
    }

    const officerLifecycleMatch = url.pathname.match(/^\/api\/field\/users\/field-officers\/([^/]+)(?:\/(status))?$/);
    if (officerLifecycleMatch && (request.method === "PATCH" || request.method === "DELETE")) {
      const action = officerLifecycleMatch[2] === "status" && request.method === "PATCH" ? "status" : request.method === "DELETE" && !officerLifecycleMatch[2] ? "delete" : null;
      if (!action) return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return fieldOfficerLifecycleResponse(request, env, decodeURIComponent(officerLifecycleMatch[1]), action);
    }

    if (/^\/api\/projects\/[^/]+\/satellite-verify$/.test(url.pathname)) {
      try {
        const satelliteResponse = await handleSatelliteVerify(request, env);
        if (satelliteResponse) return satelliteResponse;
      } catch (error) {
        console.error(JSON.stringify({
          event: "satellite_verify_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({ error: "Satellite verification failed. Please try again shortly." }, 503);
      }
    }

    const fieldResponse = await handleFieldApi(request, env);
    if (fieldResponse) return fieldResponse;

    if (url.pathname === "/api/veritas") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      const veritasCaller = await authenticatedDatabaseUser(request, env);
      if (!veritasCaller) return json({ error: "Authentication required.", build: BUILD_ID }, 401);
      if (veritasCaller.role !== "rea_admin") return json({ error: "REA access required.", build: BUILD_ID }, 403);
      try {
        return await veritasResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "veritas_request_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({ error: "Veritas is temporarily unavailable. Please try again shortly.", build: BUILD_ID }, 503);
      }
    }

    if (url.pathname === "/api/auth/veritas-session" || url.pathname === "/api/version") {
      return json({
        ok: true,
        mode: "cloudflare-worker",
        build: BUILD_ID,
        aiService: "veritas",
        aiDatabaseSource: "cloudflare-d1-live",
        fieldStorageConfigured: Boolean(env.DB),
        evidenceStorageConfigured: Boolean(env.EVIDENCE),
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      const headers = new Headers(assetResponse.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
      headers.set("X-Veritas-Build", BUILD_ID);
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    return assetResponse;
  },
};
