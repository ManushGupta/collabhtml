// Responsibility: CLI tests — wrap, extract, reply, and resolve.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { empty, startThread } from '../src/comments.js';
import { embedState, extractState } from '../src/brief.js';

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

function reviewFile(dir) {
  const t = '2026-10-04T20:00:00.000Z';
  let state = empty('doc-1', '2');
  state = startThread(state, {
    threadId: 't1',
    anchor: [{ type: 'TextQuoteSelector', exact: 'Hello world.' }],
    commentId: 'c1', personId: 'u-1', personName: 'Priya', timestamp: t, text: 'Check this.'
  });
  const file = path.join(dir, 'review.collab.html');
  const marker = '<script type="application/json" data-collabhtml-comments=""></script>';
  fs.writeFileSync(file, embedState(inputHtml.replace('</body>', `${marker}</body>`), state));
  return file;
}

test('extract prints the brief as markdown', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  const result = run(['extract', file], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /## Thread t1 — open/);
  assert.match(result.stdout, /Priya.*Check this\./);
});

test('extract --format json prints parseable state', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  const result = run(['extract', file, '--format', 'json'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).threads.length, 1);
});

test('reply appends a comment; resolve closes the thread', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  let result = run(['reply', file, '--thread', 't1', '--name', 'Agent', '--text', 'Fixed in revision 2.'], dir);
  assert.equal(result.status, 0, result.stderr);
  result = run(['resolve', file, '--thread', 't1', '--name', 'Agent', '--text', 'Verified.'], dir);
  assert.equal(result.status, 0, result.stderr);
  const state = extractState(fs.readFileSync(file, 'utf8'));
  assert.equal(state.comments.length, 3);
  assert.equal(state.threads[0].status, 'resolved');
  assert.equal(state.threads[0].statusChange.personName, 'Agent');
});

test('agent identity is stable across invocations without --id', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  let result = run(['reply', file, '--thread', 't1', '--name', 'Agent', '--text', 'One.'], dir);
  assert.equal(result.status, 0, result.stderr);
  result = run(['reply', file, '--thread', 't1', '--name', 'Agent', '--text', 'Two.'], dir);
  assert.equal(result.status, 0, result.stderr);
  const people = extractState(fs.readFileSync(file, 'utf8')).comments
    .filter(comment => comment.personName === 'Agent')
    .map(comment => comment.personId);
  assert.deepEqual([...new Set(people)], ['agent:agent']);
});

test('reply requires thread, name, and text', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  assert.notEqual(run(['reply', file, '--thread', 't1', '--name', 'Agent'], dir).status, 0);
  assert.notEqual(run(['reply', file], dir).status, 0);
});

test('reopen flips a resolved thread back to open', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  let result = run(['resolve', file, '--thread', 't1', '--name', 'Agent'], dir);
  assert.equal(result.status, 0, result.stderr);
  result = run(['reopen', file, '--thread', 't1', '--name', 'Priya', '--text', 'One more check.'], dir);
  assert.equal(result.status, 0, result.stderr);
  const state = extractState(fs.readFileSync(file, 'utf8'));
  assert.equal(state.threads[0].status, 'open');
  assert.equal(state.threads[0].statusChange.personName, 'Priya');
});

test('skill prints the bundled skill file', () => {
  const { dir } = sandbox();
  const result = run(['skill'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /name: collabhtml-review/);
  assert.match(result.stdout, /collabhtml extract/);
});

test('skill --out writes the file', () => {
  const { dir } = sandbox();
  const out = path.join(dir, 'SKILL.md');
  const result = run(['skill', '--out', out], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /name: collabhtml-review/);
});

test('thread starts a new anchored thread and prints its id', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  const result = run(['thread', file, '--exact', 'Hello world.', '--name', 'Agent', '--text', 'Flagging this.'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created thread \S+\./);
  const state = extractState(fs.readFileSync(file, 'utf8'));
  assert.equal(state.threads.length, 2);
  const added = state.threads[1];
  assert.equal(added.anchor[0].exact, 'Hello world.');
  assert.equal(state.comments.at(-1).text, 'Flagging this.');
});

test('thread warns when the quote is absent from the file', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  const result = run(['thread', file, '--exact', 'no such text', '--name', 'Agent', '--text', 'x'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Unplaced/);
});

test('reanchor moves the thread and keeps history', () => {
  const { dir } = sandbox();
  const file = reviewFile(dir);
  const result = run(['reanchor', file, '--thread', 't1', '--exact', 'Hello world.', '--name', 'Agent'], dir);
  assert.equal(result.status, 0, result.stderr);
  const state = extractState(fs.readFileSync(file, 'utf8'));
  assert.equal(state.threads[0].anchorHistory.length, 1);
  assert.equal(state.threads[0].anchorHistory[0].personName, 'Agent');
});
