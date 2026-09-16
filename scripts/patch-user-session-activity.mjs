import fs from "node:fs";

const fieldPath = "worker/field-api.js";
const workerPath = "worker/index.js";
const auditPath = "client/components/ReaAuditTrail.tsx";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

let field = fs.readFileSync(fieldPath, "utf8");

if (!field.includes("function parseSessionDevice")) {
  field = field.replace("async function currentUser(request, env) {", `function parseSessionDevice(userAgent = "") {
  const ua = String(userAgent || "");
  const deviceFamily = /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "Other";
  const os = /windows/i.test(ua) ? "Windows" : /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /mac os|macintosh/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Other";
  return { deviceFamily, browser, os };
}

async function currentUser(request, env) {`);
}

field = field.replace(/async function currentUser\(request, env\) \{[\s\S]*?\n\}\n\nfunction distanceMetres/, `async function currentUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!bearer) return null;
  const tokenHash = await digest(bearer);
  const user = await env.DB.prepare(\`SELECT u.id,u.name,u.email,u.phone,u.role,u.consultant_firm AS consultantFirm,
    s.history_id AS historyId,s.created_at AS sessionCreatedAt
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'\`).bind(tokenHash, now()).first();
  if (user) {
    const activityAt = now();
    await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").bind(activityAt, tokenHash).run();
    if (user.historyId) {
      const durationSeconds = Math.max(0, Math.floor((Date.parse(activityAt) - Date.parse(user.sessionCreatedAt)) / 1000));
      await env.DB.prepare("UPDATE user_session_history SET last_seen_at=?,duration_seconds=?,updated_at=? WHERE id=? AND status='active'")
        .bind(activityAt, durationSeconds, activityAt, user.historyId).run();
    }
  }
  return user;
}

function distanceMetres`);

const oldLogin = `  const sessionToken = token(), createdAt = now(), expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)").bind(await digest(sessionToken), user.id, createdAt, expiresAt, createdAt).run();
  await audit(env, request, user, null, "login", { sessionExpiresAt: expiresAt });`;
