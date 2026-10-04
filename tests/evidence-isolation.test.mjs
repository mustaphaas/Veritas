// Behavioural regression test for finding 3: evidence records must be isolated per assignment.
// Real handleFieldApi + real SQLite + real migrations + an in-memory R2 stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleFieldApi } from '../worker/field-api.js';

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (v) => hex(await crypto.subtle.digest('SHA-256', typeof v === 'string' ? enc.encode(v) : v));
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
  db.exec(mig('0001_field_operations.sql'));
  db.exec(mig('0008_rea_staff_accounts.sql'));
  const ts = new Date().toISOString();
  const u = db.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES(?,?,?,?,?,?,'s','h','active',?)");
  u.run('off-a', 'Officer A', 'oa@a.ng', null, 'field_officer', 'Firm A Ltd', ts);
  u.run('off-b', 'Officer B', 'ob@b.ng', null, 'field_officer', 'Firm B Ltd', ts);
  for (const id of ['off-a', 'off-b']) {
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(await sha('tok-' + id), id, ts, new Date(Date.now() + 86400000).toISOString(), ts);
  }
  const p = db.prepare("INSERT INTO projects(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at) VALUES(?,?,?,?,?,?,'Kano','Dala','Dala',12,8.5,250,?,?)");
  p.run('P-A', 'A Project', 'NEP', 'Mini Grid', 'C', 'Firm A Ltd', ts, ts);
  p.run('P-B', 'B Project', 'NEP', 'Mini Grid', 'C', 'Firm B Ltd', ts, ts);
  const a = db.prepare("INSERT INTO assignments(id,project_id,officer_id,status,due_date,arrival_json,sync_revision,created_at,updated_at) VALUES(?,?,?, 'Draft','2026-12-01','{\"verified\":true}',1,?,?)");
  a.run('A-1', 'P-A', 'off-a', ts, ts);
  a.run('A-2', 'P-B', 'off-b', ts, ts);
  const objects = new Map();
  const EVIDENCE = { put: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); } };
  return { db, objects, env: { DB: d1(db), EVIDENCE } };
}

async function upload(env, who, assignmentId, evidenceId, content, { metadata = { type: 'photo', capturedAt: '2026-10-04T10:00:00.000Z' }, rawMetadata } = {}) {
  const bytes = enc.encode(content);
  return handleFieldApi(new Request(`https://x.test/api/field/assignments/${assignmentId}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer tok-${who}`, 'Content-Type': 'image/jpeg',
      'X-Content-SHA256': await sha(bytes),
      'X-Veritas-Metadata': rawMetadata ?? encodeURIComponent(JSON.stringify(metadata)),
    },
    body: bytes,
  }), env);
}
const rows = (db, assignmentId) => db.prepare('SELECT id,sha256,assignment_id FROM evidence WHERE assignment_id=? ORDER BY id').all(assignmentId);

test('normal upload is stored for the officer\'s own assignment', async () => {
  const { db, objects, env } = await setup();
  const res = await upload(env, 'off-a', 'A-1', 'EV1', 'photo-bytes-A');
  assert.equal(res.status, 201);
  assert.equal(rows(db, 'A-1').length, 1);
  assert.equal(rows(db, 'A-1')[0].sha256, await sha('photo-bytes-A'));
  assert.ok(objects.has('assignments/A-1/EV1'));
});

test('reusing another assignment\'s evidence id does NOT replace that record', async () => {
  const { db, objects, env } = await setup();
  assert.equal((await upload(env, 'off-a', 'A-1', 'EV1', 'original-evidence-A')).status, 201);
  const before = rows(db, 'A-1');
  const originalSha = before[0].sha256;

  // Officer B (different firm) uploads using the SAME client evidence id on their own assignment.
  assert.equal((await upload(env, 'off-b', 'A-2', 'EV1', 'different-bytes-B')).status, 201);

  const after = rows(db, 'A-1');
  assert.equal(after.length, 1, 'A-1 must still have its evidence row');
  assert.equal(after[0].sha256, originalSha, 'A-1 evidence hash must be unchanged');
  assert.equal(after[0].assignment_id, 'A-1');
  assert.equal(rows(db, 'A-2').length, 1, 'B gets their own separate record');
  assert.notEqual(rows(db, 'A-2')[0].sha256, originalSha);
  assert.equal(new TextDecoder().decode(objects.get('assignments/A-1/EV1')), 'original-evidence-A');
  assert.equal(new TextDecoder().decode(objects.get('assignments/A-2/EV1')), 'different-bytes-B');
});

test('same officer re-uploading the same id is idempotent (retry), not duplicated', async () => {
  const { db, env } = await setup();
  await upload(env, 'off-a', 'A-1', 'EV1', 'first-attempt');
  const res = await upload(env, 'off-a', 'A-1', 'EV1', 'second-attempt');
  assert.equal(res.status, 201);
  const r = rows(db, 'A-1');
  assert.equal(r.length, 1);
  assert.equal(r[0].sha256, await sha('second-attempt'));
});

test('legacy rows (bare client id): own re-upload updates in place, other assignment cannot touch it', async () => {
  const { db, env } = await setup();
  const ts = new Date().toISOString();
  db.prepare("INSERT INTO evidence(id,assignment_id,r2_key,media_type,content_type,size_bytes,sha256,metadata_json,captured_at,uploaded_at) VALUES('LEG','A-1','assignments/A-1/LEG','photo','image/jpeg',3,'legacyhash','{}',?,?)").run(ts, ts);

  assert.equal((await upload(env, 'off-b', 'A-2', 'LEG', 'attacker-bytes')).status, 201);
  const legacy = db.prepare("SELECT assignment_id,sha256 FROM evidence WHERE id='LEG'").get();
  assert.equal(legacy.assignment_id, 'A-1');
  assert.equal(legacy.sha256, 'legacyhash');

  assert.equal((await upload(env, 'off-a', 'A-1', 'LEG', 'owner-retry')).status, 201);
  assert.equal(rows(db, 'A-1').length, 1, 'no duplicate row for the owner');
  assert.equal(db.prepare("SELECT sha256 FROM evidence WHERE id='LEG'").get().sha256, await sha('owner-retry'));
});

test('timestamp-style ids used by the web client still work', async () => {
  const { env } = await setup();
  assert.equal((await upload(env, 'off-a', 'A-1', '2026-10-04T10:00:00.000Z-0', 'x')).status, 201);
});

test('path-like or oversized evidence ids are rejected', async () => {
  const { env } = await setup();
  assert.equal((await upload(env, 'off-a', 'A-1', '../A-2/EV1', 'x')).status, 400);
  assert.equal((await upload(env, 'off-a', 'A-1', 'a\\b', 'x')).status, 400);
  assert.equal((await upload(env, 'off-a', 'A-1', 'x'.repeat(201), 'x')).status, 400);
});

test('malformed metadata header returns 400, not a 500', async () => {
  const { env } = await setup();
  assert.equal((await upload(env, 'off-a', 'A-1', 'EV1', 'x', { rawMetadata: encodeURIComponent('{not json') })).status, 400);
  assert.equal((await upload(env, 'off-a', 'A-1', 'EV2', 'x', { rawMetadata: encodeURIComponent('[1,2]') })).status, 400);
});
