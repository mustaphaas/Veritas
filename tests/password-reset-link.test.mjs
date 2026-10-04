// End-to-end regression for the broken password-reset link (escaped `\${...}` placeholders made the
// emailed link read "${baseUrl}/reset-password?token=${...}" literally). Real worker + real SQLite + real
// migrations; only the outbound email relay (global fetch) is stubbed so the email can be read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';

const enc = new TextEncoder();
const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8');
const sha = async (v) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)))].map((x) => x.toString(16).padStart(2, '0')).join('');

function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: (sql) => wrap(sql),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}

const NAME = 'Aisha <b>"Admin"</b>';
const EMAIL = 'aisha@test.ng';

async function setup() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0001_field_operations.sql', '0008_rea_staff_accounts.sql', '0009_password_reset_tokens.sql']) db.exec(mig(m));
  const ts = new Date().toISOString();
  db.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES('u1',?,?,?,'consultant_admin','Firm A Ltd','00','00','active',?)").run(NAME, EMAIL, null, ts);
  db.prepare("INSERT INTO users(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at) VALUES('rea-1','REA','rea@test.ng',null,'rea_admin',null,'00','00','active',?)").run(ts);
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(await sha('tok-rea'), 'rea-1', ts, new Date(Date.now() + 86400000).toISOString(), ts);
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://relay.test/send') { sent.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    return realFetch(url, init);
  };
  const env = { DB: d1(db), APP_BASE_URL: 'https://app.test/', GMAIL_RELAY_URL: 'https://relay.test/send', GMAIL_RELAY_SECRET: 's3cret' };
  return { db, env, sent, restore: () => { globalThis.fetch = realFetch; } };
}

const post = (env, path, body, headers = {}) => worker.fetch(new Request('https://app.test' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
}), env);

const linkFrom = (html) => [...html.matchAll(/https:\/\/app\.test\/reset-password\?token=([A-Za-z0-9_-]+)/g)].map((m) => ({ url: m[0], token: m[1] }));

test('reset email contains a real, working link (no unexpanded placeholders)', async () => {
  const { env, sent, restore } = await setup();
  try {
    const res = await post(env, '/api/auth/forgot-password', { email: EMAIL });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, EMAIL);
    const html = sent[0].html;
    assert.ok(!html.includes('${'), 'email must not contain literal ${...} placeholders');
    const links = linkFrom(html);
    assert.equal(links.length, 2, 'button href and the visible fallback link');
    assert.equal(links[0].url, links[1].url);
    assert.ok(html.includes(`href="${links[0].url}"`));
    assert.ok(links[0].token.length >= 32, 'token is a real random secret');
  } finally { restore(); }
});

test('recipient name is HTML-escaped in the email body', async () => {
  const { env, sent, restore } = await setup();
  try {
    await post(env, '/api/auth/forgot-password', { email: EMAIL });
    const html = sent[0].html;
    assert.ok(html.includes('Hello Aisha &lt;b&gt;&quot;Admin&quot;&lt;/b&gt;,'), html.slice(html.indexOf('Hello'), html.indexOf('Hello') + 80));
    assert.ok(!html.includes('<b>"Admin"</b>'));
  } finally { restore(); }
});

test('the emailed link actually resets the password; it is single-use', async () => {
  const { db, env, sent, restore } = await setup();
  try {
    await post(env, '/api/auth/forgot-password', { email: EMAIL });
    const { token } = linkFrom(sent[0].html)[0];

    const reset = await post(env, '/api/auth/reset-password', { token, password: 'a-brand-new-pass' });
    assert.equal(reset.status, 200);
    assert.ok(db.prepare("SELECT used_at FROM password_reset_tokens WHERE user_id='u1'").get().used_at);

    const login = await post(env, '/api/field/auth/login', { identifier: EMAIL, password: 'a-brand-new-pass' });
    assert.equal(login.status, 200, 'user can sign in with the new password');
    assert.equal((await post(env, '/api/field/auth/login', { identifier: EMAIL, password: 'wrong-password' })).status, 401);

    const reuse = await post(env, '/api/auth/reset-password', { token, password: 'another-password-1' });
    assert.equal(reuse.status, 400, 'a used link cannot be replayed');
  } finally { restore(); }
});

test('admin-triggered reset email uses the real recipient in the confirmation and a real link', async () => {
  const { env, sent, restore } = await setup();
  try {
    const res = await post(env, '/api/rea/users/u1/password-reset', {}, { Authorization: 'Bearer tok-rea' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.message, `Password reset email sent to ${EMAIL}.`);
    assert.equal(sent.length, 1);
    assert.equal(linkFrom(sent[0].html).length, 2);
  } finally { restore(); }
});

test('unknown email: same response, no email sent (no account enumeration)', async () => {
  const { env, sent, restore } = await setup();
  try {
    const res = await post(env, '/api/auth/forgot-password', { email: 'nobody@test.ng' });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 0);
  } finally { restore(); }
});
