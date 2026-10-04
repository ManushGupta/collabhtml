// Responsibility: the headless primitive. create() connects the Comment API and HTML anchors.
// Methods change comments; events report updates. No UI, storage, networking, export, or startup.
// onChange receives each operation before it is accepted, so a host can store it or refuse it.
/**
 * @typedef {(detail?: any) => void} ListenerFn
 */
/**
 * @typedef {object} OnChangeContext
 * @property {CommentsState} previous
 * @property {CommentsState} next
 * @property {{id: string, revision: string}} document
 */
/**
 * @typedef {object} ControllerOptions
 * @property {string|Element} [root]
 * @property {CommentsState} [state]
 * @property {Person|null} [person]
 * @property {(operation: Operation, context: OnChangeContext) => unknown} [onChange]
 * @property {boolean} [highlight]
 */
/**
 * @typedef {object} ChangeResult
 * @property {Operation} operation
 * @property {CommentsState} state
 */
/**
 * @typedef {object} ControllerViewItem
 * @property {Thread} thread
 * @property {ChtComment[]} comments
 * @property {boolean} placed
 */
/**
 * @typedef {object} Controller
 * @property {() => CommentsState} getState
 * @property {(value: CommentsState) => void} setState
 * @property {() => ControllerViewItem[]} view
 * @property {() => Person|null} getPerson
 * @property {(value: Person|null) => void} setPerson
 * @property {(input?: {anchor?: Anchor, text?: string, threadId?: string}) => Promise<ChangeResult>} addThread
 * @property {(input?: {threadId?: string, text?: string}) => Promise<ChangeResult>} addComment
 * @property {(threadId: string, status: 'open'|'resolved') => Promise<ChangeResult>} setStatus
 * @property {(commentId: string, key: string) => Promise<ChangeResult>} toggleReaction
 * @property {(commentId: string, text: string) => Promise<ChangeResult>} editComment
 * @property {(commentId: string) => Promise<ChangeResult>} deleteComment
 * @property {(target: {threadId?: string, commentId?: string}, metadata: Record<string, any>) => Promise<ChangeResult>} updateMetadata
 * @property {(threadId: string) => boolean} focus
 * @property {(type: string, handler: ListenerFn) => () => void} on
 * @property {() => void} destroy
 */
