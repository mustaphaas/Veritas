const encoder = new TextEncoder();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }

async function currentUser(request, env) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  return env.DB.prepare(`SELECT u.id,u.role,u.consultant_firm AS consultantFirm FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)
    .bind(await digest(bearer), new Date().toISOString()).first();
}

function mapClaim(row) {
  return {
    id: row.id, claimId: row.claim_id, projectId: row.project_id || '', programme: row.programme,
    state: row.state, lga: row.lga, community: row.community || '', latitude: Number(row.latitude || 0), longitude: Number(row.longitude || 0),
    contractor: row.contractor, claimAmount: Number(row.claim_amount || 0), claimDate: row.claim_date || '',
    consultantId: row.consultant_id || '', consultantFirm: row.consultant_firm || '', allocationStatus: row.allocation_status,
    verificationStatus: row.verification_status, auditStatus: row.audit_status, source: row.source, sourceReference: row.source_reference,
    submittedDate: row.submitted_date || '', createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function requireRea(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ error: 'Authentication required.' }, 401) };
  if (!String(user.role || '').startsWith('rea_')) return { response: json({ error: 'REA access required.' }, 403) };
  return { user };
}

async function listClaims(request, env) {
  const allocation = new URL(request.url).searchParams.get('allocation') || 'All';
  const where = allocation === 'Assigned' || allocation === 'Unassigned' ? ' WHERE allocation_status=?' : '';
  const stmt = env.DB.prepare(`SELECT * FROM claims${where} ORDER BY created_at DESC, claim_id`);
  const result = where ? await stmt.bind(allocation).all() : await stmt.all();
  return json({ claims: (result.results || []).map(mapClaim), allocation, serverTime: new Date().toISOString() });
}

async function listConsultants(env) {
  const result = await env.DB.prepare(`SELECT id,firm_name AS firmName,status FROM consultants WHERE status='Active' ORDER BY firm_name COLLATE NOCASE`).all();
  return json({ consultants: result.results || [] });
}

async function consultantProjectsFromClaims(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'Authentication required.' }, 401);
  if (user.role !== 'consultant_admin' && user.role !== 'rea_admin') return json({ error: 'Consultant or REA access required.' }, 403);

  let consultantFirm = user.consultantFirm;
  if (user.role === 'rea_admin') consultantFirm = new URL(request.url).searchParams.get('consultantFirm') || consultantFirm;
  if (!consultantFirm) return json({ error: 'Consultant firm is required.' }, 400);

  const [projectResult, claimResult] = await Promise.all([
    env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
      reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
      households,verified,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
      data_source AS dataSource,updated_at AS updatedAt
      FROM projects WHERE consultant_firm=? ORDER BY state,name`).bind(consultantFirm).all(),
    env.DB.prepare(`SELECT id,claim_id AS claimId,project_id AS projectId,programme,state,lga,community,latitude,longitude,contractor,
      claim_date AS claimDate,verification_status AS verificationStatus,consultant_firm AS consultantFirm,updated_at AS updatedAt
      FROM claims WHERE consultant_firm=? AND allocation_status='Assigned' ORDER BY state,claim_id`).bind(consultantFirm).all(),
  ]);

  const projects = (projectResult.results || []).map((project) => ({
    ...project,
    installedCapacityKw: Number(project.installedCapacityKw || 0),
    households: Number(project.households || 0),
    verified: Number(project.verified) === 1,
    latitude: Number(project.latitude),
    longitude: Number(project.longitude),
    geofenceRadiusMetres: Number(project.geofenceRadiusMetres || 250),
  }));
  const seen = new Set(projects.map((project) => project.id));

  for (const row of claimResult.results || []) {
    const id = row.projectId || `claimProject-${row.claimId}`;
    if (seen.has(id)) continue;
    const claimProject = {
      id,
      name: row.community ? `${row.community} - ${row.claimId}` : row.projectId || row.claimId,
      programme: row.programme || 'DARES',
      component: 'Claim Verification',
      contractor: row.contractor || '',
      consultantFirm: row.consultantFirm,
      state: row.state || '',
      lga: row.lga || '',
      community: row.community || '',
      reportingMonth: row.claimDate ? String(row.claimDate).slice(0, 7) : '',
      status: row.verificationStatus || 'Assigned for Verification',
      installedCapacityKw: 0,
      households: 0,
      verified: row.verificationStatus === 'REA Verified',
      latitude: Number(row.latitude || 0),
      longitude: Number(row.longitude || 0),
      geofenceRadiusMetres: 250,
      dataSource: 'claim',
      updatedAt: row.updatedAt,
      claimId: row.claimId,
    };
    projects.push(claimProject);
    seen.add(id);
  }

  return json({ consultantFirm, projects, serverTime: new Date().toISOString() });
}

