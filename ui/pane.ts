// Responsibility: the default comments UI — pane shell, styles, header, compose form, filter, and list layout.
// Built only on the primitive's public API: methods, view(), and events. Thread cards come from threads.js.
import { icon, renderThread } from './threads.js';
import type { PaneAction, ThreadCtx, UiState } from './threads.js';
import { createId } from '../src/comments.js';
import type { Anchor, Comment, TextQuoteSelector, Thread } from '../src/comments.js';
import type { Controller } from '../src/controller.js';

export { icon, renderThread };
export type { PaneAction, ThreadCtx, UiState };

export interface PaneOptions {
  open?: boolean;
  filter?: string;
  actions?: PaneAction[];
  reactions?: string[];
  threadActions?: PaneAction[];
  commentActions?: PaneAction[];
  personAvatar?: (personId: string) => any;
  threadBadges?: (thread: Thread) => any;
}

const styles = `
    :host { all: initial; font: 14px/1.5 system-ui,-apple-system,sans-serif; color:#1f2937; --accent:#6d3fc2; --accent-soft:#f3edfc; --line:#e5e7eb; --muted:#6b7280; }
    * { box-sizing:border-box; } button,input,textarea,select { font:inherit; color:inherit; } button { cursor:pointer; }
    button:disabled { opacity:.5; cursor:wait; }
    .btn { border:1px solid var(--line); background:#fff; border-radius:8px; padding:5px 11px; font-size:13px; }
    .btn:hover { background:#f9fafb; }
    .btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; } .btn.primary:hover { filter:brightness(1.08); }
    .btn.danger { background:#b91c1c; border-color:#b91c1c; color:#fff; }
    .icon-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--muted); }
    .icon-btn:hover, .icon-btn[aria-expanded=true] { background:#f3f4f6; color:#111827; }
    .toggle { position:fixed; right:20px; top:16px; background:#fff; border:1px solid var(--line); border-radius:999px; padding:7px 14px; font-size:13px; box-shadow:0 2px 10px #0000001f; }
    .panel { position:fixed; top:64px; right:20px; bottom:20px; width:380px; max-width:calc(100vw - 40px); display:flex; flex-direction:column; background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:0 12px 40px #0000002e; overflow:hidden; }
    .panel[hidden] { display:none; }
    header { padding:12px 12px 10px 16px; border-bottom:1px solid var(--line); }
    .top { display:flex; align-items:center; gap:8px; } .spacer { flex:1; }
    h2 { font-size:16px; margin:0; } .count { color:var(--muted); font-size:14px; }
    select { border:1px solid var(--line); border-radius:8px; padding:4px 8px; background:#fff; font-size:13px; }
    .tools { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .body { overflow:auto; flex:1; padding:12px 14px; background:#f9fafb; }
    label { display:block; font-size:12px; font-weight:600; color:var(--muted); margin-bottom:4px; }
    .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; margin:0; }
    input, textarea { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    input:focus, textarea:focus, select:focus, button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
    textarea { resize:none; min-height:64px; display:block; }
    p { margin:4px 0; } .muted { color:var(--muted); font-size:12px; } .error { color:#b91c1c; font-size:12px; }
    .name-field { margin-bottom:10px; }
    .compose { padding:10px; background:var(--accent-soft); border-radius:10px; margin:0 0 12px; }
    .compose .quote-preview { border-left:3px solid var(--accent); padding:2px 0 2px 10px; margin:0 0 8px; font-size:13px; color:#374151; overflow-wrap:anywhere; }
    .actions { display:flex; align-items:center; gap:6px; margin-top:8px; }
    article { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; margin:0 0 12px; box-shadow:0 1px 2px #0000000d; }
    article.resolved { opacity:.72; } article:focus { outline:2px solid var(--accent); }
    .badges { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
    .badge { font-size:11px; padding:1px 8px; border-radius:999px; background:#f3f4f6; color:#374151; } .badge.resolved { background:#dcfce7; color:#166534; }
    .quote { display:block; width:100%; text-align:left; border:0; border-left:3px solid var(--accent); background:var(--accent-soft); border-radius:6px; padding:7px 10px; margin:0 0 4px; font-size:13px; color:#374151; overflow-wrap:anywhere; }
    .quote-text { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
    .quote:hover { background:#ebe0fa; }
    .comment { margin-top:12px; } .person { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--muted); }
    .name { font-weight:600; font-size:13px; color:#111827; } .time { margin-left:auto; }
    .avatar { width:24px; height:24px; border-radius:50%; object-fit:cover; flex:none; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:700; }
    .message { white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0 4px; }
    .row-tools { display:flex; align-items:center; gap:2px; }
    .chip { display:inline-flex; align-items:center; gap:4px; height:26px; padding:0 9px; margin-right:4px; border:1px solid var(--line); border-radius:999px; background:#fff; font-size:12px; }
    .chip:hover { background:#f9fafb; } .chip.active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
    .anchor { position:relative; } .anchor.end { margin-left:auto; }
    .popover { position:absolute; z-index:5; top:calc(100% + 4px); min-width:200px; display:flex; flex-direction:column; padding:6px; background:#fff; border:1px solid var(--line); border-radius:10px; box-shadow:0 10px 30px #0000002e; }
    .popover.right { right:0; } .popover.left { left:0; } .popover.options { flex-direction:row; width:max-content; gap:4px; min-width:0; }
    .popover.options .chip { margin:0; font-size:14px; }
    .menu-item { display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:0; border-radius:6px; background:transparent; text-align:left; }
    .menu-item:hover { background:#f3f4f6; } .danger-text { color:#b91c1c; }
    .icon-slot { width:16px; height:16px; flex:none; } .divider { height:1px; margin:4px 2px; background:var(--line); }
    .edit { margin-top:6px; } .edit textarea { min-height:72px; }
    .reply-box { margin-top:12px; } .reply-box input { border-radius:999px; padding:8px 14px; }
    footer { padding:8px 16px; background:#fff; border-top:1px solid var(--line); }
    .empty { padding:28px 0; text-align:center; }
    @media(max-width:600px) { .panel { top:auto; bottom:0; left:0; right:0; width:100%; max-width:none; height:70vh; border-radius:16px 16px 0 0; } }
  `;

