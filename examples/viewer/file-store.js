// Responsibility: example-server comment files — load state, apply one operation, write atomically.
// No HTTP or UI. Single-process writes only; not production shared storage.
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as C from '../../src/comments.js';

function createFileStore(directory, maxBytes = 2 * 1024 * 1024) {
  function filename(document) {
    C.empty(document.id, document.revision); // Validate the identity before using it.
    const key = createHash('sha256').update(JSON.stringify([document.id, document.revision])).digest('hex');
    return path.join(directory, `${key}.json`);
  }
  function load(document) {
    const file = filename(document);
    try {
      const state = C.validate(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (state.document.id !== document.id || state.document.revision !== document.revision) throw new Error('Document mismatch.');
      return state;
    } catch (error) { if (error.code === 'ENOENT') return C.empty(document.id, document.revision); throw error; }
  }
  // Operations append or update one thread, so concurrent people do not overwrite each other.
  // Read/apply/write is synchronous, which serializes requests in this one Node process.
  // Multiple writer processes need a lock or a database transaction.
  function apply(document, operation) {
    const file = filename(document);
    const next = C.apply(load(document), operation);
    const serialized = C.serialize(next);
    if (Buffer.byteLength(serialized) > maxBytes) throw new Error('Comments exceed the example size limit.');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file); // Readers see a whole file, never a partial write.
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return next;
  }
  return { load, apply };
}
export { createFileStore };
