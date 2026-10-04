// Responsibility: Comment API tests — threads, follow-ups, operations, validation, serialization.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/comments.js';
import * as A from '../src/anchors.js';
const timestamp = '2026-10-03T10:00:00.000Z';
const anchor = A.create('The report says revenue increased 12 percent this quarter.', 16, 43);
const manu = { personId: 'person-1', personName: 'Manu' };
const priya = { personId: 'person-2', personName: 'Priya' };
const initial = () => C.empty('report-42', '3');
const started = () => C.startThread(initial(), { threadId: 't1', anchor, commentId: 'c1', ...manu, timestamp, text: 'Check the figure.' });

test('a thread starts with one comment; follow-ups share its threadId', () => {
  const original = initial();
  const one = C.startThread(original, { threadId: 't1', anchor, commentId: 'c1', ...manu, timestamp, text: 'Check the figure.' });
  const two = C.addComment(one, { threadId: 't1', commentId: 'c2', ...priya, timestamp, text: 'Confirmed.' });
  assert.equal(original.threads.length, 0);
  assert.deepEqual(two.threads, [{ threadId: 't1', anchor, status: 'open' }]);
  assert.deepEqual(two.comments.map(c => [c.commentId, c.threadId, c.personId, c.personName]), [['c1', 't1', 'person-1', 'Manu'], ['c2', 't1', 'person-2', 'Priya']]);
  assert.deepEqual(C.commentsFor(two, 't1').map(c => c.text), ['Check the figure.', 'Confirmed.']);
  assert.equal(C.setStatus(two, { threadId: 't1', status: 'resolved', ...priya, timestamp }).threads[0].status, 'resolved');
  assert.equal(two.threads[0].status, 'open');
});
test('operations rebuild the same state as direct calls', () => {
  const operations = [
    { type: 'thread.started', thread: { threadId: 't1', anchor, status: 'open' }, comment: { commentId: 'c1', threadId: 't1', ...manu, timestamp, text: 'Check the figure.' } },
    { type: 'comment.added', comment: { commentId: 'c2', threadId: 't1', ...priya, timestamp, text: 'Confirmed.' } },
    { type: 'thread.status', threadId: 't1', status: 'resolved', ...priya, timestamp }
  ];
  const rebuilt = operations.reduce(C.apply, initial());
  const direct = C.setStatus(C.addComment(started(), { threadId: 't1', commentId: 'c2', ...priya, timestamp, text: 'Confirmed.' }), { threadId: 't1', status: 'resolved', ...priya, timestamp });
  assert.deepEqual(rebuilt, direct);
});
test('every comment requires commentId, threadId, personId, personName, timestamp and text', () => {
  const base = { threadId: 't1', commentId: 'c2', ...priya, timestamp, text: 'Reply' };
  for (const [field, pattern] of [['commentId', /commentId/], ['personId', /personId/], ['personName', /personName/], ['timestamp', /timestamp/], ['text', /comment text/]]) {
    assert.throws(() => C.addComment(started(), { ...base, [field]: undefined }), pattern);
  }
  assert.throws(() => C.addComment(started(), { ...base, threadId: 'missing' }), /Thread not found/);
  assert.throws(() => C.addComment(started(), { ...base, timestamp: 'not a date' }), /timestamp/);
});
test('invalid operations and structures are rejected', () => {
  assert.throws(() => C.addComment(started(), { threadId: 't1', commentId: 'c1', ...priya, timestamp, text: 'Duplicate' }), /Duplicate commentId/);
  assert.throws(() => C.startThread(started(), { threadId: 't1', anchor, commentId: 'c9', ...manu, timestamp, text: 'Again' }), /Duplicate threadId/);
  assert.throws(() => C.setStatus(started(), { threadId: 't1', status: 'deleted', ...priya, timestamp }), /status/);
  assert.throws(() => C.apply(started(), { type: 'comment.archived' }), /Unknown operation/);
  assert.throws(() => C.apply(initial(), { type: 'thread.started', thread: { threadId: 't2', anchor, status: 'open' }, comment: { commentId: 'c9', threadId: 'other', ...manu, timestamp, text: 'x' } }), /new threadId/);
  assert.throws(() => C.validate({ ...initial(), threads: [{ threadId: 't1', anchor, status: 'open' }] }), /at least one comment/);
  assert.throws(() => C.validate({ ...initial(), schemaVersion: 1 }), /Invalid comments state/);
  assert.throws(() => C.validatePerson({ personId: 'p1' }), /personName/);
});
test('serialization is safe to embed and round-trips hostile text', () => {
  const state = C.addComment(started(), { threadId: 't1', commentId: 'c2', personId: 'p<3', personName: '<img>', timestamp, text: '</script><script>alert("x")</script>\u2028' });
  const serialized = C.serialize(state);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), state);
});
test('new IDs are distinct UUIDs', () => {
  const first = C.createId(); const second = C.createId();
  assert.notEqual(first, second); assert.match(first, /^[a-f0-9-]{36}$/);
});