const newLogin = `  const sessionToken = token(), createdAt = now(), expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
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
field = replaceOnce(field, oldLogin, newLogin, "login session history");

const oldLogout = `    const bearer = request.headers.get("Authorization").replace(/^Bearer\\s+/i, "");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(bearer)).run();
    return response({ ok: true });`;
const newLogout = `    const bearer = request.headers.get("Authorization").replace(/^Bearer\\s+/i, "");
    const tokenHash = await digest(bearer);
    const session = await env.DB.prepare("SELECT history_id AS historyId,created_at AS createdAt FROM sessions WHERE token_hash=?").bind(tokenHash).first();
    if (session?.historyId) {
      const endedAt = now();
      const durationSeconds = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(session.createdAt)) / 1000));
      await env.DB.prepare("UPDATE user_session_history SET last_seen_at=?,ended_at=?,duration_seconds=?,status='ended',end_reason='manual_logout',updated_at=? WHERE id=?")
        .bind(endedAt, endedAt, durationSeconds, endedAt, session.historyId).run();
    }
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(tokenHash).run();
    return response({ ok: true });`;
field = replaceOnce(field, oldLogout, newLogout, "logout session history");
fs.writeFileSync(fieldPath, field);

let worker = fs.readFileSync(workerPath, "utf8");

if (!worker.includes("async function sessionActivityResponse")) {
  const sessionHandler = `async function sessionActivityResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" && !String(user.role || "").startsWith("rea_")) {
    return json({ error: "REA or consultant administrator access required." }, 403);
  }

  const timestamp = new Date().toISOString();
  await env.DB.prepare(\`UPDATE user_session_history
    SET status='ended',end_reason='expired',ended_at=last_seen_at,updated_at=?
    WHERE status='active' AND id IN (
      SELECT history_id FROM sessions WHERE history_id IS NOT NULL AND expires_at<=?
    )\`).bind(timestamp, timestamp).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(timestamp).run();

  const url = new URL(request.url);
  const conditions = [];
  const bindings = [];
  if (user.role === "consultant_admin") {
    conditions.push("u.consultant_firm=?");
    bindings.push(user.consultantFirm);
  } else if (url.searchParams.get("consultantFirm")) {
    conditions.push("u.consultant_firm=?");
    bindings.push(url.searchParams.get("consultantFirm"));
  }
  for (const [param, column] of [["userId","h.user_id"],["role","u.role"],["status","h.status"]]) {
    const value = url.searchParams.get(param);
    if (value) { conditions.push(column + "=?"); bindings.push(value); }
  }
  const from = url.searchParams.get("from");
  if (from) { conditions.push("h.login_at>=?"); bindings.push(from); }
  const to = url.searchParams.get("to");
  if (to) { conditions.push("h.login_at<=?"); bindings.push(to); }
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200) || 200));
  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  const result = await env.DB.prepare(\`SELECT h.id,h.user_id AS userId,u.name,u.role,u.consultant_firm AS consultantFirm,
    h.login_at AS loginAt,h.last_seen_at AS lastSeenAt,h.ended_at AS endedAt,h.duration_seconds AS durationSeconds,
    h.status,h.end_reason AS endReason,h.ip_address AS ipAddress,h.device_family AS deviceFamily,h.browser,h.os
    FROM user_session_history h JOIN users u ON u.id=h.user_id\${where}
    ORDER BY h.login_at DESC LIMIT ?\`).bind(...bindings, limit).all();
  const sessions = result.results || [];
  const totalDurationSeconds = sessions.reduce((sum, row) => sum + Number(row.durationSeconds || 0), 0);
  const byUser = new Map();
  for (const row of sessions) {
    const current = byUser.get(row.userId) || { userId: row.userId, name: row.name, role: row.role, consultantFirm: row.consultantFirm || "", sessions: 0, observedDurationSeconds: 0, latestLogin: null };
    current.sessions += 1;
    current.observedDurationSeconds += Number(row.durationSeconds || 0);
    if (!current.latestLogin || row.loginAt > current.latestLogin) current.latestLogin = row.loginAt;
    byUser.set(row.userId, current);
  }
  const afterHoursSessions = sessions.filter((row) => {
    const hour = new Date(row.loginAt).getUTCHours();
    return hour < 5 || hour >= 18;
  }).length;
  return json({
    sessions,
    summary: {
      sessionCount: sessions.length,
      uniqueUsers: new Set(sessions.map((row) => row.userId)).size,
      openSessions: sessions.filter((row) => row.status === "active").length,
      totalObservedDurationSeconds: totalDurationSeconds,
      averageObservedDurationSeconds: sessions.length ? Math.round(totalDurationSeconds / sessions.length) : 0,
      latestLogin: sessions[0]?.loginAt || null,
      afterHoursSessions,
      byUser: [...byUser.values()],
    },
    note: "Duration is an observed session span from login to the latest recorded activity or session end; it does not prove continuous work.",
    serverTime: timestamp,
  });
}

`;
  worker = worker.replace("async function reaUsersResponse(request, env) {", sessionHandler + "async function reaUsersResponse(request, env) {");
}

if (!worker.includes('url.pathname === "/api/session-activity"')) {
  const routeAnchor = `    if (url.pathname === "/api/rea/users") {`;
  const route = `    if (url.pathname === "/api/session-activity") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return sessionActivityResponse(request, env);
    }

`;
  worker = replaceOnce(worker, routeAnchor, route + routeAnchor, "session activity route");
}

worker = worker.replace(
  "const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult] = await Promise.all([",
  "const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult, sessionResult] = await Promise.all([",
);
const auditQuery = '    env.DB.prepare(`SELECT action,COUNT(*) AS count FROM audit_events GROUP BY action ORDER BY count DESC`).all(),\n  ]);';
const sessionQuery = '    env.DB.prepare(`SELECT h.id,h.user_id AS userId,u.name,u.role,u.consultant_firm AS consultantFirm,h.login_at AS loginAt,h.last_seen_at AS lastSeenAt,h.ended_at AS endedAt,h.duration_seconds AS durationSeconds,h.status,h.end_reason AS endReason,h.ip_address AS ipAddress,h.device_family AS deviceFamily,h.browser,h.os FROM user_session_history h JOIN users u ON u.id=h.user_id ORDER BY h.login_at DESC LIMIT 250`).all(),\n  ]);';
if (!worker.includes("sessionResult.results")) worker = replaceOnce(worker, auditQuery, auditQuery.replace("\n  ]);", "\n") + sessionQuery, "AI session query");