(function () {
  'use strict';
  const C = /** @type {import('./comments')} */ ((/** @type {any} */ (globalThis)).CollabHTMLComments);
  const A = /** @type {import('./anchors')} */ ((/** @type {any} */ (globalThis)).CollabHTMLAnchors);
  const instances = /** @type {WeakMap<Element, Controller>} */ (new WeakMap());
  /**
   * @param {any} value
   * @returns {any}
   */
  const copy = value => JSON.parse(JSON.stringify(value));
  // update: comments or anchor placement changed.  selection: the user selected text (detail: anchor).
  // focus: a thread was focused (detail: threadId).  busy: changes are pending (detail: boolean).
  // destroy: the controller is being removed, so a UI can detach.
  const EVENTS = ['update', 'selection', 'focus', 'busy', 'destroy'];

  /**
   * @param {ControllerOptions} [options]
   * @returns {Controller}
   */
  function create(options = {}) {
    const root = typeof options.root === 'string' ? document.querySelector(options.root) : (options.root || document.querySelector('main') || document.body);
    if (!root || root.ownerDocument !== document) throw new Error('Comments root must be in this document');
    if (instances.has(root)) throw new Error('This content already has comments attached');
    if (options.onChange !== undefined && typeof options.onChange !== 'function') throw new Error('onChange must be a function');
    let state = C.validate(options.state || C.empty(root.id || 'document'));
    /** @type {Person|null} */
    let person = options.person === undefined ? null : C.validatePerson(options.person);
    let destroyed = false; let pending = 0; let queue = Promise.resolve();
    const ranges = /** @type {Map<string, Range>} */ (new Map());
    const listeners = /** @type {Map<string, Set<ListenerFn>>} */ (new Map(EVENTS.map(type => [type, new Set()])));
    const highlights = options.highlight === false ? null : A.highlight(document, `collabhtml-${C.createId()}`);
    const now = () => new Date().toISOString();

    /**
     * @param {string} type
     * @param {any} [detail]
     * @returns {void}
     */
    function emit(type, detail) {
      for (const handler of /** @type {Set<ListenerFn>} */ (listeners.get(type))) {
        try { handler(detail); } catch (error) { console.error('CollabHTML listener failed:', error); }
      }
    }
    /**
     * @param {CommentsState} value
     * @returns {CommentsState}
     */
    function checked(value) {
      const next = C.validate(value);
      if (next.document.id !== state.document.id || next.document.revision !== state.document.revision) throw new Error('Comments belong to another document revision');
      return next;
    }
    /**
     * @returns {Person}
     */
    function requirePerson() {
      if (!person) throw new Error('Set the person before changing comments.');
      return person;
    }
    /**
     * @param {any} base
     * @returns {Operation}
     */
    const actorOperation = base => ({ ...base, ...requirePerson(), timestamp: now() });
    /**
     * @param {string} threadId
     * @param {string} text
     * @returns {ChtComment}
     */
    const newComment = (threadId, text) => ({ commentId: C.createId(), threadId, ...requirePerson(), timestamp: now(), text });

    // Find each thread's text again, update highlights, and tell listeners.
    /**
     * @param {Operation} [operation]
     * @returns {void}
     */
    function refresh(operation) {
      const index = A.textIndex(/** @type {Element} */ (root)); ranges.clear();
      for (const thread of state.threads) {
        const range = A.toRange(index, A.locate(index.content, thread.anchor));
        if (range) ranges.set(thread.threadId, range);
      }
      highlights?.update(ranges.values());
      emit('update', operation ? { operation: copy(operation) } : {});
    }
    // The host sees a validated operation first. If onChange returns the host's latest
    // state, that state wins. Otherwise the operation is applied to the current state.
    /**
     * @param {() => Operation} makeOperation
     * @returns {Promise<ChangeResult>}
     */
    async function commit(makeOperation) {
      if (destroyed) throw new Error('Comments are detached');
      const operation = makeOperation();
      const next = C.apply(state, operation);
      const confirmed = await options.onChange?.(copy(operation), { previous: C.validate(state), next, document: { ...state.document } });
      if (destroyed) throw new Error('Comments are detached');
      state = confirmed ? checked(/** @type {CommentsState} */ (confirmed)) : C.apply(state, operation);
      refresh(operation);
      return { operation: copy(operation), state: C.validate(state) };
    }
    // Changes run one at a time, in the order they were requested.
    /**
     * @param {() => Operation} makeOperation
     * @returns {Promise<ChangeResult>}
     */
    function change(makeOperation) {
      if (destroyed) return Promise.reject(new Error('Comments are detached'));
      pending += 1; if (pending === 1) emit('busy', true);
      const result = queue.then(() => commit(makeOperation));
      queue = result.then(() => {}, () => {}).then(() => { pending -= 1; if (!pending) emit('busy', false); });
      return result;
    }

    function captureSelection() {
      if (destroyed) return;
      let anchor = null;
      try { anchor = A.capture(/** @type {Element} */ (root)); } catch { return; }
      if (anchor) emit('selection', copy(anchor));
    }
    document.addEventListener('mouseup', captureSelection); document.addEventListener('keyup', captureSelection);
    const observer = new MutationObserver(() => { if (!destroyed) refresh(); });
    observer.observe(root, { childList: true, characterData: true, subtree: true });

    const controller = /** @type {Controller} */ ({
      getState: () => C.validate(state),
      // Show comments from other people or a reload, without creating a new controller.
      setState(value) {
        if (destroyed) throw new Error('Comments are detached');
        state = checked(value); refresh();
      },
      // Threads in page order, each with its comments. placed is false when the text can no longer be found.
      view() {
        const byThread = /** @type {Map<string, ChtComment[]>} */ (new Map(state.threads.map(thread => [thread.threadId, []])));
        for (const comment of state.comments) /** @type {ChtComment[]} */ (byThread.get(comment.threadId)).push(comment);
        const ordered = [...state.threads].sort((a, b) => {
          const first = ranges.get(a.threadId); const second = ranges.get(b.threadId);
          if (first && second) return first.compareBoundaryPoints(Range.START_TO_START, second);
          return first ? -1 : second ? 1 : 0;
        });
        return copy(ordered.map(thread => ({ thread, comments: byThread.get(thread.threadId), placed: ranges.has(thread.threadId) })));
      },
      // Who changes are made as. The host sets this from its login session.
      getPerson: () => (person ? { ...person } : null),
      setPerson(value) { person = value === null ? null : C.validatePerson(value); },

      // Every method below returns a promise for { operation, state } and rejects when they fail.
      addThread: ({ anchor, text, threadId } = {}) => change(() => {
        const validAnchor = /** @type {Anchor} */ (anchor);
        C.validateAnchor(validAnchor);
        if (!A.locate(A.textIndex(root).content, validAnchor)) throw new Error('Selection changed. Select the text again.');
        const id = threadId || C.createId();
        return { type: 'thread.started', thread: { threadId: id, anchor: validAnchor, status: 'open' }, comment: newComment(id, /** @type {string} */ (text)) };
      }),
      addComment: ({ threadId, text } = {}) => change(() => ({ type: 'comment.added', comment: newComment(/** @type {string} */ (threadId), /** @type {string} */ (text)) })),
      setStatus: (threadId, status) => change(() => actorOperation({ type: 'thread.status', threadId, status })),
      toggleReaction: (commentId, key) => change(() => actorOperation({ type: 'reaction.toggled', commentId, key })),
      editComment: (commentId, text) => change(() => actorOperation({ type: 'comment.edited', commentId, text })),
      deleteComment: commentId => change(() => actorOperation({ type: 'comment.deleted', commentId })),
      // target is { threadId } or { commentId }. A null value removes a key.
      updateMetadata: (target, metadata) => change(() => {
        const t = /** @type {{threadId?: string, commentId?: string}} */ (target);
        const forThread = t?.threadId !== undefined;
        if (forThread === (t?.commentId !== undefined)) throw new Error('Give either threadId or commentId');
        return actorOperation(forThread ? { type: 'thread.metadata', threadId: t.threadId, metadata } : { type: 'comment.metadata', commentId: t.commentId, metadata });
      }),

      // Scroll to the thread's text, select it, and emit focus. Returns false for an unknown thread.
      focus(threadId) {
        if (destroyed) throw new Error('Comments are detached');
        if (!state.threads.some(thread => thread.threadId === threadId)) return false;
        const range = ranges.get(threadId);
        if (range) {
          /** @type {Element} */ (range.startContainer.parentElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          const selection = /** @type {Selection} */ (window.getSelection()); selection.removeAllRanges(); selection.addRange(range.cloneRange());
        }
        emit('focus', threadId);
        return true;
      },
      // Returns a function that removes the handler.
      on(type, handler) {
        if (!listeners.has(type) || typeof handler !== 'function') throw new Error(`on(type, handler): type is one of ${EVENTS.join(', ')}`);
        /** @type {Set<ListenerFn>} */ (listeners.get(type)).add(handler);
        return () => /** @type {Set<ListenerFn>} */ (listeners.get(type)).delete(handler);
      },
      destroy() {
        if (destroyed) return;
        emit('destroy');
        destroyed = true; observer.disconnect();
        document.removeEventListener('mouseup', captureSelection); document.removeEventListener('keyup', captureSelection);
        highlights?.destroy(); instances.delete(root);
        for (const set of listeners.values()) set.clear();
      }
    });
    instances.set(root, controller); refresh(); return controller;
  }
  (/** @type {any} */ (globalThis)).CollabHTML = { create, comments: C };
})();
