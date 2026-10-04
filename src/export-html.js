// Responsibility: package document HTML, a comments snapshot, and caller-supplied JS.
// No pane startup, Save button, download, storage, networking, or unload warning.
(function () {
  'use strict';
  function exportHTML({ root, state, runtimeSource, bootstrapSource }) {
    if (!root || root.ownerDocument !== document) throw new Error('Provide the HTML root for export');
    for (const [name, source] of Object.entries({ runtimeSource, bootstrapSource })) {
      if (typeof source !== 'string' || !source.trim()) throw new Error(`Provide ${name} for HTML export`);
    }
    const snapshot = CollabHTML.comments.serialize(state);
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll('[data-collabhtml-ui],script[data-collabhtml-runtime],script[data-collabhtml-comments],script[data-collabhtml-bootstrap]').forEach(element => element.remove());
    const exportedRoot = root === document.body ? copy.querySelector('body') : root.id ? copy.querySelector(`#${CSS.escape(root.id)}`) : null;
    if (!exportedRoot) throw new Error('Give the HTML root a unique ID before export');
    if (!exportedRoot.id) {
      let id = 'collabhtml-content'; let suffix = 0;
      while (copy.querySelector(`#${id}`)) id = `collabhtml-content-${++suffix}`;
      exportedRoot.id = id;
    }
    const data = document.createElement('script'); data.type = 'application/json'; data.dataset.collabhtmlComments = ''; data.textContent = snapshot;
    const runtime = document.createElement('script'); runtime.dataset.collabhtmlRuntime = ''; runtime.dataset.root = `#${CSS.escape(exportedRoot.id)}`;
    runtime.textContent = runtimeSource.replace(/<\/script/gi, '<\\/script');
    const bootstrap = document.createElement('script'); bootstrap.dataset.collabhtmlBootstrap = '';
    bootstrap.textContent = bootstrapSource.replace(/<\/script/gi, '<\\/script');
    copy.querySelector('body').append(data, runtime, bootstrap);
    return '<!doctype html>\n' + copy.outerHTML;
  }
  CollabHTML.exportHTML = exportHTML;
})();