if (!worker.includes("const sessionRows = sessionResult.results || []")) {
  const anchor = '  const reaStaff = users.filter((user) => String(user.role || "").startsWith("rea_"));';
  const addition = `${anchor}
  const sessionRows = sessionResult.results || [];
  const totalSessionDurationSeconds = sessionRows.reduce((sum, row) => sum + Number(row.durationSeconds || 0), 0);
  const sessionByRole = Object.fromEntries([...new Set(sessionRows.map((row) => row.role))].map((role) => [role, sessionRows.filter((row) => row.role === role).length]));
  const sessionByConsultant = Object.fromEntries([...new Set(sessionRows.map((row) => row.consultantFirm).filter(Boolean))].map((firm) => [firm, sessionRows.filter((row) => row.consultantFirm === firm).length]));`;
  worker = replaceOnce(worker, anchor, addition, "AI session metrics");
}

if (!worker.includes("sessionActivity: {")) {
  const anchor = "    auditSummary: auditResult.results || [],";
  const block = `    sessionActivity: {
      sessionCount: sessionRows.length,
      uniqueUsers: new Set(sessionRows.map((row) => row.userId)).size,
      openSessions: sessionRows.filter((row) => row.status === "active").length,
      totalObservedDurationSeconds: totalSessionDurationSeconds,
      averageObservedDurationSeconds: sessionRows.length ? Math.round(totalSessionDurationSeconds / sessionRows.length) : 0,
      latestLogin: sessionRows[0]?.loginAt || null,
      byRole: sessionByRole,
      byConsultant: sessionByConsultant,
      recentSessions: sessionRows.slice(0, 80),
      durationMeaning: "Observed session span from login to latest recorded activity or session end; it does not prove continuous work.",
    },
${anchor}`;
  worker = replaceOnce(worker, anchor, block, "AI session context");
}

if (!worker.includes("SESSION ACTIVITY INTERPRETATION RULES:")) {
  worker = worker.replace("EVIDENCE AND CAUSALITY RULES:", `SESSION ACTIVITY INTERPRETATION RULES:
- Session duration is an observed session span from login to the latest recorded authenticated activity or explicit session end. It does not prove the user worked continuously for that entire span.
- A long session, unusual login hour, concurrent session, multiple IP addresses, or a change in device may warrant review, but does not prove misconduct, non-performance, absence, account compromise, credential sharing, or fraud.
- When analysing logins, distinguish exact recorded facts (timestamps, counts, durations, roles, consultant firms) from interpretation. State uncertainty directly and recommend review when appropriate.
- Never expose session tokens or hashes. Avoid repeating raw IP addresses unless the user explicitly requests a security investigation and is authorised to view them.

EVIDENCE AND CAUSALITY RULES:`);
}
fs.writeFileSync(workerPath, worker);

