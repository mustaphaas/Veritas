import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

// ---------------------------------------------------------------------------
// Worker: D1-backed consultant creation/profile + field-officer lifecycle.
// ---------------------------------------------------------------------------
const workerPath = "worker/index.js";
let worker = fs.readFileSync(workerPath, "utf8");

if (!worker.includes("async function managementPasswordRecord")) {
  worker = replaceOnce(
    worker,
    'const encoder = new TextEncoder();',
    `const encoder = new TextEncoder();
const managementB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function managementPasswordRecord(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 100000 }, key, 256);
  return { salt: managementB64(saltBytes), hash: managementB64(bits) };
}`,
    "worker password helper",
  );
}

const managementFunctions = `
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
  if (!/^\\S+@\\S+\\.\\S+$/.test(email)) return json({ error: "A valid consultant admin email is required." }, 400);
  const firmName = String(body.firmName).trim();
  const duplicateConsultant = await env.DB.prepare("SELECT id FROM consultants WHERE lower(firm_name)=lower(?) OR lower(admin_email)=lower(?)").bind(firmName, email).first();
  const duplicateUser = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(email).first();
  if (duplicateConsultant || duplicateUser) return json({ error: "A consultant with this firm name or admin email already exists." }, 409);

  const id = String(body.id || \`con-\${crypto.randomUUID()}\`);
  const adminUserId = \`consultant-\${crypto.randomUUID()}\`;
  const timestamp = new Date().toISOString();
  const credentials = await managementPasswordRecord(String(body.temporaryPassword));
  const consultantStatus = ["Active", "Inactive", "Pending Activation"].includes(body.status) ? body.status : "Active";
  const userStatus = consultantStatus === "Active" ? "active" : "suspended";

  try {
    await env.DB.prepare(\`INSERT INTO consultants
      (id,firm_name,admin_name,admin_email,admin_phone,regions_json,states_json,status,engagement_ref,scope_note,engagement_start,engagement_end,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)\`)
      .bind(id, firmName, String(body.adminName).trim(), email, body.adminPhone ? String(body.adminPhone).trim() : null,
        JSON.stringify(Array.isArray(body.regions) ? body.regions : []), JSON.stringify(body.states), consultantStatus,
        String(body.engagementRef).trim(), body.scopeNote ? String(body.scopeNote).trim() : "",
        body.engagementStart || null, body.engagementEnd || null, timestamp, timestamp).run();
    try {
      await env.DB.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(adminUserId, String(body.adminName).trim(), email, body.adminPhone ? String(body.adminPhone).trim() : null,
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

async function consultantProfileResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" || !user.consultantFirm) return json({ error: "Consultant access required." }, 403);
  const record = await env.DB.prepare(\`SELECT id,firm_name AS firmName,admin_name AS adminName,admin_email AS adminEmail,admin_phone AS adminPhone,
    regions_json AS regionsJson,states_json AS statesJson,status,engagement_ref AS engagementRef,scope_note AS scopeNote,
    engagement_start AS engagementStart,engagement_end AS engagementEnd FROM consultants WHERE firm_name=?\`)
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
`;

if (!worker.includes("async function reaConsultantCreateResponse")) {
  worker = replaceOnce(worker, "\nfunction latestQuestion(messages = []) {", `${managementFunctions}\nfunction latestQuestion(messages = []) {`, "worker management functions");
}

const routeAnchor = `    if (url.pathname === "/api/consultant/field-officers") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantFieldOfficerResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_roster_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant field-officer roster." }, 503);
      }
    }

    const fieldResponse = await handleFieldApi(request, env);`;
const routeReplacement = `    if (url.pathname === "/api/consultant/field-officers") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantFieldOfficerResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_roster_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant field-officer roster." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/profile") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return consultantProfileResponse(request, env);
    }

    if (url.pathname === "/api/rea/consultants") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return reaConsultantCreateResponse(request, env);
    }

    const officerLifecycleMatch = url.pathname.match(/^\\/api\\/field\\/users\\/field-officers\\/([^/]+)(?:\\/(status))?$/);
    if (officerLifecycleMatch && (request.method === "PATCH" || request.method === "DELETE")) {
      const action = officerLifecycleMatch[2] === "status" && request.method === "PATCH" ? "status" : request.method === "DELETE" && !officerLifecycleMatch[2] ? "delete" : null;
      if (!action) return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return fieldOfficerLifecycleResponse(request, env, decodeURIComponent(officerLifecycleMatch[1]), action);
    }

    const fieldResponse = await handleFieldApi(request, env);`;