function normalizedImport(row, index) {
  const claimId = String(row.claimId || row.id || '').trim();
  const projectId = String(row.projectId || '').trim();
  const state = String(row.state || '').trim();
  const lga = String(row.lga || '').trim();
  const contractor = String(row.contractor || '').trim();
  const amount = Number(row.claimAmount || 0);
  const latitude = row.latitude === '' || row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude === '' || row.longitude == null ? null : Number(row.longitude);
  if (!claimId || !state || !lga || !contractor || !Number.isFinite(amount) || amount < 0) throw new Error(`Row ${index + 1}: claim ID, state, LGA, contractor and a valid amount are required.`);
  if ((latitude != null && !Number.isFinite(latitude)) || (longitude != null && !Number.isFinite(longitude))) throw new Error(`Row ${index + 1}: invalid coordinates.`);
  return {
    id: String(row.internalId || `claim-${crypto.randomUUID()}`), claimId, projectId: projectId || null,
    programme: String(row.programme || 'DARES').trim() || 'DARES', state, lga, community: String(row.community || '').trim() || null,
    latitude, longitude, contractor, amount, claimDate: String(row.claimDate || '').trim() || null,
    sourceReference: String(row.sourceReference || claimId).trim() || claimId, submittedDate: String(row.submittedDate || row.claimDate || '').trim() || null,
  };
}

async function importClaims(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.claims) || !body.claims.length) return json({ error: 'Upload at least one valid claim row.' }, 400);
  let rows;
  try { rows = body.claims.map(normalizedImport); } catch (error) { return json({ error: error.message }, 400); }
  const now = new Date().toISOString();
  const statements = rows.map((row) => env.DB.prepare(`INSERT INTO claims
    (id,claim_id,project_id,programme,state,lga,community,latitude,longitude,contractor,claim_amount,claim_date,allocation_status,verification_status,audit_status,source,source_reference,submitted_date,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'Unassigned','Uploaded','Pending','import',?,?,?,?)`)
    .bind(row.id,row.claimId,row.projectId,row.programme,row.state,row.lga,row.community,row.latitude,row.longitude,row.contractor,row.amount,row.claimDate,row.sourceReference,row.submittedDate,now,now));
  try { await env.DB.batch(statements); } catch { return json({ error: 'Import failed. Check duplicate Claim IDs/source references and row values.' }, 409); }
  return json({ ok: true, imported: rows.length }, 201);
}

