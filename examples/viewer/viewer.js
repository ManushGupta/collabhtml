// Responsibility: example uploads, document identity, sandbox injection, message checks.
// Delegates storage to storage.js; does not implement the collaboration layer.
(function () {
  'use strict';
  const Storage = CollabHTMLViewerStorage;
  const frame = document.getElementById('artifact');
  const status = document.getElementById('status');
  const maxBytes = 2 * 1024 * 1024;
  let active = null; let generation = 0;
  const store = Storage.createStore(Storage.httpAdapter('/api/comments'));
  const sameDocument = (a, b) => a && b && a.id === b.id && a.revision === b.revision;
  function report(message, error = false) { status.textContent = message; status.className = error ? 'error' : ''; }
  window.addEventListener('message', async event => {
    const message = event.data;
    // Opaque-origin iframe messages have origin "null". Source and per-load
    // random channel bind requests to this iframe, not to unrelated windows.
    if (!active || event.source !== frame.contentWindow || event.origin !== 'null' || !message ||
      message.kind !== 'collabhtml:request' || message.channel !== active.channel || !Number.isSafeInteger(message.requestId)) return;
    const session = active;
    const response = { kind: 'collabhtml:response', channel: session.channel, requestId: message.requestId };
    try {
      if (!sameDocument(message.payload?.document, session.document)) throw new Error('Document mismatch.');
      if (message.operation === 'load') response.result = await session.store.load(session.document);
      else if (message.operation === 'apply') {
        response.result = await session.store.apply(session.document, message.payload.operation);
        if (active === session) report(`Saved ${message.payload.operation.type} for ${session.name}. ${response.result.comments.length} comment(s) in the server's JSON file store.`);
      } else throw new Error('Unknown storage operation.');
    } catch (error) { response.error = error.message || 'Storage failed.'; if (active === session) report(response.error, true); }
    if (active !== session) return; // Ignore responses for a replaced iframe document.
    // A sandbox without allow-same-origin needs '*'; the frame validates parent source.
    event.source.postMessage(response, '*');
  });
  async function readResource(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}. Run npm run build and use the local development server.`);
    return response.text();
  }
  async function openHTML(source, name) {
    const current = ++generation; active = null;
    if (new TextEncoder().encode(source).length > maxBytes) throw new Error('HTML exceeds the 2 MiB example limit.');
    const personName = document.getElementById('person-name').value.trim();
    if (!personName) throw new Error('Enter your name first.');
    // Example only: a real service takes personId and personName from its login session.
    const person = { personId: `example-person:${encodeURIComponent(personName.toLowerCase())}`, personName };
    report('Preparing isolated document…');
    const [runtime, bridge, exportBootstrap] = await Promise.all([
      readResource('../../dist/collabhtml-full.js'), readResource('bridge.js'), readResource('../standalone/bootstrap.js')
    ]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (current !== generation) return;
    const documentIdentity = { id: `html-${hash}`, revision: '1' };
    const channel = crypto.randomUUID();
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    parsed.querySelectorAll('script[data-collabhtml-runtime],script[data-collabhtml-bootstrap],script[data-collabhtml-comments]').forEach(node => node.remove());
    if (!document.getElementById('allow-scripts').checked) {
      parsed.querySelectorAll('script:not([type="application/json"]),iframe,object,embed').forEach(node => node.remove());
      for (const element of parsed.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
          if (/^on/i.test(attribute.name) || /^javascript:/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
        }
      }
    }
    parsed.querySelectorAll('base,meta[http-equiv]').forEach(node => node.remove());
    const policy = parsed.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    parsed.head.prepend(policy);
    const runtimeNode = parsed.createElement('script'); runtimeNode.dataset.collabhtmlRuntime = '';
    runtimeNode.textContent = runtime.replace(/<\/script/gi, '<\\/script');
    const bridgeNode = parsed.createElement('script'); bridgeNode.dataset.collabhtmlBootstrap = '';
    bridgeNode.dataset.config = JSON.stringify({ channel, document: documentIdentity, person, exportBootstrap });
    bridgeNode.textContent = bridge.replace(/<\/script/gi, '<\\/script');
    parsed.body.append(runtimeNode, bridgeNode);
    active = { channel, document: documentIdentity, name, store };
    frame.srcdoc = '<!doctype html>\n' + parsed.documentElement.outerHTML;
    report(`Opened ${name}. Comments use the server's JSON file store through an HTTP adapter. Reopen the same HTML to restore comments. External assets are blocked.`);
  }
  document.getElementById('upload').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > maxBytes) throw new Error('HTML exceeds the 2 MiB example limit.');
      await openHTML(await file.text(), file.name);
    } catch (error) { report(error.message, true); }
    finally { event.target.value = ''; }
  });
  document.getElementById('sample').addEventListener('click', async () => {
    try { await openHTML(await readResource('../standalone/index.html'), 'sample report'); }
    catch (error) { report(error.message, true); }
  });
})();
