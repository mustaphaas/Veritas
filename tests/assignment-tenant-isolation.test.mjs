// Behavioural regression test: drives the real handleFieldApi against a real SQLite
// engine loaded with the real 0001 migration. No source patching, no regex on source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleFieldApi } from '../worker/field-api.js';

const encoder = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (v) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(v)));

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
  db.exec(readFileSync(new URL('../migrations/0001_field_operations.sql', import.meta.url), 'utf8'));
  // rea_staff_accounts is joined by the session lookup
  db.exec('CREATE TABLE IF NOT EXISTS rea_staff_accounts (user_id TEXT PRIMARY KEY, staff_role TEXT, department TEXT, access_json TEXT, created_at TEXT)');
  const ts = new Date().toISOString();
  const user = db.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,'s','h','active',?)");
  user.run('admin-a', 'Admin A', 'a@a.ng', null, 'consultant_admin', 'Firm A Ltd', ts);
  user.run('admin-b', 'Admin B', 'b@b.ng', null, 'consultant_admin', 'Firm B Ltd', ts);
  user.run('admin-none', 'No Firm', 'n@n.ng', null, 'consultant_admin', null, ts);
  user.run('rea-1', 'REA Admin', 'r@rea.ng', null, 'rea_admin', null, ts);
  user.run('off-a', 'Officer A', 'oa@a.ng', null, 'field_officer', 'Firm A Ltd', ts);
  user.run('off-b', 'Officer B', 'ob@b.ng', null, 'field_officer', 'Firm B Ltd', ts);
  for (const [id, tok] of [['admin-a', 'tok-a'], ['admin-b', 'tok-b'], ['admin-none', 'tok-n'], ['rea-1', 'tok-r']]) {
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(await sha(tok), id, ts, new Date(Date.now() + 86400000).toISOString(), ts);
  }
  // Firm B's existing project + assignment, with an inspection in progress
  db.prepare("INSERT INTO projects(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at) VALUES('P-B1','B Mini-grid','NEP','Mini Grid','B Contractor','Firm B Ltd','Kano','Dala','Dala',12.0,8.5,250,?,?)").run(ts, ts);
  db.prepare("INSERT INTO assignments(id,project_id,officer_id,status,due_date,sync_revision,created_at,updated_at,report_json) VALUES('A-B1','P-B1','off-b','Draft','2026-12-01',1,?,?,'{\"secret\":\"firm-b-report\"}')").run(ts, ts);
  return { db, env: { DB: d1(db) } };
}

const call = (env, token, body) => handleFieldApi(new Request('https://x.test/api/field/assignments', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env);

const payload = (over = {}) => ({
  officerId: 'off-a', id: 'A-NEW', projectId: 'P-NEW', projectName: 'New Project', programme: 'NEP', component: 'Mini Grid',
  contractor: 'C', state: 'Kano', lga: 'Dala', community: 'Dala', latitude: 12.1, longitude: 8.6, dueDate: '2026-12-31', ...over,
});

test('consultant can create a new project + assignment for their own firm', async () => {
  const { db, env } = await setup();
  const res = await call(env, 'tok-a', payload());
  assert.equal(res.status, 201);
  assert.equal(db.prepare("SELECT consultant_firm f FROM projects WHERE id='P-NEW'").get().f, 'Firm A Ltd');
});

test('consultant CANNOT overwrite or steal another firm\'s project by reusing its id', async () => {
  const { db, env } = await setup();
  const res = await call(env, 'tok-a', payload({ id: 'A-HIJACK', projectId: 'P-B1', projectName: 'HIJACKED' }));
  assert.equal(res.status, 403);
  const p = db.prepare("SELECT name,consultant_firm f FROM projects WHERE id='P-B1'").get();
  assert.equal(p.name, 'B Mini-grid');
  assert.equal(p.f, 'Firm B Ltd');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM assignments WHERE id='A-HIJACK'").get().c, 0);
});

test('consultant CANNOT reassign another firm\'s assignment to their own officer', async () => {
  const { db, env } = await setup();
  const res = await call(env, 'tok-a', payload({ id: 'A-B1', projectId: 'P-B1' }));
  assert.equal(res.status, 403);
  assert.equal(db.prepare("SELECT officer_id o FROM assignments WHERE id='A-B1'").get().o, 'off-b');
});

test('an assignment id cannot be re-pointed at a different project', async () => {
  const { db, env } = await setup();
  assert.equal((await call(env, 'tok-a', payload())).status, 201);
  const res = await call(env, 'tok-a', payload({ projectId: 'P-OTHER' })); // same assignment id, new project
  assert.equal(res.status, 409);
  assert.equal(db.prepare("SELECT project_id p FROM assignments WHERE id='A-NEW'").get().p, 'P-NEW');
});

test('consultant re-saving their own assignment still works (due date update)', async () => {
  const { db, env } = await setup();
  await call(env, 'tok-a', payload());
  const res = await call(env, 'tok-a', payload({ dueDate: '2027-01-15' }));
  assert.equal(res.status, 201);
  assert.equal(db.prepare("SELECT due_date d FROM assignments WHERE id='A-NEW'").get().d, '2027-01-15');
});

test('firm matching is normalised (case/whitespace) but never matches empty', async () => {
  const { db, env } = await setup();
  db.prepare("UPDATE users SET consultant_firm='  firm a ltd ' WHERE id='off-a'").run();
  assert.equal((await call(env, 'tok-a', payload())).status, 201);
  const res = await call(env, 'tok-n', payload({ id: 'A-X', projectId: 'P-X' })); // consultant with NULL firm
  assert.equal(res.status, 403);
});

test('REA admin keeps access, and cannot silently re-own an existing project', async () => {
  const { db, env } = await setup();
  const res = await call(env, 'tok-r', payload({ id: 'A-R1', projectId: 'P-B1', officerId: 'off-b', consultantFirm: 'Firm A Ltd' }));
  assert.equal(res.status, 201);
  assert.equal(db.prepare("SELECT consultant_firm f FROM projects WHERE id='P-B1'").get().f, 'Firm B Ltd');
});