const auditUi = `import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, CalendarClock, Download, LogIn, ScrollText, Search, ShieldAlert, UserRound } from "lucide-react";
import { readAuditEvents, readReaStaff, type AuditEvent } from "../lib/rea-admin";
import { useAuth } from "../lib/auth";

const systemEmail = "system@veritas.rea.gov.ng";
const durationLabel = (seconds:number) => { const value=Math.max(0,Number(seconds||0)); const h=Math.floor(value/3600); const m=Math.floor((value%3600)/60); return h ? h+"h "+m+"m" : m+"m"; };

type SessionRow={id:string;userId:string;name:string;role:string;consultantFirm?:string;loginAt:string;lastSeenAt:string;endedAt?:string;durationSeconds:number;status:string;endReason?:string;ipAddress?:string;deviceFamily?:string;browser?:string;os?:string};

export default function ReaAuditTrail(){
  const {session}=useAuth();
  const [mode,setMode]=useState<"events"|"sessions">("events");
  const [events,setEvents]=useState<AuditEvent[]>(readAuditEvents);
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [sessionNote,setSessionNote]=useState("Duration is an observed session span, not proof of continuous work.");
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("All activity");
  useEffect(()=>{const refresh=()=>setEvents(readAuditEvents());window.addEventListener("veritas-audit-updated",refresh);return()=>window.removeEventListener("veritas-audit-updated",refresh);},[]);
  useEffect(()=>{if(mode!=="sessions"||!session?.apiToken)return;fetch("/api/session-activity?limit=300",{headers:{Authorization:"Bearer "+session.apiToken}}).then(r=>r.ok?r.json():Promise.reject(new Error("Session activity unavailable"))).then(data=>{setSessions(data.sessions||[]);if(data.note)setSessionNote(data.note);}).catch(()=>setSessions([]));},[mode,session?.apiToken]);
  const staffByName=useMemo(()=>new Map(readReaStaff().map(staff=>[staff.name.toLowerCase(),staff])),[events]);
  const rows=useMemo(()=>events.map(event=>{const staff=staffByName.get(event.actor.toLowerCase());return {...event,staffName:staff?.name||event.actor||"System process",email:staff?.email||systemEmail};}),[events,staffByName]);
  const visible=useMemo(()=>rows.filter(event=>(event.staffName+" "+event.email+" "+event.action+" "+event.target+" "+event.details).toLowerCase().includes(query.toLowerCase())&&(category==="All activity"||event.category===category)),[rows,query,category]);
  const visibleSessions=useMemo(()=>sessions.filter(row=>(row.name+" "+row.role+" "+(row.consultantFirm||"")+" "+(row.browser||"")+" "+(row.deviceFamily||"")).toLowerCase().includes(query.toLowerCase())),[sessions,query]);
  const exportCsv=()=>{const data=mode==="events"?[["Timestamp","Staff name","Email address","Action","Target","Category","Details","Result"],...visible.map(event=>[event.timestamp,event.staffName,event.email,event.action,event.target,event.category,event.details,event.severity])]:[["User","Role","Consultant","Login","Last activity","Ended","Observed duration seconds","Device","Browser","Status","End reason"],...visibleSessions.map(row=>[row.name,row.role,row.consultantFirm||"",row.loginAt,row.lastSeenAt,row.endedAt||"",row.durationSeconds,row.deviceFamily||"",row.browser||"",row.status,row.endReason||""])];const csv=data.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\\n");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download=mode==="events"?"veritas-audit-trail.csv":"veritas-login-sessions.csv";link.click();URL.revokeObjectURL(link.href);};
  const stats=mode==="events"?[["Recorded Events",events.length,ScrollText,"Complete activity history"],["Staff Activity",new Set(rows.map(event=>event.email)).size,UserRound,"Unique staff accounts"],["Successful",events.filter(event=>event.severity==="Success").length,BadgeCheck,"Completed actions"],["Warnings",events.filter(event=>event.severity==="Warning"||event.severity==="Critical").length,ShieldAlert,"Actions requiring attention"]]:[["Login Sessions",sessions.length,LogIn,"Recorded sessions"],["Users",new Set(sessions.map(row=>row.userId)).size,UserRound,"Users represented"],["Active",sessions.filter(row=>row.status==="active").length,Activity,"Open sessions"],["Ended",sessions.filter(row=>row.status==="ended").length,BadgeCheck,"Closed sessions"]] as const;
  return <div className="space-y-4 pb-8 pt-4"><section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-[#08733f]"/><h2 className="text-xl font-bold text-[#173b2a]">Audit Trail</h2></div><p className="mt-1 text-xs text-slate-500">Review system actions and authenticated Login Sessions across Veritas.</p><div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"><button onClick={()=>setMode("events")} className={(mode==="events"?"bg-white text-[#08733f] shadow-sm ":"text-slate-500 ")+"rounded-md px-3 py-1.5 text-xs font-bold"}>Audit Events</button><button onClick={()=>setMode("sessions")} className={(mode==="sessions"?"bg-white text-[#08733f] shadow-sm ":"text-slate-500 ")+"rounded-md px-3 py-1.5 text-xs font-bold"}>Login Sessions</button></div></div><button onClick={exportCsv} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:border-[#9dceb0] hover:bg-emerald-50 hover:text-[#08733f]"><Download className="h-4 w-4"/>Export {mode==="events"?"audit log":"sessions"}</button></section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label,value,Icon,detail])=><article key={label} className="min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="flex h-full flex-col items-center justify-center"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[#08733f]"><Icon className="h-5 w-5"/></div><p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold text-[#13281e]">{value}</p><p className="mt-2 text-[11px] text-slate-500">{detail}</p></div></article>)}</section><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={mode==="events"?"Search staff name, email address or action":"Search user, role, Consultant or Device"} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]"/></div>{mode==="events"&&<select value={category} onChange={event=>setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><option>All activity</option>{["Authentication","User Management","Access Control","Claims","Verification","System"].map(value=><option key={value}>{value}</option>)}</select>}</div>{mode==="sessions"&&<p className="border-b border-slate-100 bg-amber-50/60 px-4 py-2 text-[11px] text-amber-800">{sessionNote}</p>}<div className="overflow-x-auto">{mode==="events"?<table className="w-full min-w-[1040px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3.5">Date & time</th><th className="px-4 py-3.5">Staff name</th><th className="px-4 py-3.5">Email address</th><th className="px-4 py-3.5">Action</th><th className="px-4 py-3.5">Category</th><th className="px-4 py-3.5">Result</th></tr></thead><tbody>{visible.map(event=><tr key={event.id} className="border-t border-slate-100"><td className="px-5 py-4 text-xs">{new Date(event.timestamp).toLocaleString("en-NG")}</td><td className="px-4 py-4 text-xs font-bold">{event.staffName}</td><td className="px-4 py-4 text-xs">{event.email}</td><td className="px-4 py-4 text-xs"><b>{event.action}</b><br/><span className="text-slate-500">{event.target} · {event.details}</span></td><td className="px-4 py-4 text-xs">{event.category}</td><td className="px-4 py-4 text-xs">{event.severity}</td></tr>)}</tbody></table>:<table className="w-full min-w-[1220px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3.5">User</th><th className="px-4 py-3.5">Role</th><th className="px-4 py-3.5">Consultant</th><th className="px-4 py-3.5">Login</th><th className="px-4 py-3.5">Last activity</th><th className="px-4 py-3.5">Ended</th><th className="px-4 py-3.5">Observed duration</th><th className="px-4 py-3.5">Device</th><th className="px-4 py-3.5">Status</th></tr></thead><tbody>{visibleSessions.map(row=><tr key={row.id} className="border-t border-slate-100 hover:bg-[#f8fcf9]"><td className="px-4 py-4 text-xs font-bold text-[#173b2a]">{row.name}</td><td className="px-4 py-4 text-xs">{row.role.replaceAll("_"," ")}</td><td className="px-4 py-4 text-xs">{row.consultantFirm||"REA"}</td><td className="px-4 py-4 text-xs">{new Date(row.loginAt).toLocaleString("en-NG")}</td><td className="px-4 py-4 text-xs">{new Date(row.lastSeenAt).toLocaleString("en-NG")}</td><td className="px-4 py-4 text-xs">{row.endedAt?new Date(row.endedAt).toLocaleString("en-NG"):"—"}</td><td className="px-4 py-4 text-xs font-semibold">{durationLabel(row.durationSeconds)}</td><td className="px-4 py-4 text-xs">{[row.deviceFamily,row.browser,row.os].filter(Boolean).join(" · ")||"Unknown"}</td><td className="px-4 py-4 text-xs"><span className={(row.status==="active"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")+" rounded-full px-2.5 py-1 text-[10px] font-bold"}>{row.status}{row.endReason?" · "+row.endReason.replaceAll("_"," "):""}</span></td></tr>)}</tbody></table>}{(mode==="events"?visible.length:visibleSessions.length)===0&&<div className="p-12 text-center"><CalendarClock className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs font-semibold text-slate-500">No records match the current filters.</p></div>}</div></section></div>;
}
`;
fs.writeFileSync(auditPath, auditUi);

console.log("Applied user session activity, AI context, and Audit Trail session view patches.");