async function assignClaim(request, env, user, id) {
  const body = await request.json().catch(() => null);
  const consultantId = String(body?.consultantId || '').trim();
  if (!consultantId) return json({ error: 'Choose an active consultant.' }, 400);
  const consultant = await env.DB.prepare(`SELECT id,firm_name AS firmName,status FROM consultants WHERE id=? AND status='Active'`).bind(consultantId).first();
  if (!consultant) return json({ error: 'Active consultant not found.' }, 404);
  const claim = await env.DB.prepare(`SELECT id,project_id AS projectId,allocation_status AS allocationStatus,consultant_id AS consultantId,consultant_firm AS consultantFirm FROM claims WHERE id=? OR claim_id=?`).bind(id, id).first();
  if (!claim) return json({ error: 'Claim not found.' }, 404);
  if (claim.allocationStatus === 'Assigned' || claim.consultantId || claim.consultantFirm) return json({ error: 'This project is already assigned and cannot be reassigned.' }, 409);
  if (claim.projectId) {
    const existingProjectAssignment = await env.DB.prepare(`SELECT consultant_firm AS consultantFirm FROM claims WHERE project_id=? AND allocation_status='Assigned' LIMIT 1`).bind(claim.projectId).first();
    if (existingProjectAssignment) return json({ error: `Project ${claim.projectId} is already assigned to ${existingProjectAssignment.consultantFirm} and cannot be reassigned.` }, 409);
    const project = await env.DB.prepare(`SELECT consultant_firm AS consultantFirm FROM projects WHERE id=?`).bind(claim.projectId).first();
    const projectFirm = String(project?.consultantFirm || '').trim();
    if (projectFirm && projectFirm !== 'REA Unallocated' && projectFirm !== consultant.firmName) {
      return json({ error: `Project ${claim.projectId} is already assigned to ${projectFirm} and cannot be reassigned.` }, 409);
    }
  }
  const now = new Date().toISOString();
  const statement = claim.projectId
    ? env.DB.prepare(`UPDATE claims SET consultant_id=?,consultant_firm=?,allocation_status='Assigned',verification_status=CASE WHEN verification_status='Uploaded' THEN 'Assigned for Verification' ELSE verification_status END,updated_at=? WHERE project_id=? AND allocation_status='Unassigned' AND consultant_id IS NULL AND consultant_firm IS NULL`).bind(consultant.id, consultant.firmName, now, claim.projectId)
    : env.DB.prepare(`UPDATE claims SET consultant_id=?,consultant_firm=?,allocation_status='Assigned',verification_status=CASE WHEN verification_status='Uploaded' THEN 'Assigned for Verification' ELSE verification_status END,updated_at=? WHERE id=? AND allocation_status='Unassigned' AND consultant_id IS NULL AND consultant_firm IS NULL`).bind(consultant.id, consultant.firmName, now, claim.id);
  const update = await statement.run();
  if (Number(update.meta?.changes || 0) < 1) return json({ error: 'This project was assigned by another user and cannot be reassigned.' }, 409);
  if (claim.projectId) {
    await env.DB.prepare(`UPDATE projects SET consultant_firm=?,updated_at=? WHERE id=? AND (consultant_firm IS NULL OR consultant_firm='' OR consultant_firm='REA Unallocated' OR consultant_firm=?)`)
      .bind(consultant.firmName, now, claim.projectId, consultant.firmName).run();
  }
  await env.DB.prepare(`INSERT INTO claim_events(id,claim_id,event_type,from_value,to_value,actor_user_id,note,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), claim.id, 'assignment', 'Unassigned', consultant.firmName, user.id, claim.projectId ? `Immutable project assignment: ${claim.projectId}` : 'Immutable consultant assignment', now).run();
  const updated = await env.DB.prepare('SELECT * FROM claims WHERE id=?').bind(claim.id).first();
  return json({ ok: true, claim: mapClaim(updated), affectedClaims: Number(update.meta?.changes || 0) });
}

async function updateClaim(request, env, user, id) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  const allowedVerification = ['Uploaded','Assigned for Verification','Field Inspection Complete','Consultant Reviewed','REA Verified','Disputed','Rejected'];
  const verification = body.verificationStatus;
  const audit = body.auditStatus;
  if (verification && !allowedVerification.includes(verification)) return json({ error: 'Invalid verification status.' }, 400);
  const claim = await env.DB.prepare('SELECT id,verification_status AS verificationStatus,audit_status AS auditStatus FROM claims WHERE id=? OR claim_id=?').bind(id,id).first();
  if (!claim) return json({ error: 'Claim not found.' }, 404);
  const nextVerification = verification || claim.verificationStatus;
  const nextAudit = audit ? String(audit) : claim.auditStatus;
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE claims SET verification_status=?,audit_status=?,updated_at=? WHERE id=?').bind(nextVerification,nextAudit,now,claim.id).run();
  if (nextVerification !== claim.verificationStatus) await env.DB.prepare(`INSERT INTO claim_events(id,claim_id,event_type,from_value,to_value,actor_user_id,note,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),claim.id,'status',claim.verificationStatus,nextVerification,user.id,'REA claim status update',now).run();
  const updated = await env.DB.prepare('SELECT * FROM claims WHERE id=?').bind(claim.id).first();
  return json({ ok: true, claim: mapClaim(updated) });
}

export async function handleClaimsApi(request, env) {
  const url = new URL(request.url);
  const isClaims = url.pathname === '/api/rea/claims' || url.pathname === '/api/rea/claims/import' || /^\/api\/rea\/claims\/[^/]+(?:\/assign)?$/.test(url.pathname);
  const isConsultantsGet = url.pathname === '/api/rea/consultants' && request.method === 'GET';
  const isConsultantProjects = url.pathname === '/api/consultant/projects' && request.method === 'GET';
  if (!isClaims && !isConsultantsGet && !isConsultantProjects) return null;
  if (isConsultantProjects) return consultantProjectsFromClaims(request, env);
  const auth = await requireRea(request, env); if (auth.response) return auth.response;
  if (isConsultantsGet) return listConsultants(env);
  if (url.pathname === '/api/rea/claims' && request.method === 'GET') return listClaims(request, env);
  if (url.pathname === '/api/rea/claims/import' && request.method === 'POST') return importClaims(request, env);
  const match = url.pathname.match(/^\/api\/rea\/claims\/([^/]+)(?:\/(assign))?$/);
  if (match && match[2] === 'assign' && request.method === 'POST') return assignClaim(request, env, auth.user, decodeURIComponent(match[1]));
  if (match && !match[2] && request.method === 'PATCH') return updateClaim(request, env, auth.user, decodeURIComponent(match[1]));
  return json({ error: 'Method not allowed.' }, 405);
}
