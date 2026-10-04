// Responsibility: standalone example startup, Save button, download, unsaved warning.
// Uses the primitive (CollabHTML.create), the default UI (CollabHTMLPane.mount), and exportHTML.
(function () {
  'use strict';
  const bootstrapSource = document.currentScript.textContent;
  const runtime = document.querySelector('script[data-collabhtml-runtime]');
  async function start() {
    const root = document.querySelector(runtime.dataset.root || 'main') || document.body;
    const embedded = document.querySelector('script[data-collabhtml-comments]');
    const state = embedded ? JSON.parse(embedded.textContent) : CollabHTML.comments.empty(runtime.dataset.document || 'standalone-document', runtime.dataset.revision || '1');
    const runtimeSource = runtime.src ? await fetch(runtime.src).then(response => {
      if (!response.ok) throw new Error('Could not load CollabHTML library for export'); return response.text();
    }) : runtime.textContent;
    let dirty = false;
    // The primitive has no person yet, so the default UI asks for a name and uses an unverified session personId.
    const comments = CollabHTML.create({ root, state, onChange() { dirty = true; } });
    // Copy link: the host builds the URL; the primitive only opens a thread via focus() and emits 'focus'.
    const linkFor = threadId => { const url = new URL(location.href); url.hash = `thread=${encodeURIComponent(threadId)}`; return url.href; };
    // Save names follow the document: title slug, else the file name, else a fallback.
    // Browsers dedupe repeats (name (1).collab.html, ...) — the page cannot count files.
    const downloadName = () => {
      const slug = text => (text || '').trim().toLowerCase()
        .replace(/\.collab\.html$/i, '').replace(/\.html?$/i, '')
        .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      let base = slug(document.title);
      if (!base && location.protocol === 'file:') {
        try { base = slug(decodeURIComponent(location.pathname.split('/').pop())); } catch { /* fall through */ }
      }
      return `${base || 'commented'}.collab.html`;
    };
    comments.on('focus', threadId => history.replaceState(null, '', `#thread=${encodeURIComponent(threadId)}`));
    const pane = CollabHTMLPane.mount(comments, {
      threadActions: [{ label: 'Copy link', run: thread => navigator.clipboard.writeText(linkFor(thread.threadId)) }],
      actions: [{ label: 'Save HTML with comments', run() {
        const html = CollabHTML.exportHTML({ root, state: comments.getState(), runtimeSource, bootstrapSource });
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = downloadName(); link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000); dirty = false;
      } }]
    });
    const linkedThread = new URLSearchParams(location.hash.slice(1)).get('thread');
    if (linkedThread) comments.focus(linkedThread);
    const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    const destroy = comments.destroy;
    comments.destroy = () => { window.removeEventListener('beforeunload', beforeUnload); destroy(); };
    window.collabhtmlComments = comments; window.collabhtmlPane = pane; // Demo/test convenience, not library globals.
  }
  const run = () => start().catch(error => {
    const warning = document.createElement('p'); warning.textContent = `Comments could not start: ${error.message}`; document.body.append(warning);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