worker = replaceOnce(worker, routeAnchor, routeReplacement, "worker management routes");
fs.writeFileSync(workerPath, worker);

// ---------------------------------------------------------------------------
// Client API helpers.
// ---------------------------------------------------------------------------
const apiPath = "client/lib/field-api.ts";
let api = fs.readFileSync(apiPath, "utf8");
if (!api.includes("async function reaCall")) {
  api = replaceOnce(
    api,
    `async function consultantCall(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(\`/api/consultant\${path}\`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: \`Bearer \${apiToken}\`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || \`Veritas API returned \${response.status}.\`);
  return payload;
}`,
    `async function consultantCall(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(\`/api/consultant\${path}\`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: \`Bearer \${apiToken}\`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || \`Veritas API returned \${response.status}.\`);
  return payload;
}

async function reaCall(path: string, init: RequestInit = {}) {
  const apiToken = token();
  if (!apiToken) throw new Error("Cloud workflow session is unavailable.");
  const response = await fetch(\`/api/rea\${path}\`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: \`Bearer \${apiToken}\`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || \`Veritas API returned \${response.status}.\`);
  return payload;
}`,
    "REA API helper",
  );
}
api = replaceOnce(
  api,
  `export const createFieldOfficerApi = (officer: unknown) => call("/users/field-officers", { method: "POST", body: JSON.stringify(officer) });
export const fetchConsultantFieldOfficers = () => consultantCall("/field-officers");`,
  `export const createFieldOfficerApi = (officer: unknown) => call("/users/field-officers", { method: "POST", body: JSON.stringify(officer) });
export const createConsultantApi = (consultant: unknown) => reaCall("/consultants", { method: "POST", body: JSON.stringify(consultant) });
export const updateFieldOfficerStatusApi = (id: string, status: "Active" | "Suspended") => call(\`/users/field-officers/\${encodeURIComponent(id)}/status\`, { method: "PATCH", body: JSON.stringify({ status }) });
export const deleteFieldOfficerApi = (id: string) => call(\`/users/field-officers/\${encodeURIComponent(id)}\`, { method: "DELETE" });
export const fetchConsultantFieldOfficers = () => consultantCall("/field-officers");
export async function fetchConsultantProfileWithToken(apiToken: string) {
  const response = await fetch("/api/consultant/profile", { headers: { Accept: "application/json", Authorization: \`Bearer \${apiToken}\` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || \`Veritas API returned \${response.status}.\`);
  return payload;
}`,
  "client management API exports",
);
fs.writeFileSync(apiPath, api);

// ---------------------------------------------------------------------------
// Field officer creation: never hard-code consultant ownership in the client.
// ---------------------------------------------------------------------------
const workflowPath = "client/lib/inspection-workflow.tsx";
let workflow = fs.readFileSync(workflowPath, "utf8");
workflow = workflow.replace('createFieldOfficerApi({ ...account, name, email, consultantFirm: "Supreme Way" })', 'createFieldOfficerApi({ ...account, name, email })');
fs.writeFileSync(workflowPath, workflow);

// ---------------------------------------------------------------------------
// REA consultant creation: D1 write must succeed before local compatibility cache.
// ---------------------------------------------------------------------------
const reaPath = "client/components/ReaConsultantsManagement.tsx";
let rea = fs.readFileSync(reaPath, "utf8");
if (!rea.includes('createConsultantApi')) {
  rea = replaceOnce(rea, 'import { appendAuditEvent } from "../lib/rea-admin";', 'import { appendAuditEvent } from "../lib/rea-admin";\nimport { createConsultantApi } from "../lib/field-api";', "REA consultant API import");
}
rea = replaceOnce(
  rea,
  ` const upsert=(form:Form)=>{
  if(modal?.record){const next={...form,id:modal.record.id};save(records.map(r=>r.id===next.id?next:r));log(next,"Consultant updated",\`\${next.firmName} profile and access settings updated.\`);setModal(null);return;}
  const next={...form,id:\`con-\${Date.now()}\`};save([next,...records]);log(next,"Consultant created",\`\${next.firmName} dashboard created for \${next.adminEmail}.\`);setModal(null);
 };`,
  ` const upsert=async(form:Form)=>{
  if(modal?.record){const next={...form,id:modal.record.id};save(records.map(r=>r.id===next.id?next:r));log(next,"Consultant updated",\`\${next.firmName} profile and access settings updated.\`);setModal(null);return;}
  const next={...form,id:\`con-\${Date.now()}\`};
  try{await createConsultantApi(next);save([next,...records]);log(next,"Consultant created",\`\${next.firmName} dashboard created in the Veritas database for \${next.adminEmail}.\`);setModal(null);}catch(error){setNotice(error instanceof Error?error.message:"Unable to create consultant in the database.");}
 };`,
  "REA consultant D1 upsert",
);
fs.writeFileSync(reaPath, rea);

