// Responsibility: CLI tests — wrap makes a self-contained commentable copy.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cli = path.join(import.meta.dirname, '..', 'dist', 'cli.cjs');
const inputHtml = '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="report"><p>Hello world.</p></main></body></html>';

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collabhtml-cli-'));
  const input = path.join(dir, 'report.html');
  fs.writeFileSync(input, inputHtml);
  return { dir, input };
}

function run(args, dir) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
}

test('wrap creates a .collab.html file with the runtime embedded', () => {
  const { dir, input } = sandbox();
  const result = run([input], dir);
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(dir, 'report.collab.html');
  assert.ok(fs.existsSync(output));
  const html = fs.readFileSync(output, 'utf8');
  assert.ok(html.includes('data-collabhtml-runtime'), 'missing runtime marker');
  assert.ok(html.includes('data-collabhtml-bootstrap'), 'missing bootstrap marker');
  assert.ok(html.includes('Hello world.'), 'original content lost');
});

test('--out controls the output path', () => {
  const { dir, input } = sandbox();
  const output = path.join(dir, 'custom.html');
  const result = run([input, '--out', output], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(output));
});

test('a missing input file fails clearly', () => {
  const { dir } = sandbox();
  const result = run([path.join(dir, 'nope.html')], dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not found/i);
});

test('--help exits successfully', () => {
  const { dir } = sandbox();
  const result = run(['--help'], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commentable/i);
});
