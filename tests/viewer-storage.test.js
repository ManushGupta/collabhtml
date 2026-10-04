// Responsibility: example-host storage contract tests — load and apply through any adapter.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/comments.js');
const A = require('../src/anchors.js');
const S = require('../examples/viewer/storage.js');
const document = { id: 'report-1', revision: '2' };
const timestamp = '2026-10-03T10:00:00.000Z';
const start = (threadId, commentId, personName) => ({
  type: 'thread.started', thread: { threadId, anchor: A.create('Review this sentence.', 0, 6), status: 'open' },
  comment: { commentId, threadId, personId: `id-${personName}`, personName, timestamp, text: 'Check.' }
});

test('memory adapter applies operations and keeps documents separate', async () => {
  const store = S.createStore(S.memoryAdapter());
  assert.equal((await store.load(document)).threads.length, 0);
  const after = await store.apply(document, start('t1', 'c1', 'Manu'));
  assert.equal(after.comments.length, 1);
  assert.deepEqual(await store.load(document), after);
  assert.equal((await store.load({ ...document, revision: '3' })).threads.length, 0);
});
test('two people adding comments concurrently both persist', async () => {
  const store = S.createStore(S.memoryAdapter());
  await Promise.all([store.apply(document, start('t1', 'c1', 'Manu')), store.apply(document, start('t2', 'c2', 'Priya'))]);
  assert.deepEqual((await store.load(document)).comments.map(c => c.personName).sort(), ['Manu', 'Priya']);
});
test('store wrapper validates identity, size, and adapter output', async () => {
  const store = S.createStore(S.memoryAdapter(), { maxBytes: 50 });
  await assert.rejects(store.apply(document, start('t1', 'c1', 'Manu')), /size limit/);
  const wrong = S.createStore({ async load() { return C.empty('wrong'); }, async apply() { return C.empty('wrong'); } });
  await assert.rejects(wrong.load(document), /another document/);
  await assert.rejects(store.load({ id: '', revision: '1' }), /document ID/);
  assert.throws(() => S.createStore({ load() {} }), /load and apply/);
});
