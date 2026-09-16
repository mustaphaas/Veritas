import fs from "node:fs";

const fieldPath = "worker/field-api.js";
let field = fs.readFileSync(fieldPath, "utf8");

const sessionHistoryLogin = `  const sessionToken = token(), createdAt = now(), expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const historyId = crypto.randomUUID();
  const userAgent = request.headers.get("User-Agent") || "";
  const device = parseSessionDevice(userAgent);
  await env.DB.prepare(\`INSERT INTO user_session_history
    (id,user_id,login_at,last_seen_at,duration_seconds,status,ip_address,user_agent,device_family,browser,os,created_at,updated_at)
    VALUES(?,?,?,?,0,'active',?,?,?,?,?,?,?)\`)
    .bind(historyId, user.id, createdAt, createdAt, request.headers.get("CF-Connecting-IP"), userAgent, device.deviceFamily, device.browser, device.os, createdAt, createdAt).run();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,history_id) VALUES(?,?,?,?,?,?)")
    .bind(await digest(sessionToken), user.id, createdAt, expiresAt, createdAt, historyId).run();
  await audit(env, request, user, null, "login", { sessionExpiresAt: expiresAt, historyId });`;

const resilientLogin = `  const sessionToken = token(), createdAt = now(), expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const tokenHash = await digest(sessionToken);

  // Authentication is the primary operation. Telemetry must never prevent a
  // user with valid credentials from receiving a usable session.
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)")
    .bind(tokenHash, user.id, createdAt, expiresAt, createdAt).run();

  let historyId = null;
  try {
    historyId = crypto.randomUUID();
    const userAgent = request.headers.get("User-Agent") || "";
    const device = parseSessionDevice(userAgent);
    await env.DB.prepare(\`INSERT INTO user_session_history
      (id,user_id,login_at,last_seen_at,duration_seconds,status,ip_address,user_agent,device_family,browser,os,created_at,updated_at)
      VALUES(?,?,?,?,0,'active',?,?,?,?,?,?,?)\`)
      .bind(historyId, user.id, createdAt, createdAt, request.headers.get("CF-Connecting-IP"), userAgent, device.deviceFamily, device.browser, device.os, createdAt, createdAt).run();
    await env.DB.prepare("UPDATE sessions SET history_id=? WHERE token_hash=?")
      .bind(historyId, tokenHash).run();
  } catch (error) {
    historyId = null;
    console.error(JSON.stringify({ event: "session-history-write-failed", userId: user.id, message: error?.message || String(error) }));
  }

  try {
    await audit(env, request, user, null, "login", { sessionExpiresAt: expiresAt, historyId });
  } catch (error) {
    console.error(JSON.stringify({ event: "login-audit-write-failed", userId: user.id, message: error?.message || String(error) }));
  }`;

if (field.includes(sessionHistoryLogin)) {
  field = field.replace(sessionHistoryLogin, resilientLogin);
} else if (!field.includes('event: "session-history-write-failed"')) {
  throw new Error("Session-history login block was not found; refusing an unsafe partial patch.");
}

fs.writeFileSync(fieldPath, field);
console.log("Hardened login so session telemetry cannot block valid authentication.");