function node(tag: string, text?: string, className?: string): any {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(label: string, action: () => void, className?: string): any {
  const result = node('button', label, className);
  result.type = 'button'; result.addEventListener('click', action); return result;
}
const FILTERS = ['all', 'open', 'resolved', 'mine'];
const quoteOf = (anchor: Anchor): string => (anchor.find(selector => selector.type === 'TextQuoteSelector') as TextQuoteSelector).exact;
function actionList(value: any, name: string): PaneAction[] {
  const list = value === undefined ? [] : value;
  if (!Array.isArray(list) || list.some(action => typeof action?.label !== 'string' || !action.label.trim() || typeof action.run !== 'function')) throw new Error(`Invalid ${name}`);
  return list;
}
function optionalFunction(value: any, name: string): ((...args: any[]) => unknown) | undefined {
  if (value !== undefined && typeof value !== 'function') throw new Error(`${name} must be a function`);
  return value;
}

// Options (all optional):
//   open, filter, actions, reactions, threadActions, commentActions, personAvatar, threadBadges
export function mount(comments: Controller, options: PaneOptions = {}): { element: any; destroy: () => void } {
  if (!comments || typeof comments.view !== 'function' || typeof comments.on !== 'function') throw new Error('mount(comments): pass the controller returned by create()');
  const actions = actionList(options.actions, 'actions');
  const threadActions = actionList(options.threadActions, 'threadActions');
  const commentActions = actionList(options.commentActions, 'commentActions');
  optionalFunction(options.personAvatar, 'personAvatar'); optionalFunction(options.threadBadges, 'threadBadges');
  const reactions = options.reactions === undefined ? ['👍'] : options.reactions;
  if (!Array.isArray(reactions) || reactions.length > 12 || reactions.some(key => typeof key !== 'string' || !key.trim() || key.length > 50)) throw new Error('Invalid reactions');
  const startFilter = options.filter === undefined ? 'all' : options.filter;
  if (!FILTERS.includes(startFilter)) throw new Error('Invalid filter');

  // Without a host-supplied person, ask for a name and use an unverified ID for this page session only.
  const hostPerson = comments.getPerson();
  const localPersonId = hostPerson ? null : `local-${createId()}`;
  const currentPersonId = (): string | null => comments.getPerson()?.personId ?? localPersonId;
  let busy = false; let destroyed = false;
  let selectedAnchor: Anchor | null = null;

  const ui: UiState = { editing: null, deleting: null, menu: null, picker: null, drafts: {} };

  const host = node('div'); host.dataset.collabhtmlUi = ''; host.style.cssText = 'position:relative;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'open' }) as ShadowRoot; shadow.append(node('style', styles));
  const panel = node('section', undefined, 'panel'); panel.setAttribute('aria-label', 'Comments'); panel.hidden = options.open === false;
  const setOpen = (open: boolean): void => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  const toggle = button('Comments', () => { setOpen(panel.hidden); if (!panel.hidden && !hostPerson) nameInput.focus(); }, 'toggle');
  toggle.setAttribute('aria-expanded', String(!panel.hidden));

  const header = node('header'); const top = node('div', undefined, 'top');
  const count = node('span', '0', 'count');
  const filterLabel = node('label', 'Show', 'sr-only'); filterLabel.htmlFor = 'collabhtml-filter';
  const filter = node('select'); filter.id = 'collabhtml-filter';
  for (const [value, label] of [['all', 'All comments'], ['open', 'Open'], ['resolved', 'Resolved'], ['mine', 'Mine']]) {
    const option = node('option', label); option.value = value; filter.append(option);
  }
  filter.value = startFilter;
  const close = node('button', undefined, 'icon-btn'); close.type = 'button'; close.title = 'Close comments'; close.setAttribute('aria-label', 'Close comments');
  close.append(icon('close')); close.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  top.append(node('h2', 'Comments'), count, node('span', undefined, 'spacer'), filterLabel, filter, close); header.append(top);
  const status = node('p', 'Select text to add a comment.', 'muted'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const report = (message: string, error = false): void => { status.textContent = message; status.className = error ? 'error' : 'muted'; };
  async function runAction(action: PaneAction, subject: any): Promise<void> {
    if (!subject) return;
    try { await action.run(subject, comments); } catch (error) { report((error as any).message || 'Action failed.', true); }
  }
  if (actions.length) {
    const tools = node('div', undefined, 'tools');
    actions.forEach(action => tools.append(button(action.label, async () => {
      try { await action.run(comments); } catch (error) { report((error as any).message || 'Action failed.', true); }
    }, 'btn')));
    header.append(tools);
  }

  const body = node('div', undefined, 'body');
  const nameField = node('div', undefined, 'name-field');
  const nameLabel = node('label', hostPerson ? 'Commenting as' : 'Your name');
  const nameInput = node('input'); nameInput.value = hostPerson?.personName || ''; nameInput.maxLength = 200; nameInput.id = 'collabhtml-person-name';
  nameInput.readOnly = Boolean(hostPerson); nameLabel.htmlFor = nameInput.id; nameField.append(nameLabel, nameInput);
  const compose = node('form', undefined, 'compose'); compose.hidden = true;
  const quote = node('p', undefined, 'quote-preview');
  const commentInput = node('textarea'); commentInput.placeholder = 'Add a comment'; commentInput.setAttribute('aria-label', 'New comment'); commentInput.maxLength = 20000;
  const composeActions = node('div', undefined, 'actions');
  const submit = node('button', 'Add comment', 'btn primary'); submit.type = 'submit';
  composeActions.append(submit, button('Cancel', () => { selectedAnchor = null; compose.hidden = true; commentInput.value = ''; }, 'btn'));
  compose.append(quote, commentInput, composeActions);
  const list = node('div'); body.append(nameField, compose, list);
  const footer = node('footer'); footer.append(status); panel.append(header, body, footer); shadow.append(toggle, panel); document.body.append(host);

  const setBusy = (value: boolean): void => { busy = value; shadow.querySelectorAll('button').forEach((element: HTMLButtonElement) => { element.disabled = value; }); };
  function ensurePerson(): void {
    const existing = comments.getPerson();
    if (existing && existing.personId !== localPersonId) return;
    const personName = nameInput.value.trim();
    if (!personName) throw new Error('Enter your name first.');
    comments.setPerson({ personId: localPersonId!, personName });
  }
  // Runs a change through the primitive and reports the result. Returns true on success.
  async function perform(task: () => Promise<unknown>): Promise<boolean> {
    try { ensurePerson(); report('Updating comments…'); await task(); report('Comments updated.'); return true; }
    catch (error) { report((error as any).message || 'Change failed. Existing comments are unchanged.', true); return false; }
  }
  async function copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); report('Copied.'); }
    catch { report('Could not copy. Select the text and copy it manually.', true); }
  }
  const avatarUrl = (personId: string): string | undefined | null => { try { return options.personAvatar?.(personId); } catch { return null; } };
  const badges = (thread: Thread): string[] => {
    try {
      const list = options.threadBadges?.(thread);
      return Array.isArray(list) ? list.filter(item => typeof item === 'string' && item.trim() && item.length <= 40).slice(0, 5) : [];
    } catch { return []; }
  };
  const visible = (thread: Thread, threadComments: Comment[]): boolean => {
    if (filter.value === 'open' || filter.value === 'resolved') return thread.status === filter.value;
    if (filter.value === 'mine') return threadComments.some(comment => comment.personId === currentPersonId());
    return true;
  };
  function setUi(patch: Partial<UiState>): void { Object.assign(ui, patch); render(); }
  const closePopovers = (): void => { if (ui.menu || ui.picker) setUi({ menu: null, picker: null }); };

  function render(): void {
    if (destroyed) return;
    const view = comments.view();
    const open = view.filter(item => item.thread.status === 'open').length;
    toggle.textContent = `Comments · ${open} open`; count.textContent = String(view.length); list.replaceChildren();
    const ctx: ThreadCtx = {
      reactions, commentActions, threadActions, ui, setUi, avatarUrl, badges, onCopy: copy,
      personId: () => currentPersonId()!, isMine: personId => personId === currentPersonId(),
      onReply: (threadId, text) => perform(() => comments.addComment({ threadId, text })),
      onStatus: (threadId, nextStatus) => perform(() => comments.setStatus(threadId, nextStatus)),
      onReact: (commentId, key) => perform(() => comments.toggleReaction(commentId, key)),
      onEdit: (commentId, text) => perform(() => comments.editComment(commentId, text)),
      onDelete: commentId => perform(() => comments.deleteComment(commentId)),
      onLocate: threadId => comments.focus(threadId),
      onThreadAction: (index, threadId) => runAction(threadActions[index], view.find(item => item.thread.threadId === threadId)?.thread),
      onCommentAction: (index, commentId) => runAction(commentActions[index], view.flatMap(item => item.comments).find(comment => comment.commentId === commentId))
    };
    let shown = 0;
    for (const item of view) {
      if (!visible(item.thread, item.comments)) continue;
      list.append(renderThread(item.thread, item.comments, item.placed, ctx)); shown += 1;
    }
    if (!shown) list.append(node('p', view.length ? 'No comments match this filter.' : 'No comments yet. Select text on the page to start.', 'muted empty'));
    setBusy(busy);
  }
  function showSelection(anchor: Anchor): void {
    selectedAnchor = anchor; quote.textContent = quoteOf(anchor); compose.hidden = false; setOpen(true);
  }
  // Open the pane, make sure the thread is visible, and move keyboard focus to its card.
  function reveal(threadId: string): void {
    setOpen(true);
    const find = (): any => list.querySelector(`[data-thread-id="${CSS.escape(threadId)}"]`);
    let card = find();
    if (!card && filter.value !== 'all') { filter.value = 'all'; render(); card = find(); }
    if (card) { card.scrollIntoView({ block: 'nearest' }); card.focus({ preventScroll: true }); }
    const item = comments.view().find(entry => entry.thread.threadId === threadId);
    if (item && !item.placed) report('The selected text no longer matches this document.', true);
  }
  compose.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault();
    if (!selectedAnchor) return;
    const anchor = selectedAnchor;
    const done = await perform(() => comments.addThread({ anchor, text: commentInput.value.trim() }));
    if (done) { selectedAnchor = null; compose.hidden = true; commentInput.value = ''; window.getSelection()!.removeAllRanges(); }
  });
  filter.addEventListener('change', render);
  // Popovers close on Escape, on a click elsewhere in the pane, and on a click outside it.
  shadow.addEventListener('keydown', (event: Event) => { if ((event as KeyboardEvent).key === 'Escape') closePopovers(); });
  shadow.addEventListener('click', (event: Event) => { if (!(event.target as any)?.closest?.('.anchor')) closePopovers(); });
  const onDocumentClick = (event: MouseEvent): void => { if (!event.composedPath().includes(host)) closePopovers(); };
  document.addEventListener('click', onDocumentClick);

  const unsubscribe = [comments.on('update', render), comments.on('busy', setBusy), comments.on('selection', showSelection), comments.on('focus', reveal), comments.on('destroy', destroy)];
  function destroy(): void {
    if (destroyed) return;
    destroyed = true; unsubscribe.forEach(off => off()); document.removeEventListener('click', onDocumentClick); host.remove();
  }
  render();
  return { element: host, destroy };
}

