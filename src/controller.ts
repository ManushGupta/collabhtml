// Responsibility: the headless primitive. create() connects the Comment API and HTML anchors.
// Methods change comments; events report updates. No UI, storage, networking, export, or startup.
// onChange receives each operation before it is accepted, so a host can store it or refuse it.
import * as C from './comments.js';
import * as A from './anchors.js';
import type { Anchor, Comment, CommentsState, Operation, Person, Thread } from './comments.js';

export type ListenerFn = (detail?: any) => void;
export interface OnChangeContext {
  previous: CommentsState;
  next: CommentsState;
  document: { id: string; revision: string };
}
export interface ControllerOptions {
  root?: string | Element;
  state?: CommentsState;
  person?: Person | null;
  onChange?: (operation: Operation, context: OnChangeContext) => unknown;
  highlight?: boolean;
}
export interface ChangeResult {
  operation: Operation;
  state: CommentsState;
}
export interface ControllerViewItem {
  thread: Thread;
  comments: Comment[];
  placed: boolean;
}
export interface Controller {
  getState: () => CommentsState;
  setState: (value: CommentsState) => void;
  view: () => ControllerViewItem[];
  getPerson: () => Person | null;
  setPerson: (value: Person | null) => void;
  addThread: (input?: { anchor?: Anchor; text?: string; threadId?: string }) => Promise<ChangeResult>;
  addComment: (input?: { threadId?: string; text?: string }) => Promise<ChangeResult>;
  setStatus: (threadId: string, status: 'open' | 'resolved') => Promise<ChangeResult>;
  toggleReaction: (commentId: string, key: string) => Promise<ChangeResult>;
  editComment: (commentId: string, text: string) => Promise<ChangeResult>;
  deleteComment: (commentId: string) => Promise<ChangeResult>;
  updateMetadata: (target: { threadId?: string; commentId?: string }, metadata: Record<string, any>) => Promise<ChangeResult>;
  focus: (threadId: string) => boolean;
  on: (type: string, handler: ListenerFn) => () => void;
  destroy: () => void;
}

const instances = new WeakMap<Element, Controller>();
// update: comments or anchor placement changed.  selection: the user selected text (detail: anchor).
// focus: a thread was focused (detail: threadId).  busy: changes are pending (detail: boolean).
// destroy: the controller is being removed, so a UI can detach.
const EVENTS = ['update', 'selection', 'focus', 'busy', 'destroy'];

