// Responsibility: library UI, operation callbacks, setState, standalone startup, and HTML export E2E.
// Run through Browser Control, not Node:
// browser-control execute --session <session> --file tests/browser-smoke.js
await page.evaluate(() => window.collabhtmlComments?.destroy());
await page.goto('http://127.0.0.1:4173');
const select = async (selector, wholeElement) => page.evaluate(([selector, wholeElement]) => {
  const element = document.querySelector(selector);
  const range = document.createRange();
  if (wholeElement) range.selectNodeContents(element);
  else { range.setStart(element.firstChild, 0); range.setEnd(element.querySelector('strong').firstChild, 10); }
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, [selector, wholeElement]);

// Standalone: the pane asks for a name; personId is an unverified session ID.
await page.getByLabel('Your name').fill('Smoke tester');
await select('#sample-paragraph', false);
await page.getByLabel('New comment').fill('Verify the figure. </script><img src=x onerror=alert(1)>');
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByRole('button', { name: 'Comments · 1 open' }).waitFor();
await page.getByLabel('Reply', { exact: true }).fill('Checked against the source.');
await page.getByLabel('Reply', { exact: true }).press('Enter');
await page.getByText('Checked against the source.').waitFor();
await page.getByLabel('More actions').first().click();
await page.getByRole('menuitem', { name: 'Resolve', exact: true }).click();
await page.getByRole('button', { name: 'Comments · 0 open' }).waitFor();
await page.getByLabel('More actions').first().click();
await page.getByRole('menuitem', { name: 'Reopen', exact: true }).click();
await page.getByRole('button', { name: 'Comments · 1 open' }).waitFor();

// Standalone Copy link support: clicking the quote emits the focus event, which puts the thread in the URL.
await page.getByTitle('Show in page').first().click();
if (!(await page.evaluate(() => location.hash.startsWith('#thread=')))) throw new Error('The focus event did not update the link');

const beforeExport = await page.evaluate(() => {
  const state = collabhtmlComments.getState();
  const [first, followUp] = state.comments;
  if (state.threads.length !== 1 || state.comments.length !== 2) throw new Error('Wrong thread/comment count');
  if (first.threadId !== state.threads[0].threadId || followUp.threadId !== first.threadId) throw new Error('Follow-up does not share threadId');
  if (!state.threads[0].anchor[0].exact.endsWith('32 percent')) throw new Error('Cross-element anchor is wrong');
  if (first.personName !== 'Smoke tester' || !first.personId.startsWith('local-') || followUp.personId !== first.personId) throw new Error('Wrong person fields');
  if (!first.commentId || first.commentId === followUp.commentId || !Date.parse(first.timestamp)) throw new Error('Wrong commentId/timestamp');
  return state;
});
const exported = await page.evaluate(() => CollabHTML.exportHTML({
  root: document.querySelector('#report'), state: collabhtmlComments.getState(),
  runtimeSource: document.querySelector('script[data-collabhtml-runtime]').textContent,
  bootstrapSource: document.querySelector('script[data-collabhtml-bootstrap]').textContent
}));
if (exported.includes('<img src=x onerror=alert(1)>')) throw new Error('Unescaped comments in exported HTML');
// Render the exported payload directly. Extension-backed tabs cannot control downloads.
await page.evaluate(() => collabhtmlComments.destroy());
await page.setContent(exported);
await page.getByRole('button', { name: 'Comments · 1 open' }).waitFor();
const afterExport = await page.evaluate(() => collabhtmlComments.getState());
if (JSON.stringify(beforeExport) !== JSON.stringify(afterExport)) throw new Error('Exported comments did not round-trip');
const resources = await page.evaluate(() => [...document.querySelectorAll('script[src],link[rel=stylesheet],img[src]')].length);
if (resources !== 0) throw new Error('Standalone demo has external dependencies');
await page.evaluate(() => { document.querySelector('#sample-paragraph strong').textContent = '35 percent'; });
await page.getByText('Unplaced', { exact: true }).waitFor();

// Host: a rejected operation leaves comments unchanged.
const hostPerson = { personId: 'person-42', personName: 'Authenticated person' };
await page.evaluate(person => {
  collabhtmlComments.destroy();
  window.collabhtmlComments = CollabHTML.create({ root: '#report', state: CollabHTML.comments.empty('host-demo', '7'), person,
    onChange() { throw new Error('Host rejected the operation'); } });
  window.collabhtmlPane = CollabHTMLPane.mount(collabhtmlComments);
}, hostPerson);
await select('#sample-paragraph strong', true);
await page.getByLabel('New comment').fill('This should be rejected.');
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByText('Host rejected the operation', { exact: true }).waitFor();
if (await page.evaluate(() => collabhtmlComments.getState().comments.length) !== 0) throw new Error('Rejected operation changed comments');

// Host: receives an operation, returns its latest state (which includes another person's comment).
await page.evaluate(person => {
  collabhtmlComments.destroy();
  window.received = [];
  window.collabhtmlComments = CollabHTML.create({ root: '#report', state: CollabHTML.comments.empty('host-demo', '7'), person,
    onChange(operation, context) {
      if (context.previous.comments.length !== 0 || context.next.comments.length !== 1 || context.document.revision !== '7') throw new Error('Wrong onChange context');
      window.received.push(operation);
      const other = { commentId: 'other-comment', threadId: operation.thread.threadId, personId: 'person-99', personName: 'Remote person', timestamp: new Date().toISOString(), text: 'Added elsewhere.' };
      return CollabHTML.comments.apply(context.next, { type: 'comment.added', comment: other });
    } });
  window.collabhtmlPane = CollabHTMLPane.mount(collabhtmlComments);
}, hostPerson);
await page.getByText('Commenting as', { exact: true }).waitFor();
await select('#sample-paragraph strong', true);
await page.getByLabel('New comment').fill('Saved by the host.');
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByText('Added elsewhere.').waitFor();
const hosted = await page.evaluate(() => ({ operation: window.received[0], state: collabhtmlComments.getState() }));
if (hosted.operation.type !== 'thread.started' || hosted.operation.comment.personId !== 'person-42' || hosted.operation.comment.personName !== 'Authenticated person') throw new Error('Wrong operation sent to host');
if (hosted.state.comments.length !== 2) throw new Error('Host-confirmed state was not used');

// Host: setState shows comments from others without reattaching; other documents are rejected.
const setStateResult = await page.evaluate(() => {
  const state = collabhtmlComments.getState();
  const latest = CollabHTML.comments.apply(state, { type: 'thread.status', threadId: state.threads[0].threadId, status: 'resolved', personId: 'person-99', personName: 'Remote person', timestamp: new Date().toISOString() });
  collabhtmlComments.setState(latest);
  let rejected = false;
  try { collabhtmlComments.setState(CollabHTML.comments.empty('another-document', '7')); } catch { rejected = true; }
  return { status: collabhtmlComments.getState().threads[0].status, rejected };
});
await page.getByRole('button', { name: 'Comments · 0 open' }).waitFor();
if (setStateResult.status !== 'resolved' || !setStateResult.rejected) throw new Error('setState did not update or validate');

// The primitive alone is headless: no UI, no pane, no export. Methods and events drive it.
const fetchText = url => page.evaluate(async address => (await fetch(address)).text(), url);
const primitiveSource = await fetchText('/dist/collabhtml.js');
const paneSource = await fetchText('/dist/collabhtml-pane.js');
const escapeScript = source => source.replace(/<\/script/gi, '<\\/script');
const uiPage = body => `${body}<script>${escapeScript(primitiveSource)}</script><script>${escapeScript(paneSource)}</script>`;
await page.evaluate(() => collabhtmlComments.destroy());
await page.evaluate(() => { delete window.CollabHTML; delete window.CollabHTMLPane; });
await page.setContent(`<main id="content"><p>Alpha beta gamma.</p><p>Delta epsilon.</p></main><script>${escapeScript(primitiveSource)}</script>`);
const headless = await page.evaluate(async () => {
  const comments = CollabHTML.create({ root: '#content' });
  const updates = []; const selections = []; const busy = [];
  comments.on('update', detail => updates.push(detail.operation?.type ?? 'placement'));
  comments.on('selection', anchor => selections.push(anchor));
  comments.on('busy', flag => busy.push(flag));
  const range = document.createRange(); range.selectNodeContents(document.querySelectorAll('#content p')[1]);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  const anchor = selections[0];
  const noPerson = await comments.addThread({ anchor, text: 'x' }).then(() => 'resolved', error => error.message);
  comments.setPerson({ personId: 'p1', personName: 'Pat' });
  const started = await comments.addThread({ anchor, text: 'Headless comment' });
  const threadId = started.operation.thread.threadId;
  // Two changes requested at once run in order. Neither is dropped.
  await Promise.all([comments.addComment({ threadId, text: 'First follow-up' }), comments.addComment({ threadId, text: 'Second follow-up' })]);
  await comments.toggleReaction(started.operation.comment.commentId, '👍');
  await comments.updateMetadata({ threadId }, { actionItem: true });
  await comments.setStatus(threadId, 'resolved');
  const badAnchor = await comments.addThread({ anchor: [{ type: 'TextQuoteSelector', exact: 'Not on this page' }], text: 'x' }).then(() => 'resolved', error => error.message);
  const view = comments.view(); const first = view[0];
  const result = {
    noPerson, badAnchor, selectionTypes: selections[0].map(selector => selector.type), texts: first.comments.map(comment => comment.text),
    placed: first.placed, status: first.thread.status, metadata: first.thread.metadata, reactions: first.comments[0].reactions,
    updates, busy, paneType: typeof CollabHTMLPane, uiHosts: [...document.querySelectorAll('[data-collabhtml-ui]')].filter(element => element.shadowRoot).length,
    keys: Object.keys(comments).sort(), exportHTML: typeof CollabHTML.exportHTML
  };
  comments.destroy();
  return result;
});
const expectedKeys = ['addComment', 'addThread', 'deleteComment', 'destroy', 'editComment', 'focus', 'getPerson', 'getState', 'on', 'setPerson', 'setState', 'setStatus', 'toggleReaction', 'updateMetadata', 'view'];
if (!/person/i.test(headless.noPerson)) throw new Error(`A change without a person should fail: ${headless.noPerson}`);
if (!/Selection changed/.test(headless.badAnchor)) throw new Error('An anchor that no longer matches should be rejected');
if (JSON.stringify(headless.selectionTypes) !== JSON.stringify(['TextQuoteSelector', 'TextPositionSelector'])) throw new Error('Selection did not produce W3C selectors');
if (JSON.stringify(headless.texts) !== JSON.stringify(['Headless comment', 'First follow-up', 'Second follow-up'])) throw new Error(`Queued changes ran out of order: ${headless.texts}`);
if (!headless.placed || headless.status !== 'resolved' || headless.metadata?.actionItem !== true || headless.reactions?.['👍']?.[0] !== 'p1') throw new Error('Headless operations did not apply');
for (const type of ['thread.started', 'comment.added', 'reaction.toggled', 'thread.metadata', 'thread.status']) if (!headless.updates.includes(type)) throw new Error(`No update event for ${type}`);
if (headless.busy[0] !== true || headless.busy.at(-1) !== false) throw new Error('busy events are wrong');
if (headless.paneType !== 'undefined' || headless.uiHosts !== 0 || headless.exportHTML !== 'undefined') throw new Error('The primitive bundle must not include a UI or export');
if (JSON.stringify(headless.keys) !== JSON.stringify(expectedKeys)) throw new Error(`Primitive API changed: ${headless.keys.join(', ')}`);

// The pane lists threads in page order, not creation order; unplaced threads go last.
await page.setContent(uiPage('<main id="content"><p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p></main>'));
const paneOrder = await page.evaluate(() => {
  const C = CollabHTML.comments; const A = CollabHTMLAnchors;
  const content = A.textIndex(document.querySelector('#content')).content;
  const anchorFor = phrase => A.create(content, content.indexOf(phrase), content.indexOf(phrase) + phrase.length);
  const missing = [{ type: 'TextQuoteSelector', exact: 'Not in this page' }];
  const person = { personId: 'p1', personName: 'Order tester' }; const timestamp = new Date().toISOString();
  let state = C.empty('content', '1');
  for (const [threadId, anchor] of [['unplaced', missing], ['third', anchorFor('Third')], ['first', anchorFor('First')], ['second', anchorFor('Second')]]) {
    state = C.startThread(state, { threadId, anchor, commentId: `${threadId}-c`, ...person, timestamp, text: threadId });
  }
  window.collabhtmlComments = CollabHTML.create({ root: '#content', state });
  window.collabhtmlPane = CollabHTMLPane.mount(collabhtmlComments);
  return [...collabhtmlPane.element.shadowRoot.querySelectorAll('article')].map(card => card.dataset.threadId);
});
if (JSON.stringify(paneOrder) !== JSON.stringify(['first', 'second', 'third', 'unplaced'])) throw new Error(`Pane order is ${paneOrder.join(', ')}`);
await page.evaluate(() => collabhtmlComments.destroy());

// Default UI on the primitive: reactions, edit, delete, host actions, badges, avatars, filter and focus.
await page.setContent(uiPage('<main id="content"><p>Alpha beta gamma.</p><p>Delta epsilon.</p></main>'));
await page.evaluate(() => {
  window.ops = []; window.logged = []; window.focused = null;
  // The primitive holds the data. The default UI is mounted on top with host choices.
  window.collabhtmlComments = CollabHTML.create({
    root: '#content', person: { personId: 'me', personName: 'Me' },
    onChange: operation => { window.ops.push(operation.type); }
  });
  collabhtmlComments.on('focus', threadId => { window.focused = threadId; });
  window.collabhtmlPane = CollabHTMLPane.mount(collabhtmlComments, {
    reactions: ['upvote', '🎉'],
    personAvatar: id => (id === 'me' ? 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' : 'javascript:alert(1)'),
    threadBadges: thread => (thread.metadata?.actionItem ? ['Action item'] : []),
    threadActions: [{ label: 'Toggle Action Item', run: (thread, api) => api.updateMetadata({ threadId: thread.threadId }, { actionItem: thread.metadata?.actionItem ? null : true }) }],
    commentActions: [{ label: 'Log comment', run: comment => { window.logged.push(comment.commentId); } }]
  });
  const range = document.createRange(); range.selectNodeContents(document.querySelector('#content p'));
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await page.getByLabel('New comment').fill('Original text');
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByRole('button', { name: 'Comments · 1 open' }).waitFor();

// Reactions: the host chose the keys; one person toggles each on and off.
await page.getByRole('button', { name: '⇧ 0', exact: true }).click();
await page.getByRole('button', { name: '⇧ 1', exact: true }).waitFor();
await page.getByRole('button', { name: '⇧ 1', exact: true }).click();
await page.getByRole('button', { name: '⇧ 0', exact: true }).waitFor();
await page.getByLabel('Add reaction').click();
await page.getByRole('button', { name: '🎉', exact: true }).click();
await page.getByRole('button', { name: '🎉 1', exact: true }).waitFor();
if ((await page.evaluate(() => collabhtmlComments.getState().comments[0].reactions))['🎉'][0] !== 'me') throw new Error('Reaction was not stored by personId');

// Edit: only the author's own comment offers Edit; the edited marker appears.
await page.getByLabel('More actions').click();
await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
await page.getByLabel('Edit comment').fill('Edited text');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Edited text', { exact: true }).waitFor();
await page.getByText('(edited)', { exact: true }).waitFor();

// Host comment action receives a copy of the comment.
await page.getByLabel('More actions').click();
await page.getByRole('menuitem', { name: 'Log comment', exact: true }).click();
await page.waitForFunction(() => window.logged.length === 1);

// A thread action calls updateMetadata; the host badge appears.
await page.getByLabel('More actions').click();
await page.getByRole('menuitem', { name: 'Toggle Action Item', exact: true }).click();
await page.getByText('Action item', { exact: true }).waitFor();
if (!(await page.evaluate(() => collabhtmlComments.getState().threads[0].metadata.actionItem))) throw new Error('Action item metadata was not stored');

// Avatars: a data:image URL renders; an unsafe URL is ignored.
await page.evaluate(() => {
  const C = CollabHTML.comments; const state = collabhtmlComments.getState();
  collabhtmlComments.setState(C.apply(state, { type: 'comment.added', comment: { commentId: 'other-c', threadId: state.threads[0].threadId, personId: 'other', personName: 'Other', timestamp: new Date().toISOString(), text: 'From someone else.' } }));
});
const avatars = await page.evaluate(() => [...collabhtmlPane.element.shadowRoot.querySelectorAll('img.avatar')].map(image => image.src.slice(0, 10)));
if (avatars.length !== 1 || avatars[0] !== 'data:image') throw new Error(`Unexpected avatars: ${avatars.join(', ')}`);
// Someone else's comment offers no Edit or Delete.
await page.getByLabel('More actions').nth(1).click();
if (await page.getByRole('menuitem', { name: 'Edit', exact: true }).count() !== 0) throw new Error('Edit offered on another person comment');
if (await page.getByRole('menuitem', { name: 'Resolve', exact: true }).count() !== 0) throw new Error('Thread actions offered on a follow-up comment');
await page.getByLabel('More actions').nth(1).click();

// Delete: asks first, then leaves a tombstone.
await page.getByLabel('More actions').first().click();
await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
await page.getByText('Delete this comment?').waitFor();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByText('This comment was deleted.').waitFor();
if (!(await page.evaluate(() => collabhtmlComments.getState().comments[0].deleted))) throw new Error('Tombstone missing');

// Resolve records who; the filter hides it; focus() brings it back.
await page.getByLabel('More actions').first().click();   // the deleted first comment still carries the thread actions
await page.getByRole('menuitem', { name: 'Resolve', exact: true }).click();
await page.getByText('Resolved by Me').waitFor();
await page.getByLabel('Show', { exact: true }).selectOption('open');
await page.getByText('No comments match this filter.').waitFor();
const focusResult = await page.evaluate(() => {
  const threadId = collabhtmlComments.getState().threads[0].threadId;
  return { found: collabhtmlComments.focus(threadId), unknown: collabhtmlComments.focus('missing'), focused: window.focused === threadId, threadId };
});
if (!focusResult.found || focusResult.unknown || !focusResult.focused) throw new Error('focus() or the focus event failed');
if (await page.getByLabel('Show', { exact: true }).inputValue() !== 'all') throw new Error('focus() did not reveal a hidden thread');
if (!(await page.evaluate(id => collabhtmlPane.element.shadowRoot.activeElement?.dataset.threadId === id, focusResult.threadId))) throw new Error('focus() did not move keyboard focus to the thread');
await page.getByLabel('Show', { exact: true }).selectOption('mine');
await page.getByRole('article').count();

// Methods fill the actor from the current person; a failed change rejects.
const direct = await page.evaluate(async () => {
  const threadId = collabhtmlComments.getState().threads[0].threadId;
  const result = await collabhtmlComments.setStatus(threadId, 'open');
  const rejected = await collabhtmlComments.setStatus('missing', 'open').then(() => false, () => true);
  const thread = collabhtmlComments.getState().threads[0];
  return { ok: Boolean(result.state), rejected, status: thread.status, by: thread.statusChange.personName, ops: window.ops };
});
if (!direct.ok || !direct.rejected || direct.status !== 'open' || direct.by !== 'Me') throw new Error('setStatus() failed');
for (const type of ['thread.started', 'reaction.toggled', 'comment.edited', 'comment.deleted', 'thread.metadata', 'thread.status']) {
  if (!direct.ops.includes(type)) throw new Error(`onChange never received ${type}`);
}
await page.evaluate(() => collabhtmlComments.destroy());
// A link to a thread that does not exist must not break startup.
await page.goto('http://127.0.0.1:4173/?link-check=1#thread=missing');
await page.getByRole('button', { name: 'Comments · 0 open' }).waitFor();
await page.evaluate(() => collabhtmlComments.destroy());
await page.goto('http://127.0.0.1:4173');
return { passed: ['thread start', 'follow-up shares threadId', 'person/commentId/timestamp fields', 'resolve/reopen', 'safe HTML export', 'export round-trip', 'unplaced anchor', 'rejected operation', 'operation + host-confirmed state', 'setState validation', 'headless primitive: methods, events, queue, no UI', 'threads listed in page order', 'reactions toggle per person', 'edit marker and own-comment edit only', 'host comment action', 'thread action via updateMetadata + badge', 'safe avatar URLs', 'delete tombstone', 'resolve records who', 'filter + focus() + focus event', 'methods fill the actor', 'Locate updates link', 'unknown thread link is harmless'] };
