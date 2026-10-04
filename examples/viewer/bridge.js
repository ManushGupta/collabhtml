// Responsibility: example iframe startup, load/apply messages, and a custom UI
// built ONLY on the primitive (create/view/events/methods) in the default
// pane's visual patterns. Proves a viewer needs just the primitive.
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

    // Custom UI from here on: view() to draw, methods to change, events to refresh.
    // Same patterns as the default pane (toggle, filter, cards, inline reply/edit,
    // resolve menu, relative times), reimplemented on the public API.
    // Shadow DOM keeps document styles out of the panel.
    const css = `
      :host { all: initial; }
      .toggle { position: fixed; right: 16px; top: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 7px 14px; font: 13px/1.5 system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.12); cursor: pointer; z-index: 2147483647; }
      .panel { position: fixed; top: 56px; right: 16px; bottom: 16px; width: 360px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.18); overflow: hidden; font: 14px/1.5 system-ui, sans-serif; color: #1f2937; z-index: 2147483647; }
      .panel[hidden] { display: none; }
      header { padding: 12px 12px 10px 16px; border-bottom: 1px solid #e5e7eb; }
      .top { display: flex; align-items: center; gap: 8px; }
      h2 { font-size: 16px; margin: 0; } .count { color: #6b7280; font-size: 14px; }
      select { border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px 8px; background: #fff; font-size: 13px; }
      .body { overflow: auto; flex: 1; padding: 12px 14px; background: #f9fafb; }
      button { cursor: pointer; font: inherit; }
      .btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 5px 11px; font-size: 13px; }
      .btn:hover { background: #f9fafb; }
      .btn.primary { background: #6d3fc2; border-color: #6d3fc2; color: #fff; }
      .btn.danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: #6b7280; font-size: 14px; }
      .icon-btn:hover { background: #f3f4f6; color: #111827; }
      .who { color: #6b7280; font-size: 12px; margin: 8px 0 0; }
      .compose { padding: 10px; background: #f3edfc; border-radius: 10px; margin: 0 0 12px; }
      .compose[hidden] { display: none; }
      .quote-preview { border-left: 3px solid #6d3fc2; padding: 2px 0 2px 10px; margin: 0 0 8px; font-size: 13px; color: #374151; overflow-wrap: anywhere; }
      .actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
      article { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin: 0 0 12px; }
      article.resolved { opacity: .72; }
      .badges { display: flex; gap: 4px; margin-bottom: 8px; }
      .badge { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #f3f4f6; color: #374151; }
      .badge.resolved { background: #dcfce7; color: #166534; }
      .quote { display: block; width: 100%; text-align: left; border: 0; border-left: 3px solid #6d3fc2; background: #f3edfc; border-radius: 6px; padding: 7px 10px; margin: 0 0 4px; font-size: 13px; color: #374151; overflow-wrap: anywhere; cursor: pointer; }
      .comment { margin-top: 12px; }
      .person { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
      .name { font-weight: 600; font-size: 13px; color: #111827; } .time { margin-left: auto; }
      .avatar { width: 24px; height: 24px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; }
      .message { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0 4px; }
      .muted { color: #6b7280; font-size: 12px; }
      .row-tools { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
      .chip { border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font-size: 12px; padding: 2px 9px; }
      input, textarea { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; box-sizing: border-box; }
      textarea { resize: none; min-height: 64px; display: block; }
      .reply-box { margin-top: 12px; } .reply-box input { border-radius: 999px; padding: 8px 14px; }
      footer { padding: 8px 16px; background: #fff; border-top: 1px solid #e5e7eb; }
      .empty { padding: 28px 0; text-align: center; }
    `;
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = css; shadow.append(style);
    const toggle = document.createElement('button'); toggle.className = 'toggle'; toggle.type = 'button';
    const panel = document.createElement('section'); panel.className = 'panel'; panel.setAttribute('aria-label', 'Comments');
    const setOpen = open => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    const header = document.createElement('header');
    const top = document.createElement('div'); top.className = 'top';
    const title = document.createElement('h2'); title.textContent = 'Comments';
    const count = document.createElement('span'); count.className = 'count';
    const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Show');
    for (const [value, label] of [['all', 'All comments'], ['open', 'Open'], ['resolved', 'Resolved'], ['mine', 'Mine']]) {
      const option = document.createElement('option'); option.textContent = label; option.value = value; filter.append(option);
    }
    filter.addEventListener('change', render);
    const close = document.createElement('button'); close.className = 'icon-btn'; close.type = 'button';
    close.title = 'Close comments'; close.setAttribute('aria-label', 'Close comments'); close.textContent = '✕';
    close.addEventListener('click', () => { setOpen(false); toggle.focus(); });
    top.append(title, count, filter, close); header.append(top);
    const who = document.createElement('p'); who.className = 'who';
    who.textContent = `Commenting as ${config.person.personName}`;
    header.append(who);
    const tools = document.createElement('div'); tools.className = 'actions';
    const refresh = document.createElement('button'); refresh.className = 'btn'; refresh.textContent = 'Refresh';
    refresh.addEventListener('click', async () => {
      try { comments.setState(await request('load', { document: config.document })); report('Comments updated.'); }
      catch (error) { report(error.message || 'Refresh failed.', true); }
    });
    tools.append(refresh); header.append(tools);
    const body = document.createElement('div'); body.className = 'body';
    const compose = document.createElement('form'); compose.className = 'compose'; compose.hidden = true;
    const quotePreview = document.createElement('p'); quotePreview.className = 'quote-preview';
    const commentInput = document.createElement('textarea');
    commentInput.setAttribute('aria-label', 'New comment'); commentInput.maxLength = 20000;
    const composeActions = document.createElement('div'); composeActions.className = 'actions';
    const submit = document.createElement('button'); submit.textContent = 'Add comment'; submit.className = 'btn primary'; submit.type = 'submit';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'btn'; cancel.type = 'button';
    cancel.addEventListener('click', () => { selectedAnchor = null; compose.hidden = true; commentInput.value = ''; });
    composeActions.append(submit, cancel); compose.append(quotePreview, commentInput, composeActions);
    const list = document.createElement('div'); body.append(compose, list);
    const footer = document.createElement('footer');
    const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status');
    status.textContent = 'Select text to add a comment.';
    footer.append(status);
    panel.append(header, body, footer); shadow.append(toggle, panel);
    document.body.append(host);

    let selectedAnchor = null;
    const report = (message, error) => { status.textContent = message; status.className = error ? 'status error' : 'status'; };
    async function perform(task) {
      try { report('Updating comments…'); await task(); report('Comments updated.'); return true; }
      catch (error) { report(error.message || 'Change failed.', true); return false; }
    }
    function relativeTime(iso) {
      const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
      return new Date(iso).toLocaleDateString();
    }
    function avatarFor(comment) {
      let hue = 0; for (const character of comment.personId) hue = (hue * 31 + (character.codePointAt(0) || 0)) % 360;
      const circle = document.createElement('span'); circle.className = 'avatar';
      circle.textContent = (comment.personName.trim()[0] || '?').toUpperCase();
      circle.style.background = `hsl(${hue} 50% 42%)`; return circle;
    }
    function setUi() { render(); }
    const mine = personId => personId === comments.getPerson()?.personId;
    function visible(thread, threadComments) {
      if (filter.value === 'open' || filter.value === 'resolved') return thread.status === filter.value;
      if (filter.value === 'mine') return threadComments.some(comment => mine(comment.personId));
      return true;
    }
    function renderComment(card, comment, thread, isRoot) {
      const row = document.createElement('div'); row.className = 'comment';
      const head = document.createElement('div'); head.className = 'person';
      const time = document.createElement('span'); time.className = 'time';
      time.textContent = relativeTime(comment.timestamp); time.title = new Date(comment.timestamp).toLocaleString();
      const name = document.createElement('span'); name.className = 'name'; name.textContent = comment.personName;
      head.append(avatarFor(comment), name);
      if (comment.edited) { const mark = document.createElement('span'); mark.textContent = '(edited)'; head.append(mark); }
      head.append(time); row.append(head);
      if (comment.deleted) {
        const gone = document.createElement('p'); gone.className = 'message muted'; gone.textContent = 'This comment was deleted.';
        row.append(gone); card.append(row); return;
      }
      const message = document.createElement('p'); message.className = 'message'; message.textContent = comment.text;
      row.append(message);
      const toolsRow = document.createElement('div'); toolsRow.className = 'row-tools';
      const copy = document.createElement('button'); copy.className = 'chip'; copy.type = 'button'; copy.textContent = 'Copy';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(comment.text); report('Copied.'); }
        catch { report('Could not copy. Select the text and copy it manually.', true); }
      });
      toolsRow.append(copy);
      if (mine(comment.personId)) {
        const edit = document.createElement('button'); edit.className = 'chip'; edit.type = 'button'; edit.textContent = 'Edit';
        edit.addEventListener('click', () => {
          const form = document.createElement('form');
          const input = document.createElement('textarea'); input.value = comment.text; input.maxLength = 20000;
          input.setAttribute('aria-label', 'Edit comment');
          const save = document.createElement('button'); save.className = 'btn primary'; save.type = 'submit'; save.textContent = 'Save';
          const cancelEdit = document.createElement('button'); cancelEdit.className = 'btn'; cancelEdit.type = 'button'; cancelEdit.textContent = 'Cancel';
          cancelEdit.addEventListener('click', setUi);
          form.append(input, save, cancelEdit);
          form.addEventListener('submit', async event => {
            event.preventDefault();
            await perform(() => comments.editComment(comment.commentId, input.value.trim()));
          });
          row.append(form);
        });
        const del = document.createElement('button'); del.className = 'chip'; del.type = 'button'; del.textContent = 'Delete';
        del.addEventListener('click', () => {
          const confirm = document.createElement('div'); confirm.className = 'actions';
          const label = document.createElement('span'); label.className = 'muted'; label.textContent = 'Delete this comment?';
          const yes = document.createElement('button'); yes.className = 'btn danger'; yes.type = 'button'; yes.textContent = 'Delete';
          yes.addEventListener('click', async () => { if (await perform(() => comments.deleteComment(comment.commentId))) setUi(); });
          const no = document.createElement('button'); no.className = 'btn'; no.type = 'button'; no.textContent = 'Cancel';
          no.addEventListener('click', setUi);
          confirm.append(label, yes, no); row.append(confirm);
        });
        toolsRow.append(edit, del);
      }
      if (isRoot) {
        const toggleStatus = document.createElement('button'); toggleStatus.className = 'chip'; toggleStatus.type = 'button';
        toggleStatus.textContent = thread.status === 'open' ? 'Resolve' : 'Reopen';
        toggleStatus.addEventListener('click', () => perform(() =>
          comments.setStatus(thread.threadId, thread.status === 'open' ? 'resolved' : 'open')));
        toolsRow.append(toggleStatus);
      }
      row.append(toolsRow);
      card.append(row);
    }
    function render() {
      const view = comments.view();
      const open = view.filter(item => item.thread.status === 'open').length;
      toggle.textContent = `Comments · ${open} open`; count.textContent = String(view.length); list.replaceChildren();
      let shown = 0;
      for (const item of view) {
        if (!visible(item.thread, item.comments)) continue;
        shown += 1;
        const card = document.createElement('article');
        if (item.thread.status === 'resolved') card.className = 'resolved';
        card.tabIndex = -1; card.dataset.threadId = item.thread.threadId;
        const badges = document.createElement('div'); badges.className = 'badges';
        const statusBadge = document.createElement('span');
        statusBadge.className = 'badge' + (item.thread.status === 'resolved' ? ' resolved' : '');
        statusBadge.textContent = item.thread.status === 'resolved' ? 'Resolved' : 'Open';
        badges.append(statusBadge);
        if (!item.placed) {
          const unplaced = document.createElement('span'); unplaced.className = 'badge'; unplaced.textContent = 'Unplaced';
          badges.append(unplaced);
        }
        if (badges.childElementCount) card.append(badges);
        const quote = document.createElement('button'); quote.className = 'quote'; quote.type = 'button';
        quote.title = 'Show in page';
        const quoteText = document.createElement('span'); quoteText.textContent = quoteTextOf(item.thread.anchor);
        quote.append(quoteText);
        quote.addEventListener('click', () => comments.focus(item.thread.threadId));
        card.append(quote);
        item.comments.forEach((comment, index) => renderComment(card, comment, item.thread, index === 0));
        const form = document.createElement('form'); form.className = 'reply-box';
        const input = document.createElement('input');
        input.type = 'text'; input.placeholder = 'Reply…'; input.setAttribute('aria-label', 'Reply'); input.maxLength = 20000; input.autocomplete = 'off';
        form.append(input); card.append(form);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const text = input.value.trim(); if (!text) return;
          if (await perform(() => comments.addComment({ threadId: item.thread.threadId, text }))) input.value = '';
        });
        list.append(card);
      }
      if (!shown) {
        const empty = document.createElement('p'); empty.className = 'muted empty';
        empty.textContent = view.length ? 'No comments match this filter.' : 'No comments yet. Select text on the page to start.';
        list.append(empty);
      }
    }
    function quoteTextOf(anchor) {
      const quote = anchor.find(selector => selector.type === 'TextQuoteSelector');
      return quote ? quote.exact : '(no text anchor)';
    }
    comments.on('update', render);
    comments.on('selection', anchor => {
      selectedAnchor = anchor;
      quotePreview.textContent = quoteTextOf(anchor);
      compose.hidden = false; setOpen(true);
    });
    comments.on('focus', threadId => {
      const card = list.querySelector(`[data-thread-id="${threadId}"]`);
      if (card) card.scrollIntoView({ block: 'nearest' });
    });
    compose.addEventListener('submit', async event => {
      event.preventDefault();
      if (!selectedAnchor) return;
      const done = await perform(() => comments.addThread({ anchor: selectedAnchor, text: commentInput.value.trim() }));
      if (done) { selectedAnchor = null; compose.hidden = true; commentInput.value = ''; }
    });
    filter.addEventListener('change', render);
    render();
    window.collabhtmlComments = comments; // Test convenience.
  }).catch(error => {
    const warning = document.createElement('p'); warning.textContent = `Comments could not start: ${error.message}`; document.body.append(warning);
  });
})();