export function create(options: ControllerOptions = {}): Controller {
  const root = typeof options.root === 'string' ? document.querySelector(options.root) : (options.root || document.querySelector('main') || document.body);
  if (!root || root.ownerDocument !== document) throw new Error('Comments root must be in this document');
  if (instances.has(root)) throw new Error('This content already has comments attached');
  if (options.onChange !== undefined && typeof options.onChange !== 'function') throw new Error('onChange must be a function');
  let state = C.validate(options.state || C.empty(root.id || 'document'));
  let person: Person | null = options.person === undefined ? null : C.validatePerson(options.person);
  let destroyed = false; let pending = 0; let queue: Promise<void> = Promise.resolve();
  const ranges = new Map<string, Range>();
  const listeners = new Map<string, Set<ListenerFn>>(EVENTS.map(type => [type, new Set<ListenerFn>()]));
  const highlights = options.highlight === false ? null : A.highlight(document, `collabhtml-${C.createId()}`);
  const now = (): string => new Date().toISOString();

  function emit(type: string, detail?: any): void {
    for (const handler of listeners.get(type)!) {
      try { handler(detail); } catch (error) { console.error('CollabHTML listener failed:', error); }
    }
  }
  function checked(value: CommentsState): CommentsState {
    const next = C.validate(value);
    if (next.document.id !== state.document.id || next.document.revision !== state.document.revision) throw new Error('Comments belong to another document revision');
    return next;
  }
  function requirePerson(): Person {
    if (!person) throw new Error('Set the person before changing comments.');
    return person;
  }
  const actorOperation = (base: any): Operation => ({ ...base, ...requirePerson(), timestamp: now() });
  const newComment = (threadId: string, text: string): Comment => ({ commentId: C.createId(), threadId, ...requirePerson(), timestamp: now(), text });

  // Find each thread's text again, update highlights, and tell listeners.
  function refresh(operation?: Operation): void {
    const index = A.textIndex(root!); ranges.clear();
    for (const thread of state.threads) {
      const range = A.toRange(index, A.locate(index.content, thread.anchor));
      if (range) ranges.set(thread.threadId, range);
    }
    highlights?.update(ranges.values());
    emit('update', operation ? { operation: structuredClone(operation) } : {});
  }
  // The host sees a validated operation first. If onChange returns the host's latest
  // state, that state wins. Otherwise the operation is applied to the current state.
  async function commit(makeOperation: () => Operation): Promise<ChangeResult> {
    if (destroyed) throw new Error('Comments are detached');
    const operation = makeOperation();
    const next = C.apply(state, operation);
    const confirmed = await options.onChange?.(structuredClone(operation), { previous: C.validate(state), next, document: { ...state.document } });
    if (destroyed) throw new Error('Comments are detached');
    state = confirmed ? checked(confirmed as CommentsState) : C.apply(state, operation);
    refresh(operation);
    return { operation: structuredClone(operation), state: C.validate(state) };
  }
  // Changes run one at a time, in the order they were requested.
  function change(makeOperation: () => Operation): Promise<ChangeResult> {
    if (destroyed) return Promise.reject(new Error('Comments are detached'));
    pending += 1; if (pending === 1) emit('busy', true);
    const result = queue.then(() => commit(makeOperation));
    queue = result.then(() => {}, () => {}).then(() => { pending -= 1; if (!pending) emit('busy', false); });
    return result;
  }

  function captureSelection(): void {
    if (destroyed) return;
    let anchor: Anchor | null = null;
    try { anchor = A.capture(root!); } catch { return; }
    if (anchor) emit('selection', structuredClone(anchor));
  }
  document.addEventListener('mouseup', captureSelection); document.addEventListener('keyup', captureSelection);
  const observer = new MutationObserver(() => { if (!destroyed) refresh(); });
  observer.observe(root, { childList: true, characterData: true, subtree: true });

  const controller: Controller = {
    getState: () => C.validate(state),
    // Show comments from other people or a reload, without creating a new controller.
    setState(value: CommentsState): void {
      if (destroyed) throw new Error('Comments are detached');
      state = checked(value); refresh();
    },
    // Threads in page order, each with its comments. placed is false when the text can no longer be found.
    view(): ControllerViewItem[] {
      const byThread = new Map<string, Comment[]>(state.threads.map(thread => [thread.threadId, []]));
      for (const comment of state.comments) (byThread.get(comment.threadId)!).push(comment);
      const ordered = [...state.threads].sort((a, b) => {
        const first = ranges.get(a.threadId); const second = ranges.get(b.threadId);
        if (first && second) return first.compareBoundaryPoints(Range.START_TO_START, second);
        return first ? -1 : second ? 1 : 0;
      });
      return structuredClone(ordered.map(thread => ({ thread, comments: byThread.get(thread.threadId) ?? [], placed: ranges.has(thread.threadId) })));
    },
    // Who changes are made as. The host sets this from its login session.
    getPerson: () => (person ? { ...person } : null),
    setPerson(value: Person | null): void { person = value === null ? null : C.validatePerson(value); },

    // Every method below returns a promise for { operation, state } and rejects when they fail.
    addThread: ({ anchor, text, threadId } = {}) => change(() => {
      const validAnchor: Anchor = anchor!;
      C.validateAnchor(validAnchor);
      if (!A.locate(A.textIndex(root!).content, validAnchor)) throw new Error('Selection changed. Select the text again.');
      const id = threadId || C.createId();
      return { type: 'thread.started', thread: { threadId: id, anchor: validAnchor, status: 'open' }, comment: newComment(id, text!) };
    }),
    addComment: ({ threadId, text } = {}) => change(() => ({ type: 'comment.added', comment: newComment(threadId!, text!) })),
    setStatus: (threadId, status) => change(() => actorOperation({ type: 'thread.status', threadId, status })),
    toggleReaction: (commentId, key) => change(() => actorOperation({ type: 'reaction.toggled', commentId, key })),
    editComment: (commentId, text) => change(() => actorOperation({ type: 'comment.edited', commentId, text })),
    deleteComment: commentId => change(() => actorOperation({ type: 'comment.deleted', commentId })),
    // target is { threadId } or { commentId }. A null value removes a key.
    updateMetadata: (target, metadata) => change(() => {
      const forThread = target?.threadId !== undefined;
      if (forThread === (target?.commentId !== undefined)) throw new Error('Give either threadId or commentId');
      return actorOperation(forThread ? { type: 'thread.metadata', threadId: target.threadId, metadata } : { type: 'comment.metadata', commentId: target.commentId, metadata });
    }),

    // Scroll to the thread's text, select it, and emit focus. Returns false for an unknown thread.
    focus(threadId: string): boolean {
      if (destroyed) throw new Error('Comments are detached');
      if (!state.threads.some(thread => thread.threadId === threadId)) return false;
      const range = ranges.get(threadId);
      if (range) {
        range.startContainer.parentElement!.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range.cloneRange());
      }
      emit('focus', threadId);
      return true;
    },
    // Returns a function that removes the handler.
    on(type: string, handler: ListenerFn): () => void {
      if (!listeners.has(type) || typeof handler !== 'function') throw new Error(`on(type, handler): type is one of ${EVENTS.join(', ')}`);
      listeners.get(type)!.add(handler);
      return () => listeners.get(type)!.delete(handler);
    },
    destroy(): void {
      if (destroyed) return;
      emit('destroy');
      destroyed = true; observer.disconnect();
      document.removeEventListener('mouseup', captureSelection); document.removeEventListener('keyup', captureSelection);
      highlights?.destroy(); instances.delete(root);
      for (const set of listeners.values()) set.clear();
    }
  };
  instances.set(root, controller); refresh(); return controller;
}