const actor = { ...priya, timestamp };
test('every operation after a comment carries who and when', () => {
  const missing = ['personId', 'personName', 'timestamp'];
  const operations = [
    { type: 'thread.status', threadId: 't1', status: 'resolved' },
    { type: 'reaction.toggled', commentId: 'c1', key: '👍' },
    { type: 'comment.edited', commentId: 'c1', text: 'New text' },
    { type: 'comment.deleted', commentId: 'c1' },
    { type: 'thread.metadata', threadId: 't1', metadata: { a: 1 } },
    { type: 'comment.metadata', commentId: 'c1', metadata: { a: 1 } }
  ];
  for (const operation of operations) {
    assert.doesNotThrow(() => C.apply(started(), { ...operation, ...actor }), operation.type);
    for (const field of missing) assert.throws(() => C.apply(started(), { ...operation, ...actor, [field]: undefined }), new RegExp(field === 'timestamp' ? 'timestamp' : field), `${operation.type} without ${field}`);
  }
  const resolved = C.apply(started(), { type: 'thread.status', threadId: 't1', status: 'resolved', ...actor });
  assert.deepEqual(resolved.threads[0].statusChange, actor);
});
test('reactions toggle per person and share one operation for upvotes and emoji', () => {
  const react = (state, who, key) => C.apply(state, { type: 'reaction.toggled', commentId: 'c1', key, ...who, timestamp });
  let state = react(started(), priya, 'upvote');
  state = react(state, manu, 'upvote'); state = react(state, priya, '🎉');
  assert.deepEqual(state.comments[0].reactions, { upvote: ['person-2', 'person-1'], '🎉': ['person-2'] });
  state = react(state, priya, 'upvote');
  assert.deepEqual(state.comments[0].reactions.upvote, ['person-1']);
  state = react(react(state, manu, 'upvote'), priya, '🎉');
  assert.equal(state.comments[0].reactions, undefined);
  assert.throws(() => react(started(), priya, '__proto__'), /reaction key/);
});
test('edit keeps history markers; delete keeps a tombstone and blocks later changes', () => {
  const edited = C.apply(started(), { type: 'comment.edited', commentId: 'c1', text: 'Updated.', ...actor });
  assert.equal(edited.comments[0].text, 'Updated.'); assert.deepEqual(edited.comments[0].edited, actor);
  assert.throws(() => C.apply(started(), { type: 'comment.edited', commentId: 'c1', text: '  ', ...actor }), /comment text/);
  const reacted = C.apply(edited, { type: 'reaction.toggled', commentId: 'c1', key: '👍', ...actor });
  const deleted = C.apply(reacted, { type: 'comment.deleted', commentId: 'c1', ...actor });
  assert.equal(deleted.comments[0].text, ''); assert.deepEqual(deleted.comments[0].deleted, actor);
  assert.equal(deleted.comments[0].reactions, undefined);
  assert.equal(deleted.threads.length, 1);
  for (const operation of [{ type: 'comment.edited', text: 'x' }, { type: 'comment.deleted' }, { type: 'reaction.toggled', key: '👍' }, { type: 'comment.metadata', metadata: { a: 1 } }]) {
    assert.throws(() => C.apply(deleted, { ...operation, commentId: 'c1', ...actor }), /deleted/, operation.type);
  }
  assert.deepEqual(C.validate(deleted), deleted);
});
test('metadata is patched, never interpreted, and bounded', () => {
  let state = C.apply(started(), { type: 'thread.metadata', threadId: 't1', metadata: { actionItem: true, owner: 'u-9' }, ...actor });
  assert.deepEqual(state.threads[0].metadata, { actionItem: true, owner: 'u-9' });
  state = C.apply(state, { type: 'thread.metadata', threadId: 't1', metadata: { owner: null }, ...actor });
  assert.deepEqual(state.threads[0].metadata, { actionItem: true });
  state = C.apply(state, { type: 'thread.metadata', threadId: 't1', metadata: { actionItem: null }, ...actor });
  assert.equal(state.threads[0].metadata, undefined);
  const withComment = C.apply(started(), { type: 'comment.metadata', commentId: 'c1', metadata: { flag: 'x' }, ...actor });
  assert.deepEqual(withComment.comments[0].metadata, { flag: 'x' });
  assert.throws(() => C.apply(started(), { type: 'thread.metadata', threadId: 't1', metadata: JSON.parse('{"__proto__":{"x":1}}'), ...actor }), /metadata key/);
  assert.throws(() => C.apply(started(), { type: 'thread.metadata', threadId: 't1', metadata: { big: 'x'.repeat(10001) }, ...actor }), /metadata/);
  assert.throws(() => C.apply(started(), { type: 'thread.metadata', threadId: 'missing', metadata: { a: 1 }, ...actor }), /Thread not found/);
  assert.throws(() => C.apply(started(), { type: 'thread.metadata', threadId: 't1', metadata: ['a'], ...actor }), /metadata/);
});

test('reanchor moves the anchor and records history with actor', () => {
  const moved = C.apply(started(), {
    type: 'thread.reanchor', threadId: 't1',
    anchor: [{ type: 'TextQuoteSelector', exact: 'new words' }],
    ...actor
  });
  assert.equal(moved.threads[0].anchor[0].exact, 'new words');
  assert.equal(moved.threads[0].anchorHistory.length, 1);
  assert.equal(moved.threads[0].anchorHistory[0].anchor[0].exact, anchor[0].exact);
  assert.deepEqual(moved.threads[0].anchorHistory[0].personId, 'person-2');
  assert.throws(() => C.apply(started(), { type: 'thread.reanchor', threadId: 't1', anchor: [], ...actor }), /Invalid anchor/);
  assert.throws(() => C.apply(started(), { type: 'thread.reanchor', threadId: 'missing', anchor: [{ type: 'TextQuoteSelector', exact: 'x' }], ...actor }), /Thread not found/);
});

test('a follow-up on a resolved thread reopens it with the commenter recorded', () => {
  const resolved = C.setStatus(started(), { threadId: 't1', status: 'resolved', ...priya, timestamp });
  assert.equal(resolved.threads[0].status, 'resolved');
  const reopened = C.addComment(resolved, { threadId: 't1', commentId: 'c2', ...manu, timestamp, text: 'One more thing.' });
  assert.equal(reopened.threads[0].status, 'open');
  assert.deepEqual(reopened.threads[0].statusChange, { ...manu, timestamp });
  assert.equal(reopened.comments.length, 2);
});
