import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../worker/entry.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/rea-user-actions.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../client/lib/field-api.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../client/components/ReaUserManagement.tsx', import.meta.url), 'utf8');

test('worker exposes authenticated REA user lifecycle and password reset routes', () => {
  assert.match(entry, /handleReaUserActions/);
  assert.match(worker, /\/api\/rea\/users\/\[\^\/\]\+\/status/);
  assert.match(worker, /\/api\/rea\/users\/\[\^\/\]\+\/reset-password/);
  assert.match(worker, /user\.role\s*!==\s*["']rea_admin["']/);
  assert.match(worker, /Cannot manage your own account|own account/i);
  assert.match(worker, /user-(?:suspended|reactivated|password-reset|deleted)/);
  assert.match(worker, /historical assignments/i);
  assert.match(worker, /DELETE FROM sessions WHERE user_id=\?/);
});

test('client API provides D1-backed lifecycle calls', () => {
  assert.match(api, /updateReaPortalUserStatus/);
  assert.match(api, /resetReaPortalUserPassword/);
  assert.match(api, /deleteReaPortalUser/);
});

test('users UI provides compact icon actions with destructive confirmation', () => {
  assert.match(ui, /PauseCircle|UserRoundCheck|KeyRound|Trash2/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /Reset password/i);
  assert.match(ui, /Actions/);
});
