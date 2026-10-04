// Responsibility: enforce layer boundaries. The primitive has no UI, storage, or export. The UI uses only public API.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read = file => fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the primitive has no UI, storage, export, network, or startup logic', () => {
  const source = ['src/comments.ts', 'src/anchors.ts', 'src/controller.ts', 'src/brief.ts'].map(file => strip(read(file))).join('\n');
  for (const token of ['CollabHTMLPane', 'CollabHTMLThreads', 'attachShadow', 'shadowRoot', 'innerHTML', 'adapter', 'fetch(', 'localStorage', 'sessionStorage',
    'exportHTML', 'download', 'beforeunload', 'runtimeSource', 'data-auto', 'location.', 'clipboard']) {
    assert.equal(source.includes(token), false, `Unexpected dependency in the primitive: ${token}`);
  }
  assert.equal(source.includes('options.onChange'), true);
});

test('the default UI calls only the primitive public API', () => {
  const publicMethods = new Set(['getState', 'setState', 'view', 'getPerson', 'setPerson', 'addThread', 'addComment', 'setStatus',
    'toggleReaction', 'editComment', 'deleteComment', 'updateMetadata', 'reanchor', 'focus', 'on', 'destroy']);
  const source = ['ui/pane.ts', 'ui/threads.ts'].map(file => strip(read(file))).join('\n');
  // Method calls on the controller passed to mount(comments).
  const used = new Set([...source.matchAll(/(?<![.\w/'"])comments\.(\w+)/g)].map(match => match[1]));
  assert.ok(used.size > 5, 'expected the UI to use the controller');
  for (const name of used) assert.ok(publicMethods.has(name), `The UI uses non-public comments.${name}`);
  // No access to the primitive's internal modules.
  for (const token of ['CollabHTMLComments', 'CollabHTMLAnchors', 'fetch(', 'localStorage', 'exportHTML']) {
    assert.equal(source.includes(token), false, `The UI must not use ${token}`);
  }
  // The UI takes values from the threads module and only the ID helper from comments.
  const commentImports = [...source.matchAll(/import \{([^}]*)\} from '\.\.\/src\/comments\.js'/g)].map(match => match[1]);
  assert.deepEqual(commentImports.map(list => list.trim()), ['createId']);
  const threadImports = [...source.matchAll(/import \{([^}]*)\} from '\.\/threads\.js'/g)].map(match => match[1]);
  assert.deepEqual(threadImports.map(list => list.trim()), ['icon, renderThread']);
});

test('the primitive and the UI do not depend on HTML export, and export does not depend on the UI', () => {
  const exporter = strip(read('src/export-html.ts'));
  for (const token of ['CollabHTMLPane', 'CollabHTMLThreads', 'create(']) assert.equal(exporter.includes(token), false, `Export must not use ${token}`);
});
