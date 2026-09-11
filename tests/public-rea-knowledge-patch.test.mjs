import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

test('public REA knowledge patch script is valid JavaScript', () => {
  const result = spawnSync(process.execPath, ['--check', 'scripts/patch-veritas-public-rea-knowledge.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('public REA knowledge patch contains the official REA team source and current MD', () => {
  const source = fs.readFileSync('scripts/patch-veritas-public-rea-knowledge.mjs', 'utf8');
  assert.match(source, /https:\/\/rea\.gov\.ng\/meet-the-team\.html/);
  assert.match(source, /Abba Abubakar Aliyu/);
  assert.match(source, /Managing Director\/Chief Executive Officer/);
});
