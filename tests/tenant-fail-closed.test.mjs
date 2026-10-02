// Behavioural regression test for finding 2: tenant scoping must FAIL CLOSED.
// Real handlers + real SQLite + real migrations. Nothing is source-patched or regex-matched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleFieldApi } from '../worker/field-api.js';
import { handleNightLightImpact } from '../worker/nightlight-analysis.js';
import { handleSatelliteVerify, handleSatelliteVerificationHistory } from '../worker/satellite-verify.js';
import { sameFirm } from '../worker/tenant.js';
import worker from '../worker/index.js';

const enc = new TextEncoder();
const sha = async (v) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8');

function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => wrap(sql) };
}

async function setup() {
  const db = new DatabaseSync(':memory:');
  // Drop the role CHECK so we can also model a future/unknown role (deny-by-default must hold for it).
  db.exec(mig('0001_field_operations.sql').replace(/CHECK \(role IN \([^)]*\)\)/, ''));
  // Columns normally added by the (data-heavy) 0002 demo-portfolio migration; schema only, no demo rows.
  for (const col of ['reporting_month TEXT', 'portfolio_status TEXT', 'installed_capacity_kw REAL NOT NULL DEFAULT 0', 'households INTEGER NOT NULL DEFAULT 0', 'verified INTEGER NOT NULL DEFAULT 0', "data_source TEXT NOT NULL DEFAULT 'field'"]) db.exec(`ALTER TABLE projects ADD COLUMN ${col}`);
  for (const m of ['0007_satellite_verification.sql', '0008_rea_staff_accounts.sql', '0008_satellite_analysis_pipeline.sql', '0010_viirs_nightlight_impact.sql', '0013_viirs_multi_metric_rural_impact.sql', '0015_satellite_verification_history.sql']) db.exec(mig(m));
  const ts = new Date().toISOString();
  const u = db.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,'s','h','active',?)");
  u.run('cons-b', 'Cons B', 'b@b.ng', null, 'consultant_admin', 'Firm B Ltd', ts);
  u.run('cons-a', 'Cons A', 'a@a.ng', null, 'consultant_admin', 'Firm A Ltd', ts);
  u.run('cons-null', 'Cons Null', 'n@n.ng', null, 'consultant_admin', null, ts);
  u.run('cons-blank', 'Cons Blank', 'bl@n.ng', null, 'consultant_admin', '', ts);
  u.run('cons-case', 'Cons Case', 'c@b.ng', null, 'consultant_admin', '  firm b LTD ', ts);
  u.run('mystery', 'Future Role', 'm@x.ng', null, 'auditor', 'Firm B Ltd', ts);
  u.run('rea-1', 'REA', 'r@rea.ng', null, 'rea_admin', null, ts);
  u.run('off-b', 'Officer B', 'ob@b.ng', null, 'field_officer', 'Firm B Ltd', ts);
  u.run('off-b2', 'Officer B2', 'ob2@b.ng', null, 'field_officer', 'Firm B Ltd', ts);
  u.run('off-blank', 'Officer Blank', 'obl@b.ng', null, 'field_officer', '', ts);
  for (const id of ['cons-b', 'cons-a', 'cons-null', 'cons-blank', 'cons-case', 'mystery', 'rea-1', 'off-b', 'off-b2']) {
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(await sha('tok-' + id), id, ts, new Date(Date.now() + 86400000).toISOString(), ts);
  }
  const p = db.prepare("INSERT INTO projects(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,250,?,?)");
  p.run('P-B', 'B Project', 'NEP', 'Mini Grid', 'C', 'Firm B Ltd', 'Kano', 'Dala', 'Dala', 12, 8.5, ts, ts);
  p.run('P-BLANK', 'Unowned Project', 'NEP', 'Mini Grid', 'C', '', 'Kano', 'Dala', 'Dala', 12, 8.5, ts, ts);
  db.prepare("INSERT INTO assignments(id,project_id,officer_id,status,due_date,sync_revision,created_at,updated_at,report_json) VALUES('A-B','P-B','off-b','Draft','2026-12-01',1,?,?,'{\"secret\":\"firm-b-report\"}')").run(ts, ts);
  return { db, env: { DB: d1(db) } };
}

