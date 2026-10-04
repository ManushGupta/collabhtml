// Responsibility: DOM for one thread card — quote, comments, reactions, popover menus, edit/delete, inline reply.
// Part of the default UI. Builds elements and reports user intent through callbacks; the pane owns styles and layout.
import type { Comment, TextQuoteSelector, Thread } from '../src/comments.js';

export interface UiState {
  editing: string | null;
  deleting: string | null;
  menu: string | null;
  picker: string | null;
  drafts: Record<string, string>;
}
export interface PaneAction {
  label: string;
  run: (...args: any[]) => unknown;
}
export interface ThreadCtx {
  reactions: string[];
  commentActions: PaneAction[];
  threadActions: PaneAction[];
  ui: UiState;
  setUi: (patch: Partial<UiState>) => void;
  avatarUrl: (personId: string) => string | undefined | null;
  badges: (thread: Thread) => string[];
  onCopy: (text: string) => Promise<void>;
  personId: () => string;
  isMine: (personId: string) => boolean;
  onReply: (threadId: string, text: string) => Promise<boolean>;
  onStatus: (threadId: string, status: 'open' | 'resolved') => Promise<boolean>;
  onReact: (commentId: string, key: string) => Promise<boolean>;
  onEdit: (commentId: string, text: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
  onLocate: (threadId: string) => unknown;
  onThreadAction: (index: number, threadId: string) => unknown;
  onCommentAction: (index: number, commentId: string) => unknown;
}
export type IconPart = [string, Record<string, string | number>];

const SVG_NS = 'http://www.w3.org/2000/svg';
const dots: IconPart[] = [5, 12, 19].map((cx: number): IconPart => ['circle', { cx, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }]);
const ICONS: Record<string, IconPart[]> = {
  more: dots,
  smile: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }], ['path', { d: 'M9 9h.01' }], ['path', { d: 'M15 9h.01' }]],
  copy: [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  check: [['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['path', { d: 'M22 4 12 14.01l-3-3' }]],
  reopen: [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
  edit: [['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }]],
  trash: [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }], ['path', { d: 'M10 11v6' }], ['path', { d: 'M14 11v6' }], ['path', { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }]],
  close: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]]
};
export function icon(name: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, String(value));
  for (const [tag, attributes] of ICONS[name]) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, String(value));
    svg.append(part);
  }
  return svg;
}
// Create an element of any kind. Returns `any` because callers use
// kind-specific properties (value, type, href) that no single DOM type has.
export function node(tag: string, text?: string, className?: string): any {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function button(label: string, action: () => void, className?: string): any {
  const result = node('button', label, className);
  result.type = 'button'; result.addEventListener('click', action); return result;
}
export function iconButton(name: string, label: string, action: () => void): any {
  const result = node('button', undefined, 'icon-btn');
  result.type = 'button'; result.setAttribute('aria-label', label); result.title = label;
  result.append(icon(name)); result.addEventListener('click', action); return result;
}
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
const safeImageUrl = (value: unknown): string | null => (typeof value === 'string' && /^(https?:\/\/|data:image\/)/i.test(value) ? value : null);
const reactionLabel = (key: string): string => (key === 'upvote' ? '⇧' : key);

// An image when the host supplies a safe URL, otherwise a colored circle with the person's initial.
function avatar(comment: Comment, ctx: ThreadCtx): any {
  const url = safeImageUrl(ctx.avatarUrl(comment.personId));
  if (url) { const image = node('img', undefined, 'avatar'); image.src = url; image.alt = ''; image.referrerPolicy = 'no-referrer'; return image; }
  let hue = 0; for (const character of comment.personId) hue = (hue * 31 + (character.codePointAt(0) ?? 0)) % 360;
  const circle = node('span', (comment.personName.trim()[0] || '?').toUpperCase(), 'avatar');
  circle.style.background = `hsl(${hue} 50% 42%)`; return circle;
}
// Items are { label, icon?, danger?, run }. Groups are separated by a line.
export interface MenuEntry {
  label: string;
  icon?: string;
  danger?: boolean;
  run: () => void;
}
function popover(groups: MenuEntry[][], side: string, role: string): any {
  const box = node('div', undefined, `popover ${side}`); box.setAttribute('role', role);
  groups.filter(group => group.length).forEach((group, index) => {
    if (index) box.append(node('div', undefined, 'divider'));
    for (const item of group) {
      const entry = node('button', undefined, item.danger ? 'menu-item danger-text' : 'menu-item');
      entry.type = 'button'; entry.setAttribute('role', 'menuitem');
      entry.append(item.icon ? icon(item.icon) : node('span', undefined, 'icon-slot'), node('span', item.label));
      entry.addEventListener('click', item.run); box.append(entry);
    }
  });
  return box;
}

// ctx: reactions, commentActions, threadActions, ui { editing, deleting, menu, picker, drafts },
//      avatarUrl(id), badges(thread), personId(), isMine(id), and the on* callbacks supplied by the pane.
export function renderComment(comment: Comment, thread: Thread, isRoot: boolean, ctx: ThreadCtx): any {
  const row = node('div', undefined, 'comment'); row.dataset.commentId = comment.commentId;
  const head = node('div', undefined, 'person');
  const time = node('span', relativeTime(comment.timestamp), 'time'); time.title = new Date(comment.timestamp).toLocaleString();
  head.append(avatar(comment, ctx), node('span', comment.personName, 'name'));
  if (comment.edited) head.append(node('span', '(edited)', 'muted'));
  head.append(time); row.append(head);

  // The first comment's menu also holds the thread's actions, so a thread has no separate menu.
  const threadItems: MenuEntry[] = !isRoot ? [] : [
    { label: thread.status === 'open' ? 'Resolve' : 'Reopen', icon: thread.status === 'open' ? 'check' : 'reopen', run: () => { ctx.setUi({ menu: null }); ctx.onStatus(thread.threadId, thread.status === 'open' ? 'resolved' : 'open'); } },
    ...ctx.threadActions.map((action, index) => ({ label: action.label, run: () => { ctx.setUi({ menu: null }); ctx.onThreadAction(index, thread.threadId); } }))
  ];
  const commentItems: MenuEntry[] = comment.deleted ? [] : [
    ...(ctx.isMine(comment.personId) ? [
      { label: 'Edit', icon: 'edit', run: () => ctx.setUi({ editing: comment.commentId, deleting: null, menu: null }) },
      { label: 'Delete', icon: 'trash', danger: true, run: () => ctx.setUi({ deleting: comment.commentId, editing: null, menu: null }) }] : []),
    ...ctx.commentActions.map((action, index) => ({ label: action.label, run: () => { ctx.setUi({ menu: null }); ctx.onCommentAction(index, comment.commentId); } }))
  ];
  const menuGroups = [threadItems, commentItems];
  const moreMenu = (): any => {
    const wrap = node('div', undefined, 'anchor end');
    const trigger = iconButton('more', 'More actions', () => ctx.setUi({ menu: ctx.ui.menu === comment.commentId ? null : comment.commentId, picker: null }));
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', String(ctx.ui.menu === comment.commentId));
    wrap.append(trigger);
    if (ctx.ui.menu === comment.commentId) wrap.append(popover(menuGroups, 'right', 'menu'));
    return wrap;
  };
  const hasMenu = menuGroups.some(group => group.length);

  if (comment.deleted) {
    row.append(node('p', 'This comment was deleted.', 'message muted'));
    if (hasMenu) { const tools = node('div', undefined, 'row-tools'); tools.append(moreMenu()); row.append(tools); }
    return row;
  }
  if (ctx.ui.editing === comment.commentId) {
    const form = node('form', undefined, 'edit'); const input = node('textarea');
    input.value = comment.text; input.maxLength = 20000; input.setAttribute('aria-label', 'Edit comment');
    const actions = node('div', undefined, 'actions');
    const save = node('button', 'Save', 'btn primary'); save.type = 'submit';
    actions.append(save, button('Cancel', () => ctx.setUi({ editing: null }), 'btn')); form.append(input, actions);
    form.addEventListener('submit', async (event: SubmitEvent) => {
      event.preventDefault();
      if (await ctx.onEdit(comment.commentId, input.value.trim())) ctx.setUi({ editing: null });
    });
    row.append(form); return row;
  }
  row.append(node('p', comment.text, 'message'));
  if (ctx.ui.deleting === comment.commentId) {
    const confirm = node('div', undefined, 'actions'); confirm.append(node('span', 'Delete this comment?', 'muted'));
    confirm.append(button('Delete', async () => { if (await ctx.onDelete(comment.commentId)) ctx.setUi({ deleting: null }); }, 'btn danger'),
      button('Cancel', () => ctx.setUi({ deleting: null }), 'btn'));
    row.append(confirm); return row;
  }

  // Action row: the first reaction is always shown (like an upvote), the others once someone uses them.
  const tools = node('div', undefined, 'row-tools');
  const keys = [...new Set([...ctx.reactions.slice(0, 1), ...Object.keys(comment.reactions || {})])];
  for (const key of keys) {
    const people = comment.reactions?.[key] || []; const mine = people.includes(ctx.personId());
    const chip = button(`${reactionLabel(key)} ${people.length}`, () => ctx.onReact(comment.commentId, key), mine ? 'chip active' : 'chip');
    chip.setAttribute('aria-pressed', String(mine)); chip.title = key; tools.append(chip);
  }
  if (ctx.reactions.length > 1) {
    const wrap = node('div', undefined, 'anchor');
    const trigger = iconButton('smile', 'Add reaction', () => ctx.setUi({ picker: ctx.ui.picker === comment.commentId ? null : comment.commentId, menu: null }));
    trigger.setAttribute('aria-expanded', String(ctx.ui.picker === comment.commentId)); wrap.append(trigger);
    if (ctx.ui.picker === comment.commentId) {
      const box = node('div', undefined, 'popover left options'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Reactions');
      for (const key of ctx.reactions) box.append(button(reactionLabel(key), () => { ctx.setUi({ picker: null }); ctx.onReact(comment.commentId, key); }, 'chip'));
      wrap.append(box);
    }
    tools.append(wrap);
  }
  tools.append(iconButton('copy', 'Copy text', () => ctx.onCopy(comment.text)));
  if (hasMenu) tools.append(moreMenu());
  row.append(tools);
  return row;
}

export function renderThread(thread: Thread, threadComments: Comment[], placed: boolean, ctx: ThreadCtx): any {
  const card = node('article', undefined, thread.status === 'resolved' ? 'resolved' : ''); card.tabIndex = -1; card.dataset.threadId = thread.threadId;
  const badges = [...(thread.status === 'resolved' ? [['Resolved', 'badge resolved']] : []), ...(placed ? [] : [['Unplaced', 'badge']]), ...ctx.badges(thread).map(label => [label, 'badge'])];
  if (badges.length) { const row = node('div', undefined, 'badges'); for (const [label, className] of badges) row.append(node('span', label, className)); card.append(row); }
  // The quoted text is a button: it scrolls to that text in the page.
  const quote = node('button', undefined, 'quote');
  quote.append(node('span', (thread.anchor.find(selector => selector.type === 'TextQuoteSelector') as TextQuoteSelector).exact, 'quote-text'));
  quote.type = 'button'; quote.title = 'Show in page'; quote.addEventListener('click', () => ctx.onLocate(thread.threadId)); card.append(quote);
  // Provenance: comments were written against earlier text. Show where the thread started.
  for (const record of thread.anchorHistory || []) {
    const prior = record.anchor.find(selector => selector.type === 'TextQuoteSelector') as TextQuoteSelector | undefined;
    if (prior) card.append(node('p', `Originally on “${prior.exact}”`, 'muted'));
  }
  if (thread.status === 'resolved' && thread.statusChange) card.append(node('p', `Resolved by ${thread.statusChange.personName}`, 'muted'));
  threadComments.forEach((comment, index) => card.append(renderComment(comment, thread, index === 0, ctx)));

  // Reply is one inline input. Enter sends. The draft survives re-renders.
  const form = node('form', undefined, 'reply-box'); const input = node('input');
  input.type = 'text'; input.placeholder = 'Reply…'; input.setAttribute('aria-label', 'Reply'); input.maxLength = 20000; input.autocomplete = 'off';
  input.value = ctx.ui.drafts[thread.threadId] || '';
  input.addEventListener('input', () => { ctx.ui.drafts[thread.threadId] = input.value; });
  form.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault();
    const text = input.value.trim(); if (!text) return;
    delete ctx.ui.drafts[thread.threadId];
    if (!(await ctx.onReply(thread.threadId, text))) ctx.ui.drafts[thread.threadId] = text;
  });
  form.append(input); card.append(form);
  return card;
}

