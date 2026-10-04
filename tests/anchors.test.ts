// Responsibility: W3C-selector anchors — creation, relocation, and ambiguous or changed text.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/anchors.js';
import * as C from '../src/comments.js';
const sample = 'The report says revenue increased 12 percent this quarter.';
const anchor = A.create(sample, 16, 44);

test('an anchor is a W3C TextQuoteSelector plus a TextPositionSelector', () => {
  assert.deepEqual(anchor, [
    { type: 'TextQuoteSelector', exact: 'revenue increased 12 percent', prefix: 'The report says ', suffix: ' this quarter.' },
    { type: 'TextPositionSelector', start: 16, end: 44 }
  ]);
  assert.doesNotThrow(() => C.validateAnchor(anchor));
});
test('anchor locates original text and follows a preceding insertion', () => {
  assert.deepEqual(A.locate(sample, anchor), { start: 16, end: 44 });
  assert.deepEqual(A.locate('Intro. ' + sample, anchor), { start: 23, end: 51 });
});
test('changed or ambiguous anchors are unplaced, never guessed', () => {
  assert.equal(A.locate(sample.replace('12', '14'), anchor), null);
  assert.equal(A.locate('x target and target', [{ type: 'TextQuoteSelector', exact: 'target' }]), null);
  assert.deepEqual(A.locate('one target here', [{ type: 'TextQuoteSelector', exact: 'target' }]), { start: 4, end: 10 });
});
test('a quote alone works without a position or context', () => {
  assert.deepEqual(A.locate(sample, [{ type: 'TextQuoteSelector', exact: 'revenue' }]), { start: 16, end: 23 });
});
test('a wrong position hint falls back to the quote and its context', () => {
  const wrongHint = [anchor[0], { type: 'TextPositionSelector', start: 2, end: 30 }];
  assert.deepEqual(A.locate(sample, wrongHint), { start: 16, end: 44 });
});
test('invalid selections fail clearly', () => {
  for (const pair of [[-1, 5], [5, 5], [6, 3], [0, 1000], [0.5, 3]]) assert.throws(() => A.create(sample, ...pair));
});
test('the Comment API accepts only well-formed W3C selectors', () => {
  const quote = anchor[0]; const position = anchor[1];
  for (const bad of [
    [], 'text', [position], [quote, quote], [quote, position, position],
    [{ ...quote, exact: ' ' }], [{ ...quote, extra: 1 }], [{ type: 'CssSelector', value: 'p' }],
    [quote, { ...position, end: position.start }], [quote, { ...position, start: -1 }], [{ ...quote, prefix: 'x'.repeat(81) }]
  ]) assert.throws(() => C.validateAnchor(bad), /anchor/, JSON.stringify(bad).slice(0, 60));
});
