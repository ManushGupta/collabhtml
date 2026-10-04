// Responsibility: brief tests — markdown shape, state extraction, and embedding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empty, startThread, addComment, setStatus } from '../src/comments.js';
import { embedState, extractState, toMarkdown } from '../src/brief.js';

const t = '2026-10-04T20:00:00.000Z';
const anchor = [
  { type: 'TextQuoteSelector', exact: 'revenue increased', prefix: 'Says ', suffix: ' here.' },
  { type: 'TextPositionSelector', start: 5, end: 23 }
];

function oneThread() {
  let s = empty('doc-1', '2');
  s = startThread(s, {
    threadId: 't1', anchor, commentId: 'c1',
    personId: 'u-1', personName: 'Priya', timestamp: t, text: 'Check the figure.'
  });
  return s;
}

function shell(state) {
  return '<!doctype html><html><body><main><p>Says revenue increased here.</p></main></body></html>';
}

function shellWithMarker() {
  const emptyState = JSON.stringify({ schemaVersion: 3, document: { id: 'doc-1', revision: '2' }, threads: [], comments: [] });
  return shell(oneThread()).replace('</body>', `<script type="application/json" data-collabhtml-comments="">${emptyState}</script></body>`);
}

test('markdown names the document, thread, quote, offsets, and comments', () => {
  const md = toMarkdown(oneThread());
  assert.match(md, /Document: doc-1 \(revision 2\)/);
  assert.match(md, /## Thread t1 — open/);
  assert.match(md, /Quoted text: "revenue increased"/);
  assert.match(md, /Anchor offsets: 5–23/);
  assert.match(md, /Priya.*Check the figure\./);
});

test('markdown shows replies, resolutions, and tombstones', () => {
  let s = addComment(oneThread(), {
    threadId: 't1', commentId: 'c2',
    personId: 'u-2', personName: 'Manu', timestamp: t, text: 'Fixed.'
  });
  s = setStatus(s, { threadId: 't1', status: 'resolved', personId: 'u-2', personName: 'Manu', timestamp: t });
  const md = toMarkdown(s);
  assert.match(md, /## Thread t1 — resolved/);
  assert.match(md, /Resolved by Manu/);
  assert.match(md, /Manu.*Fixed\./);
});

test('extract returns null without embedded state; embed round-trips', () => {
  const bare = shell(oneThread());
  assert.equal(extractState(bare), null);
  const filled = embedState(shellWithMarker(), oneThread());
  const back = extractState(filled);
  assert.equal(back.threads.length, 1);
  assert.equal(back.comments[0].text, 'Check the figure.');
  assert.throws(() => embedState(bare, oneThread()), /No embedded review state/);
});

test('extract rejects corrupt payloads', () => {
  const bad = '<script type="application/json" data-collabhtml-comments="">{"nope":true}</script>';
  assert.throws(() => extractState(bad), /Invalid/);
});
