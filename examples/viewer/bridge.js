// Responsibility: example iframe startup and load/apply messages to its parent.
// Adds an example Save action using library export; never receives host credentials.
(function () {
  'use strict';
  const script = document.currentScript;
  const config = JSON.parse(script.dataset.config);
  const pending = new Map();
  let sequence = 0;
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== parent || !message || message.channel !== config.channel || message.kind !== 'collabhtml:response') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    clearTimeout(request.timeout); pending.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
  });
  function request(operation, payload) {
    return new Promise((resolve, reject) => {
      const requestId = ++sequence;
      const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('Viewer storage did not respond.')); }, 10000);
      pending.set(requestId, { resolve, reject, timeout });
      // The parent URL may vary. The parent validates frame source and channel.
      parent.postMessage({ kind: 'collabhtml:request', channel: config.channel, requestId, operation, payload }, '*');
    });
  }
  request('load', { document: config.document }).then(state => {
    // The primitive handles the data. The person comes from the viewer, not from the iframe.
    const comments = CollabHTML.create({
      root: 'body', state, person: config.person,
      // Send each operation to the parent. The returned server state also includes other people's comments.
      onChange(operation, { document }) { return request('apply', { document, operation }); }
    });
    // The viewer chooses which reactions to offer and supplies one thread action.
    // Reaction behavior and the metadata operation belong to the primitive.
    const pane = CollabHTMLPane.mount(comments, {
      reactions: ['upvote', '👍', '🎉'],
      threadActions: [{ label: 'Toggle Action Item',
        run: (thread, api) => api.updateMetadata({ threadId: thread.threadId }, { actionItem: thread.metadata?.actionItem ? null : true }) }],
      threadBadges: thread => (thread.metadata?.actionItem ? ['Action item'] : []),
      actions: [
        { label: 'Refresh', async run(api) { api.setState(await request('load', { document: config.document })); } },
        { label: 'Save HTML with comments', run(api) {
          const html = CollabHTML.exportHTML({ root: document.body, state: api.getState(),
            runtimeSource: document.querySelector('script[data-collabhtml-runtime]').textContent,
            bootstrapSource: config.exportBootstrap
          });
          const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = 'commented.html'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        } }
      ]
    });
    window.collabhtmlComments = comments; window.collabhtmlPane = pane; // Test convenience.
  }).catch(error => {
    const warning = document.createElement('p'); warning.textContent = `Comments could not start: ${error.message}`; document.body.append(warning);
  });
})();