// ---------------------------------------------------------------------------
// Cloud-first login: database-created consultant accounts work on any browser.
// ---------------------------------------------------------------------------
const authPath = "client/lib/auth.tsx";
let auth = fs.readFileSync(authPath, "utf8");
auth = auth.replace('import { readConsultants } from "./consultants";', 'import { readConsultants, writeConsultants } from "./consultants";');
auth = auth.replace('import { authenticateFieldApi } from "./field-api";', 'import { authenticateFieldApi, fetchConsultantProfileWithToken } from "./field-api";');
const oldLogin = ` const login=async(email:string,password:string)=>{
  const account=authenticateDemoAccount(email,password);if(!account)return null;
  let cloud;try{cloud=await authenticateFieldApi(email,password)}catch{return null}
  const expected={rea:"rea_admin",field:"field_officer",consultant:"consultant_admin"}[account.role];if(cloud.user.role!==expected)return null;
  if(account.role==="rea")appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:\`Successful login for \${account.email}\`,severity:"Success"});
  const{password:_password,...baseSession}=account;const nextSession={...baseSession,apiToken:cloud.token,apiExpiresAt:cloud.expiresAt};setSession(nextSession);window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(nextSession));window.dispatchEvent(new Event("veritas-cloud-session"));return nextSession;
 };`;
const newLogin = ` const login=async(email:string,password:string)=>{
  let cloud;try{cloud=await authenticateFieldApi(email,password)}catch{return null}
  const cloudRole=({rea_admin:"rea",field_officer:"field",consultant_admin:"consultant"} as const)[cloud.user.role as "rea_admin"|"field_officer"|"consultant_admin"];
  if(!cloudRole)return null;
  let consultantId:string|undefined;
  if(cloudRole==="consultant"){
   try{const profile=await fetchConsultantProfileWithToken(cloud.token);const record=profile?.consultant;if(record?.id){consultantId=record.id;const current=readConsultants();writeConsultants([record,...current.filter(item=>item.id!==record.id&&item.adminEmail.toLowerCase()!==String(record.adminEmail||"").toLowerCase())]);}}catch{return null}
  }
  const local=authenticateDemoAccount(email,password);
  if(local&&local.role!==cloudRole)return null;
  const account:LoginAccount=local??{role:cloudRole,roleLabel:cloudRole==="rea"?"REA Dashboard":cloudRole==="consultant"?"Consultant Admin":"Field Officer",name:cloud.user.name||email,initials:initials(cloud.user.name||email),email:cloud.user.email||email,password,path:cloudRole==="rea"?"/":cloudRole==="consultant"?"/consultant-admin":"/field-officer",consultantId};
  if(cloudRole==="consultant"&&consultantId)account.consultantId=consultantId;
  if(account.role==="rea")appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:\`Successful login for \${account.email}\`,severity:"Success"});
  const{password:_password,...baseSession}=account;const nextSession={...baseSession,apiToken:cloud.token,apiExpiresAt:cloud.expiresAt};setSession(nextSession);window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(nextSession));window.dispatchEvent(new Event("veritas-cloud-session"));return nextSession;
 };`;
auth = replaceOnce(auth, oldLogin, newLogin, "cloud-first login");
fs.writeFileSync(authPath, auth);

