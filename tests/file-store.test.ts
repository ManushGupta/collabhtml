// Responsibility: example-server file durability, operation API, and origin-check tests.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from '../examples/viewer/file-store.js';
import { createServer } from '../examples/viewer/server.js';
import storageApi from '../examples/viewer/storage.cjs';
const { createStore, httpAdapter } = storageApi;
import * as A from '../src/anchors.js';
const identity = { id: '../../report', revision: '1' };
const timestamp = '2026-10-03T10:00:00.000Z';
const start = (threadId, commentId) => ({
  type: 'thread.started', thread: { threadId, anchor: A.create('Check the report.', 0, 5), status: 'open' },
  comment: { commentId, threadId, personId: 'person-1', personName: 'Manu', timestamp, text: 'Verify this.' }
});
function directory(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), 'collabhtml-test-'));
  t.after(() => fs.rmSync(result, { recursive: true, force: true }));
  return result;
}
test('file store applies operations, persists across instances, and uses safe filenames', t => {
  const folder = directory(t); const store = createFileStore(folder);
  const next = store.apply(identity, start('t1', 'c1'));
  assert.deepEqual(createFileStore(folder).load(identity), next);
  const files = fs.readdirSync(folder);
  assert.equal(files.length, 1); assert.match(files[0], /^[a-f0-9]{64}\.json$/);
  assert.throws(() => store.apply(identity, start('t2', 'c1')), /Duplicate commentId/);
  assert.deepEqual(store.load(identity), next);
});
test('file store rejects invalid identities and oversized state', t => {
  const folder = directory(t);
  assert.throws(() => createFileStore(folder, 100).apply(identity, start('t1', 'c1')), /size limit/);
  assert.throws(() => createFileStore(folder).load({ id: '', revision: '1' }), /document ID/);
  assert.equal(fs.readdirSync(folder).length, 0);
});
test('HTTP API applies operations from two clients and enforces origin checks', async t => {
  const folder = directory(t);
  const server = createServer({ storageDirectory: folder });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchWithOrigin = (url, options) => fetch(url, { ...options, headers: { ...options?.headers, Origin: origin } });
  const first = createStore(httpAdapter(`${origin}/api/comments`, fetchWithOrigin));
  const second = createStore(httpAdapter(`${origin}/api/comments`, fetchWithOrigin));
  await first.apply(identity, start('t1', 'c1'));
  const latest = await second.apply(identity, start('t2', 'c2'));
  assert.deepEqual(latest.threads.map(thread => thread.threadId), ['t1', 't2']);
  assert.deepEqual(await first.load(identity), latest);
  assert.deepEqual(createFileStore(folder).load(identity), latest);
  await assert.rejects(first.apply(identity, start('t3', 'c1')), /Duplicate commentId/);
  const blocked = await fetch(`${origin}/api/comments`, { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(blocked.status, 403);
  const noOrigin = await fetch(`${origin}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noOrigin.status, 403);
});
