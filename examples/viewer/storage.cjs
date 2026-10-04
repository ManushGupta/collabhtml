// Responsibility: example-host storage contract — load(document) and apply(document, operation).
// No pane, iframe handling, or file writes. HTTP delegates to the example server.
(function (global) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('../../dist/comments.cjs') : global.CollabHTMLComments;
  const sameDocument = (a, b) => a && b && a.id === b.id && a.revision === b.revision;
  const key = document => JSON.stringify([document.id, document.revision]);
  function ensureDocument(state, document) {
    if (!sameDocument(state.document, document)) throw new Error('Comments belong to another document revision.');
    return state;
  }
  // Wraps any adapter and validates what crosses the boundary, whatever the backend.
  function createStore(adapter, { maxBytes = 2 * 1024 * 1024 } = {}) {
    if (typeof adapter?.load !== 'function' || typeof adapter?.apply !== 'function') throw new Error('Storage needs load and apply methods.');
    return {
      async load(document) {
        C.empty(document.id, document.revision); // Validate the requested identity.
        return ensureDocument(C.validate(await adapter.load({ ...document })), document);
      },
      async apply(document, operation) {
        if (new TextEncoder().encode(JSON.stringify(operation)).length > maxBytes) throw new Error('Operation exceeds the example size limit.');
        return ensureDocument(C.validate(await adapter.apply({ ...document }, JSON.parse(JSON.stringify(operation)))), document);
      }
    };
  }
  // In-process adapter for tests. Shows the same contract without a server.
  function memoryAdapter() {
    const records = new Map();
    const read = document => records.has(key(document)) ? C.validate(records.get(key(document))) : C.empty(document.id, document.revision);
    return {
      async load(document) { return read(document); },
      async apply(document, operation) {
        const next = C.apply(read(document), operation);
        records.set(key(document), next);
        return C.validate(next);
      }
    };
  }
  function httpAdapter(endpoint = '/api/comments', fetchRequest = global.fetch.bind(global)) {
    async function request(url, options) {
      const response = await fetchRequest(url, { credentials: 'same-origin', ...options });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Comment storage failed (${response.status}).`);
      return payload;
    }
    return {
      load(document) {
        const query = new URLSearchParams({ document: document.id, revision: document.revision });
        return request(`${endpoint}?${query}`);
      },
      apply(document, operation) {
        return request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document, operation }) });
      }
    };
  }
  const api = { createStore, memoryAdapter, httpAdapter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CollabHTMLViewerStorage = api;
})(globalThis);