// ---------------------------------------------------------------------------
// Consultant UI: database-backed suspend/reactivate + safe delete provision.
// ---------------------------------------------------------------------------
const dashboardPath = "client/pages/ConsultantAdminDashboard.tsx";
let dashboard = fs.readFileSync(dashboardPath, "utf8");
if (!dashboard.includes('  Trash2,')) dashboard = dashboard.replace('  RotateCcw,\n  ShieldCheck,', '  RotateCcw,\n  ShieldCheck,\n  Trash2,');
if (!dashboard.includes('deleteFieldOfficerApi')) {
  dashboard = replaceOnce(dashboard, 'import { useConsultantPortfolio } from "../lib/use-consultant-portfolio";', 'import { useConsultantPortfolio } from "../lib/use-consultant-portfolio";\nimport { deleteFieldOfficerApi, updateFieldOfficerStatusApi } from "../lib/field-api";', "consultant officer lifecycle import");
}
dashboard = dashboard.replace('  onOfficerStatus,\n  onReview,', '  onOfficerStatus,\n  onDeleteOfficer,\n  onReview,');
dashboard = dashboard.replace('  onOfficerStatus: (id: string, status: FieldOfficerAccount["status"]) => void;\n  onReview:', '  onOfficerStatus: (id: string, status: FieldOfficerAccount["status"]) => void;\n  onDeleteOfficer: (id: string) => void;\n  onReview:');
dashboard = dashboard.replaceAll('grid-cols-[minmax(210px,1.4fr)_145px_120px_90px_90px_100px_120px]', 'grid-cols-[minmax(210px,1.4fr)_145px_120px_90px_90px_100px_190px]');
const actionBlock = `                    <div className="flex justify-end">
                      {officer.status === "Active" ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOfficerStatus(officer.id, "Suspended")
                          }
                          className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[9px] font-bold text-red-700"
                        >
                          <Ban className="h-3.5 w-3.5" /> Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOfficerStatus(officer.id, "Active")}
                          className="flex items-center gap-1.5 rounded-md border border-[#8bcba0] bg-[#eff9f2] px-3 py-2 text-[9px] font-bold text-[#08733f]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                        </button>
                      )}
                    </div>`;
const actionReplacement = `                    <div className="flex justify-end gap-2">
                      {officer.status === "Active" ? (
                        <button
                          type="button"
                          onClick={() => onOfficerStatus(officer.id, "Suspended")}
                          className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[9px] font-bold text-red-700"
                        >
                          <Ban className="h-3.5 w-3.5" /> Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOfficerStatus(officer.id, "Active")}
                          className="flex items-center gap-1.5 rounded-md border border-[#8bcba0] bg-[#eff9f2] px-3 py-2 text-[9px] font-bold text-[#08733f]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={rows.length > 0}
                        title={rows.length > 0 ? "Officers with assignment history must be suspended, not deleted." : "Delete field officer"}
                        onClick={() => onDeleteOfficer(officer.id)}
                        className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-[9px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>`;
dashboard = replaceOnce(dashboard, actionBlock, actionReplacement, "field officer actions");
const dashboardStateAnchor = `  const [reviewing, setReviewing] = useState<InspectionAssignment | null>(null);
  const location = useLocation();`;
const dashboardStateReplacement = `  const [reviewing, setReviewing] = useState<InspectionAssignment | null>(null);
  const handleOfficerStatus=async(id:string,status:FieldOfficerAccount["status"])=>{try{await updateFieldOfficerStatusApi(id,status);setFieldOfficerStatus(id,status);window.dispatchEvent(new Event("veritas-cloud-session"));}catch(error){window.alert(error instanceof Error?error.message:"Unable to update field officer.");}};
  const handleDeleteOfficer=async(id:string)=>{if(!window.confirm("Delete this field officer? This is only allowed when the officer has no assignment history."))return;try{await deleteFieldOfficerApi(id);window.dispatchEvent(new Event("veritas-cloud-session"));}catch(error){window.alert(error instanceof Error?error.message:"Unable to delete field officer.");}};
  const location = useLocation();`;
dashboard = replaceOnce(dashboard, dashboardStateAnchor, dashboardStateReplacement, "field officer lifecycle handlers");
dashboard = dashboard.replace('          onOfficerStatus={setFieldOfficerStatus}\n          onReview={setReviewing}', '          onOfficerStatus={handleOfficerStatus}\n          onDeleteOfficer={handleDeleteOfficer}\n          onReview={setReviewing}');
fs.writeFileSync(dashboardPath, dashboard);

// Guardrails: fail deployment if any critical part did not land.
const checks = [
  [worker, '/api/rea/consultants', "REA consultant endpoint"],
  [worker, 'field-officer-status-changed', "field officer lifecycle endpoint"],
  [api, 'createConsultantApi', "consultant API helper"],
  [rea, 'await createConsultantApi(next)', "database-first consultant creation"],
  [auth, 'fetchConsultantProfileWithToken', "cloud-first consultant login"],
  [dashboard, 'deleteFieldOfficerApi', "field officer delete action"],
];
for (const [source, needle, label] of checks) if (!source.includes(needle)) throw new Error(`${label} missing after patch`);
if (workflow.includes('consultantFirm: "Supreme Way"')) throw new Error("Hard-coded Supreme Way field-officer ownership still present");

console.log("Applied D1 consultant tenancy and field-officer lifecycle patch");
