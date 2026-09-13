import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../migrations/0003_claims.sql', import.meta.url);

test('claims migration defines persistent claims, events, allocation indexes and demo rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS claims/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS claim_events/i);
  assert.match(sql, /consultant_id/i);
  assert.match(sql, /consultant_firm/i);
  assert.match(sql, /source_reference/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_claims_consultant/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_claims_status/i);
  assert.match(sql, /INSERT OR IGNORE INTO claims/i);
  assert.match(sql, /demo/i);
  assert.match(sql, /Unassigned/i);
});

test('claims migration protects source idempotency', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /UNIQUE\s*\(source,\s*source_reference\)/i);
});
