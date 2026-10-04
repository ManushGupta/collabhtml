// Responsibility: enforce layer boundaries. The primitive has no UI, storage, or export. The UI uses only public API.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the primitive has no UI, storage, export, network, or startup logic', () => {
  const source = ['src/comments.js', 'src/anchors.js', 'src/controller.js'].map(file => strip(read(file))).join('\n');
  for (const token of ['CollabHTMLPane', 'CollabHTMLThreads', 'attachShadow', 'shadowRoot', 'innerHTML', 'adapter', 'fetch(', 'localStorage', 'sessionStorage',
    'exportHTML', 'download', 'beforeunload', 'runtimeSource', 'data-auto', 'location.', 'clipboard']) {
    assert.equal(source.includes(token), false, `Unexpected dependency in the primitive: ${token}`);
  }
  assert.equal(source.includes('options.onChange'), true);
});

test('the default UI calls only the primitive public API', () => {
  const publicMethods = new Set(['getState', 'setState', 'view', 'getPerson', 'setPerson', 'addThread', 'addComment', 'setStatus',
    'toggleReaction', 'editComment', 'deleteComment', 'updateMetadata', 'focus', 'on', 'destroy']);
  const source = ['ui/pane.js', 'ui/threads.js'].map(file => strip(read(file))).join('\n');
  // Method calls on the controller passed to mount(comments).
  const used = new Set([...source.matchAll(/(?<![.\w])comments\.(\w+)/g)].map(match => match[1]));
  assert.ok(used.size > 5, 'expected the UI to use the controller');
  for (const name of used) assert.ok(publicMethods.has(name), `The UI uses non-public comments.${name}`);
  // No access to the primitive's internal modules.
  for (const token of ['CollabHTMLComments', 'CollabHTMLAnchors', 'fetch(', 'localStorage', 'exportHTML']) {
    assert.equal(source.includes(token), false, `The UI must not use ${token}`);
  }
  // The only part of the public namespace the UI may use is the ID helper.
  // (CommentsLib and ThreadsUI are local aliases for the CollabHTML globals.)
  const namespaceUse = new Set([...source.matchAll(/(?:CollabHTML|CommentsLib)\.(\w+(?:\.\w+)?)/g)].map(match => match[1]));
  assert.deepEqual([...namespaceUse], ['comments.createId']);
  const threadsUse = new Set([...source.matchAll(/ThreadsUI\.(\w+)/g)].map(match => match[1]));
  assert.deepEqual([...threadsUse].sort(), ['icon', 'renderThread']);
});

test('the primitive and the UI do not depend on HTML export, and export does not depend on the UI', () => {
  const exporter = strip(read('src/export-html.js'));
  for (const token of ['CollabHTMLPane', 'CollabHTMLThreads', 'create(']) assert.equal(exporter.includes(token), false, `Export must not use ${token}`);
});
