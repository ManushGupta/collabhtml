// Responsibility: example upload, isolation, operation-based file storage, refresh, and export E2E.
// Run: browser-control execute --file tests/viewer-browser-smoke.js
await page.goto('http://127.0.0.1:4173/examples/viewer/index.html');
await page.getByRole('button', { name: 'Open sample HTML' }).click();
const artifact = page.frameLocator('#artifact');
await artifact.getByRole('heading', { name: 'Comments', exact: true }).waitFor();

// Upload a unique fixture so this test does not edit anyone's existing comments.
const fixture = `<!doctype html><html><head><title>Upload test</title></head><body><main id="fixture"><h1>Uploaded report</h1><p>Comment on this uploaded sentence ${Date.now()}.</p><script>window.untrustedScriptRan=true</script></main></body></html>`;
async function upload() {
  await page.locator('#upload').evaluate((input, source) => {
    const data = new DataTransfer(); data.items.add(new File([source], 'fixture.html', { type: 'text/html' }));
    input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, fixture);
}
await upload();
await artifact.getByRole('button', { name: 'Comments · 0 open' }).waitFor();
const isolation = await artifact.locator('body').evaluate(body => {
  const win = body.ownerDocument.defaultView;
  let canReadHost = false;
  try { canReadHost = Boolean(win.parent.document); } catch (_) {}
  return { canReadHost, untrustedScriptRan: Boolean(win.untrustedScriptRan) };
});
if (isolation.canReadHost || isolation.untrustedScriptRan) throw new Error('Uploaded HTML isolation failed');
await artifact.getByText('Commenting as', { exact: true }).waitFor();
await artifact.locator('#fixture p').evaluate(paragraph => {
  const doc = paragraph.ownerDocument; const range = doc.createRange(); range.selectNodeContents(paragraph);
  const selection = doc.defaultView.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  doc.dispatchEvent(new doc.defaultView.MouseEvent('mouseup', { bubbles: true }));
});
await artifact.getByLabel('New comment').fill('Server file storage works.');
await artifact.getByRole('button', { name: 'Add comment', exact: true }).click();
await artifact.getByText('Comments updated.', { exact: true }).waitFor();
const documentIdentity = await artifact.locator('body').evaluate(body => body.ownerDocument.defaultView.collabhtmlComments.getState().document);
const api = query => page.evaluate(async ([identity]) => {
  const response = await fetch(`/api/comments?${new URLSearchParams({ document: identity.id, revision: identity.revision })}`);
  return response.json();
}, [documentIdentity]);
const stored = await api();
const [first] = stored.comments;
if (stored.comments.length !== 1 || first.personName !== 'Demo person' || !first.personId.startsWith('example-person:')) throw new Error('Comment was not persisted with person fields');

// The viewer chose the reaction list and one thread action; both persist through the server.
await artifact.getByLabel('Add reaction').click();
await artifact.getByRole('button', { name: '🎉', exact: true }).click();
await artifact.getByRole('button', { name: '🎉 1', exact: true }).waitFor();
await artifact.getByLabel('More actions').click();
await artifact.getByRole('menuitem', { name: 'Toggle Action Item', exact: true }).click();
await artifact.getByText('Action item', { exact: true }).waitFor();
const decorated = await api();
if (decorated.comments[0].reactions?.['🎉']?.[0] !== first.personId) throw new Error('Reaction was not persisted with personId');
if (decorated.threads[0].metadata?.actionItem !== true) throw new Error('Action item metadata was not persisted');

// Another person adds a follow-up directly through the API; Refresh shows it via setState.
await page.evaluate(async ([identity, threadId]) => {
  const operation = { type: 'comment.added', comment: { commentId: crypto.randomUUID(), threadId, personId: 'example-person:other', personName: 'Other person', timestamp: new Date().toISOString(), text: 'Follow-up from someone else.' } };
  const response = await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: identity, operation }) });
  if (!response.ok) throw new Error((await response.json()).error);
}, [documentIdentity, first.threadId]);
await artifact.getByRole('button', { name: 'Refresh', exact: true }).click();
await artifact.getByText('Follow-up from someone else.').waitFor();

await page.reload();
await upload();
await artifact.getByText('Follow-up from someone else.').waitFor();
const exported = await artifact.locator('body').evaluate(body => {
  const win = body.ownerDocument.defaultView;
  return win.CollabHTML.exportHTML({ root: body, state: win.collabhtmlComments.getState(),
    runtimeSource: body.ownerDocument.querySelector('script[data-collabhtml-runtime]').textContent,
    bootstrapSource: JSON.parse(body.ownerDocument.querySelector('script[data-collabhtml-bootstrap]').dataset.config).exportBootstrap
  });
});
if (exported.includes('collabhtml:request')) throw new Error('Export retained host bridge');
if (!exported.includes('Server file storage works.') || !exported.includes('Follow-up from someone else.')) throw new Error('Export lost comments');
return { passed: ['automatic injection', 'HTML upload', 'sandbox isolation', 'document scripts disabled', 'operation saved with person fields', 'follow-up from another person via API', 'viewer-supplied reactions persist', 'viewer thread action stores metadata + badge', 'Refresh uses setState', 'persistence across viewer reload', 'export without host bridge'] };
