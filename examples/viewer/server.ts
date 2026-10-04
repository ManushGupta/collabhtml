// Responsibility: loopback example server, static demo files, and the comments HTTP API.
// Delegates persistence to file-store.js. Not part of the reusable library.
//   GET  /api/comments?document=ID&revision=REV  -> comments state
//   POST /api/comments { document, operation }    -> comments state after the operation
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileStore } from './file-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 4173);

export interface ServerOptions {
  storageDirectory?: string;
}

export function createServer({ storageDirectory = path.join(root, '.collabhtml-data', 'comments-v3') }: ServerOptions = {}) {
  const store = createFileStore(storageDirectory);
  const json = (response: http.ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
  };
  return http.createServer(async (request, response) => {
    const host = request.headers.host || '';
    const serverPort = request.socket.localPort;
    if (![`127.0.0.1:${serverPort}`, `localhost:${serverPort}`].includes(host)) {
      json(response, 403, { error: 'Loopback host required.' }); return;
    }
    const origin = `http://${host}`;
    if (request.headers.origin && request.headers.origin !== origin) {
      json(response, 403, { error: 'Cross-origin requests are not allowed.' }); return;
    }
    let url: URL; let pathname: string;
    try { url = new URL(request.url || '/', origin); pathname = decodeURIComponent(url.pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/api/comments') {
      try {
        if (request.method === 'GET') {
          json(response, 200, store.load({ id: url.searchParams.get('document') || '', revision: url.searchParams.get('revision') || '' }));
        } else if (request.method === 'POST') {
          if (request.headers.origin !== origin || request.headers['content-type']?.split(';')[0] !== 'application/json') {
            json(response, 403, { error: 'Same-origin JSON request required.' }); return;
          }
          const limit = 1024 * 1024; let size = 0; const chunks: Buffer[] = [];
          for await (const chunk of request) {
            size += chunk.length;
            if (size > limit) { json(response, 413, { error: 'Request too large.' }); request.resume(); return; }
            chunks.push(chunk);
          }
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          json(response, 200, store.apply(payload.document || {}, payload.operation));
        } else json(response, 405, { error: 'Use GET or POST.' });
      } catch (error: unknown) {
        const ioError = typeof (error as any)?.code === 'string';
        json(response, ioError ? 500 : 400, { error: ioError ? 'Comment storage is unavailable.' : (error as Error).message });
      }
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    const requestPath = pathname === '/' ? '/dist/demo.html' : pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = path.resolve(root, `.${requestPath}`);
    if (!file.startsWith(`${root}${path.sep}`) || /(^|\/)\./.test(pathname)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end('Not found. Run npm run build first.'); return; }
      response.writeHead(200, { 'Content-Type': file.endsWith('.js') || file.endsWith('.cjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(data);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) createServer().listen(port, '127.0.0.1', () => console.log(`CollabHTML demo: http://127.0.0.1:${port}`));
