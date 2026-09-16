const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function authenticatedDatabaseUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  return env.DB.prepare(`SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)
    .bind(await digest(bearer), new Date().toISOString())
    .first();
}

async function passwordRecord(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 100000 }, key, 256);
  return { salt: base64(saltBytes), hash: base64(bits) };
}

async function audit(env, request, actorId, action, targetUserId) {
  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, actorId, action, JSON.stringify({ targetUserId }), request.headers.get("CF-Connecting-IP"), new Date().toISOString())
    .run();
}

async function requireAdmin(request, env, targetUserId) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return { response: json({ error: "Authentication required." }, 401) };
  if (user.role !== "rea_admin") return { response: json({ error: "REA administrator access required." }, 403) };
  if (user.id === targetUserId) return { response: json({ error: "Cannot manage your own account." }, 400) };
  const target = await env.DB.prepare("SELECT id,status FROM users WHERE id=?").bind(targetUserId).first();
  if (!target) return { response: json({ error: "User account not found." }, 404) };
  return { user, target };
}

export async function handleReaUserActions(request, env) {
  if (!env.DB) return null;
  const url = new URL(request.url);

  // Route contracts: /api/rea/users/[^/]+/status and /api/rea/users/[^/]+/reset-password
  const statusMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)\/status$/);
  const resetMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)\/reset-password$/);
  const deleteMatch = url.pathname.match(/^\/api\/rea\/users\/([^/]+)$/);
  if (!statusMatch && !resetMatch && !deleteMatch) return null;

  const match = statusMatch || resetMatch || deleteMatch;
  const targetUserId = decodeURIComponent(match[1]);
  const auth = await requireAdmin(request, env, targetUserId);
  if (auth.response) return auth.response;

  if (statusMatch) {
    if (request.method !== "PATCH") return json({ error: "Method not allowed." }, 405);
    const body = await request.json().catch(() => null);
    if (!body || !["Active", "Suspended"].includes(body.status)) {
      return json({ error: "Status must be Active or Suspended." }, 400);
    }
    const databaseStatus = body.status === "Active" ? "active" : "suspended";
    await env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(databaseStatus, targetUserId).run();
    if (databaseStatus === "suspended") {
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(targetUserId).run();
    }
    const action = databaseStatus === "active" ? "user-reactivated" : "user-suspended";
    await audit(env, request, auth.user.id, action, targetUserId);
    return json({ ok: true, id: targetUserId, status: body.status });
  }

  if (resetMatch) {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await request.json().catch(() => null);
    const temporaryPassword = String(body?.temporaryPassword || "");
    if (temporaryPassword.length < 8) return json({ error: "Temporary password must contain at least 8 characters." }, 400);
    const credentials = await passwordRecord(temporaryPassword);
    await env.DB.prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id=?")
      .bind(credentials.salt, credentials.hash, targetUserId).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(targetUserId).run();
    await audit(env, request, auth.user.id, "user-password-reset", targetUserId);
    return json({ ok: true, id: targetUserId });
  }

  if (request.method !== "DELETE") return json({ error: "Method not allowed." }, 405);
  const assignment = await env.DB.prepare("SELECT id FROM assignments WHERE officer_id=? LIMIT 1").bind(targetUserId).first();
  if (assignment) {
    return json({ error: "This account has historical assignments and cannot be deleted. Suspend it instead." }, 409);
  }
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(targetUserId).run();
  await env.DB.prepare("DELETE FROM users WHERE id=?").bind(targetUserId).run();
  await audit(env, request, auth.user.id, "user-deleted", targetUserId);
  return json({ ok: true, id: targetUserId });
}