const req = (path, who, method = 'GET', body) => new Request('https://x.test' + path, {
  method, headers: { Authorization: `Bearer tok-${who}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});
const getAssignment = (env, who) => handleFieldApi(req('/api/field/assignments/A-B', who), env);
const listAssignments = (env, who) => handleFieldApi(req('/api/field/assignments', who), env);

test('sameFirm: normalised, and empty/null never match', () => {
  assert.equal(sameFirm('Firm B Ltd', '  firm b LTD '), true);
  assert.equal(sameFirm(null, null), false);
  assert.equal(sameFirm('', ''), false);
  assert.equal(sameFirm('  ', undefined), false);
  assert.equal(sameFirm('Firm A', 'Firm B'), false);
});

test('assignment by id: consultant with NO firm cannot read another firm\'s assignment', async () => {
  const { env } = await setup();
  for (const who of ['cons-null', 'cons-blank']) assert.equal((await getAssignment(env, who)).status, 404, who);
});

test('assignment by id: unknown role is denied (deny by default)', async () => {
  const { env } = await setup();
  assert.equal((await getAssignment(env, 'mystery')).status, 404);
});

test('assignment by id: other firm denied; own firm (case/space-insensitive) and REA allowed', async () => {
  const { env } = await setup();
  assert.equal((await getAssignment(env, 'cons-a')).status, 404);
  assert.equal((await getAssignment(env, 'cons-b')).status, 200);
  assert.equal((await getAssignment(env, 'cons-case')).status, 200);
  assert.equal((await getAssignment(env, 'rea-1')).status, 200);
  assert.equal((await getAssignment(env, 'off-b')).status, 200);
  assert.equal((await getAssignment(env, 'off-b2')).status, 404); // officer not assigned
});

test('assignment list: no-firm consultant and unknown role are refused, not given everything', async () => {
  const { env } = await setup();
  for (const who of ['cons-null', 'cons-blank', 'mystery']) assert.equal((await listAssignments(env, who)).status, 403, who);
  const ids = async (who) => (await (await listAssignments(env, who)).json()).assignments.map((a) => a.id);
  assert.ok((await ids('cons-b')).includes('A-B'));
  assert.ok(!(await ids('cons-a')).includes('A-B'));
  assert.ok((await ids('rea-1')).includes('A-B'));
});

test('satellite history / verify / night-light: blank firm never matches blank project owner', async () => {
  const { env } = await setup();
  for (const who of ['cons-blank', 'cons-null', 'cons-a']) {
    assert.equal((await handleSatelliteVerificationHistory(req('/api/projects/P-BLANK/satellite-verification-history', who), env)).status, 403, 'history ' + who);
    assert.equal((await handleSatelliteVerify(req('/api/projects/P-BLANK/satellite-verify', who, 'POST', {}), env)).status, 403, 'verify ' + who);
    assert.equal((await handleNightLightImpact(req('/api/projects/P-BLANK/nightlight-impact', who), env)).status, 403, 'nightlight ' + who);
  }
});

test('satellite history / night-light: cross-firm denied, same firm (normalised) allowed', async () => {
  const { env } = await setup();
  assert.equal((await handleSatelliteVerificationHistory(req('/api/projects/P-B/satellite-verification-history', 'cons-a'), env)).status, 403);
  assert.equal((await handleNightLightImpact(req('/api/projects/P-B/nightlight-impact', 'cons-a'), env)).status, 403);
  assert.notEqual((await handleSatelliteVerificationHistory(req('/api/projects/P-B/satellite-verification-history', 'cons-case'), env)).status, 403);
  assert.notEqual((await handleNightLightImpact(req('/api/projects/P-B/nightlight-impact', 'cons-case'), env)).status, 403);
});

test('officer lifecycle: blank-firm officer cannot be suspended by a blank-firm consultant; real tenancy still works', async () => {
  const { db, env } = await setup();
  const patch = (who, id) => worker.fetch(req(`/api/field/users/field-officers/${id}/status`, who, 'PATCH', { status: 'Suspended' }), env);
  assert.equal((await patch('cons-blank', 'off-blank')).status, 403);
  assert.equal((await patch('cons-a', 'off-b')).status, 403);
  assert.equal(db.prepare("SELECT status s FROM users WHERE id='off-b'").get().s, 'active');
  assert.equal((await patch('cons-case', 'off-b')).status, 200); // own firm, differing case/space
  assert.equal(db.prepare("SELECT status s FROM users WHERE id='off-b'").get().s, 'suspended');
});
