// Responsibility: Comment API — schema, validation, IDs, and immutable thread/comment operations.
// No DOM, anchoring, storage, or UI. Callers supply identity and timestamps; the host owns permissions.
//
// State: { schemaVersion, document: { id, revision }, threads: [...], comments: [...] }
//   thread:  { threadId, anchor, status, statusChange?, metadata? }
//   anchor:  W3C Web Annotation selectors: one TextQuoteSelector { exact, prefix?, suffix? }
//            and optionally one TextPositionSelector { start, end }
//   comment: { commentId, threadId, personId, personName, timestamp, text,
//              reactions?, edited?, deleted?, metadata? }
// A thread's first comment starts it. Follow-up comments use the same threadId.
// Every operation after a comment is created carries { personId, personName, timestamp } (the actor).
/**
 * @typedef {object} Person
 * @property {string} personId
 * @property {string} personName
 */
/**
 * @typedef {Person & {timestamp: string}} Actor
 */
/**
 * @typedef {object} TextQuoteSelector
 * @property {'TextQuoteSelector'} type
 * @property {string} exact
 * @property {string} [prefix]
 * @property {string} [suffix]
 */
/**
 * @typedef {object} TextPositionSelector
 * @property {'TextPositionSelector'} type
 * @property {number} start
 * @property {number} end
 */
/**
 * @typedef {TextQuoteSelector|TextPositionSelector} Selector
 */
/**
 * @typedef {Selector[]} Anchor
 */
/**
 * @typedef {Object<string, any>} Metadata
 */
/**
 * @typedef {object} Thread
 * @property {string} threadId
 * @property {Anchor} anchor
 * @property {'open'|'resolved'} status
 * @property {Actor} [statusChange]
 * @property {Metadata} [metadata]
 */
/**
 * @typedef {object} Comment
 * @property {string} commentId
 * @property {string} threadId
 * @property {string} personId
 * @property {string} personName
 * @property {string} timestamp
 * @property {string} text
 * @property {Record<string, string[]>} [reactions]
 * @property {Actor} [edited]
 * @property {Actor} [deleted]
 * @property {Metadata} [metadata]
 */
/**
 * @typedef {object} CommentsState
 * @property {number} schemaVersion
 * @property {{id: string, revision: string}} document
 * @property {Thread[]} threads
 * @property {Comment[]} comments
 */
/**
 * @typedef {object} Operation
 * @property {string} type
 * @property {{threadId: string, anchor: Anchor, status: 'open'|'resolved'}} [thread]
 * @property {any} [comment]
 * @property {string} [threadId]
 * @property {string} [commentId]
 * @property {'open'|'resolved'} [status]
 * @property {string} [key]
 * @property {string} [text]
 * @property {Record<string, any>} [metadata]
 * @property {string} [personId]
 * @property {string} [personName]
 * @property {string} [timestamp]
 */
/**
 * @typedef {object} StartThreadInput
 * @property {string} threadId
 * @property {Anchor} anchor
 * @property {string} commentId
 * @property {string} personId
 * @property {string} personName
 * @property {string} timestamp
 * @property {string} text
 */
/**
 * @typedef {object} AddCommentInput
 * @property {string} threadId
 * @property {string} commentId
 * @property {string} personId
 * @property {string} personName
 * @property {string} timestamp
 * @property {string} text
 */
/**
 * @typedef {object} SetStatusInput
 * @property {string} threadId
 * @property {'open'|'resolved'} status
 * @property {string} personId
 * @property {string} personName
 * @property {string} timestamp
 */
/**
 * @param {any} global
 */
(function (global) {
  'use strict';
  const SCHEMA_VERSION = 3;
  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  /**
   * @param {any} value
   * @returns {any}
   */
  const clone = value => JSON.parse(JSON.stringify(value));
  /**
   * @param {string} message
   * @returns {never}
   */
  const fail = message => { throw new Error(message); };
  /**
   * @param {any} value
   * @param {string} name
   * @param {number} [max]
   * @returns {string}
   */
  function text(value, name, max = 20000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Invalid ${name}`);
    return value;
  }
  /**
   * @param {any} value
   * @param {string} name
   * @param {number} [max]
   * @returns {string}
   */
  function safeKey(value, name, max) {
    text(value, name, max);
    if (UNSAFE_KEYS.has(value)) fail(`Invalid ${name}`);
    return value;
  }
  /**
   * @param {any} value
   * @returns {void}
   */
  function validTimestamp(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('Invalid timestamp');
  }
  /**
   * @param {any} person
   * @returns {Person}
   */
  function validatePerson(person) {
    if (!person || typeof person !== 'object') fail('Invalid person');
    return { personId: text(person.personId, 'personId', 500), personName: text(person.personName, 'personName', 200) };
  }
  // The actor of an operation: who did it, and when.
  /**
   * @param {any} input
   * @returns {Actor}
   */
  function actorOf(input) {
    const person = validatePerson(input);
    validTimestamp(input.timestamp);
    return { ...person, timestamp: input.timestamp };
  }
  /**
   * @param {any} value
   * @param {string} name
   * @returns {void}
   */
  function validateActor(value, name) {
    if (!value || typeof value !== 'object') fail(`Invalid ${name}`);
    actorOf(value);
  }
  const ANCHOR_KEYS = { TextQuoteSelector: ['type', 'exact', 'prefix', 'suffix'], TextPositionSelector: ['type', 'start', 'end'] };
  // An anchor is a list of W3C selectors, the same shape Hypothesis and Apache Annotator use.
  /**
   * @param {Anchor} anchor
   * @returns {void}
   */
  function validateAnchor(anchor) {
    if (!Array.isArray(anchor) || !anchor.length || anchor.length > 2) fail('Invalid anchor');
    for (const selector of anchor) {
      if (!selector || typeof selector !== 'object' || !ANCHOR_KEYS[selector.type]) fail('Invalid anchor');
      if (!Object.keys(selector).every(key => ANCHOR_KEYS[selector.type].includes(key))) fail('Invalid anchor');
    }
    const quotes = anchor.filter(selector => selector.type === 'TextQuoteSelector');
    const positions = anchor.filter(selector => selector.type === 'TextPositionSelector');
    if (quotes.length !== 1 || positions.length > 1) fail('Invalid anchor');
    const quote = /** @type {TextQuoteSelector} */ (quotes[0]);
    text(quote.exact, 'anchor text');
    if (quote.prefix !== undefined && (typeof quote.prefix !== 'string' || quote.prefix.length > 80)) fail('Invalid anchor context');
    if (quote.suffix !== undefined && (typeof quote.suffix !== 'string' || quote.suffix.length > 80)) fail('Invalid anchor context');
    const position = /** @type {TextPositionSelector|undefined} */ (positions[0]);
    if (position) {
      const { start, end } = position;
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end <= start) fail('Invalid anchor position');
    }
  }
  /**
   * @param {any} metadata
   * @returns {void}
   */
  function validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('Invalid metadata');
    const keys = Object.keys(metadata);
    if (!keys.length || keys.length > 50 || JSON.stringify(metadata).length > 10000) fail('Invalid metadata');
    for (const key of keys) safeKey(key, 'metadata key', 100);
  }
  /**
   * @param {Record<string, string[]>} reactions
   * @returns {void}
   */
  function validateReactions(reactions) {
    if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) fail('Invalid reactions');
    const keys = Object.keys(reactions);
    if (!keys.length || keys.length > 50) fail('Invalid reactions');
    for (const key of keys) {
      safeKey(key, 'reaction key', 50);
      const people = reactions[key];
      if (!Array.isArray(people) || !people.length || people.length > 1000) fail('Invalid reaction people');
      const seen = /** @type {Set<string>} */ (new Set());
      for (const personId of people) {
        text(personId, 'reaction personId', 500);
        if (seen.has(personId)) fail('Duplicate reaction person');
        seen.add(personId);
      }
    }
  }
  /**
   * @param {Thread} thread
   * @returns {void}
   */
  function validateThread(thread) {
    if (!thread || typeof thread !== 'object') fail('Invalid thread');
    text(thread.threadId, 'threadId', 500);
    validateAnchor(thread.anchor);
    if (!['open', 'resolved'].includes(thread.status)) fail('Invalid thread status');
    if (thread.statusChange !== undefined) validateActor(thread.statusChange, 'statusChange');
    if (thread.metadata !== undefined) validateMetadata(thread.metadata);
  }
  /**
   * @param {Comment} comment
   * @returns {void}
   */
  function validateComment(comment) {
    if (!comment || typeof comment !== 'object') fail('Invalid comment');
    text(comment.commentId, 'commentId', 500);
    text(comment.threadId, 'threadId', 500);
    validatePerson(comment);
    validTimestamp(comment.timestamp);
    if (comment.deleted !== undefined) {
      validateActor(comment.deleted, 'deleted');
      if (comment.text !== '' || comment.reactions !== undefined) fail('A deleted comment has no text or reactions');
    } else text(comment.text, 'comment text');
    if (comment.edited !== undefined) validateActor(comment.edited, 'edited');
    if (comment.reactions !== undefined) validateReactions(comment.reactions);
    if (comment.metadata !== undefined) validateMetadata(comment.metadata);
  }
  /**
   * @param {string} documentId
   * @param {string} [revision]
   * @returns {CommentsState}
   */
  function empty(documentId, revision = '1') {
    return { schemaVersion: SCHEMA_VERSION, document: { id: text(documentId, 'document ID', 500), revision: text(revision, 'revision', 500) }, threads: [], comments: [] };
  }
  /**
   * @param {CommentsState} value
   * @returns {CommentsState}
   */
  function validate(value) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION || !value.document || !Array.isArray(value.threads) || !Array.isArray(value.comments)) fail('Invalid comments state');
    text(value.document.id, 'document ID', 500);
    text(value.document.revision, 'revision', 500);
    if (value.threads.length > 10000 || value.comments.length > 100000) fail('Too many comments');
    const threadIds = /** @type {Set<string>} */ (new Set());
    for (const thread of value.threads) {
      validateThread(thread);
      if (threadIds.has(thread.threadId)) fail('Duplicate threadId');
      threadIds.add(thread.threadId);
    }
    const commentIds = /** @type {Set<string>} */ (new Set()); const usedThreads = /** @type {Set<string>} */ (new Set());
    for (const comment of value.comments) {
      validateComment(comment);
      if (commentIds.has(comment.commentId)) fail('Duplicate commentId');
      if (!threadIds.has(comment.threadId)) fail('Comment references an unknown threadId');
      commentIds.add(comment.commentId); usedThreads.add(comment.threadId);
    }
    if (usedThreads.size !== threadIds.size) fail('Every thread needs at least one comment');
    return /** @type {CommentsState} */ (clone(value));
  }
  /**
   * @param {any[]} list
   * @param {string} field
   * @param {string} id
   * @param {string} label
   * @returns {any}
   */
  function find(list, field, id, label) {
    return list.find(item => item[field] === id) || fail(`${label} not found`);
  }
  /**
   * @param {StartThreadInput|AddCommentInput} input
   * @param {string} threadId
   * @returns {Comment}
   */
  function pickComment(input, threadId) {
    return { commentId: input.commentId, threadId, personId: input.personId, personName: input.personName, timestamp: input.timestamp, text: input.text };
  }
  // input: { threadId, anchor, commentId, personId, personName, timestamp, text }
  /**
   * @param {CommentsState} state
   * @param {StartThreadInput} input
   * @returns {CommentsState}
   */
  function startThread(state, input) {
    const next = validate(state);
    next.threads.push({ threadId: input.threadId, anchor: input.anchor, status: 'open' });
    next.comments.push(pickComment(input, input.threadId));
    return validate(next);
  }
  // input: { threadId, commentId, personId, personName, timestamp, text }
  /**
   * @param {CommentsState} state
   * @param {AddCommentInput} input
   * @returns {CommentsState}
   */
  function addComment(state, input) {
    const next = validate(state);
    find(next.threads, 'threadId', input.threadId, 'Thread');
    next.comments.push(pickComment(input, input.threadId));
    return validate(next);
  }
  // input: { threadId, status, personId, personName, timestamp }
  /**
   * @param {CommentsState} state
   * @param {SetStatusInput} input
   * @returns {CommentsState}
   */
  function setStatus(state, input) {
    const next = validate(state);
    const thread = find(next.threads, 'threadId', input.threadId, 'Thread');
    if (!['open', 'resolved'].includes(input.status)) fail('Invalid thread status');
    thread.status = input.status; thread.statusChange = actorOf(input);
    return validate(next);
  }
  // A patch sets keys; a null value removes a key. The library never interprets metadata.
  /**
   * @param {Thread|Comment} target
   * @param {Record<string, any>} patch
   * @returns {void}
   */
  function patchMetadata(target, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Invalid metadata');
    const merged = { ...(target.metadata || {}) };
    for (const [key, value] of Object.entries(patch)) {
      safeKey(key, 'metadata key', 100);
      if (value === null) delete merged[key]; else merged[key] = value;
    }
    if (Object.keys(merged).length) target.metadata = merged; else delete target.metadata;
  }
  /**
   * @param {CommentsState} next
   * @param {string} commentId
   * @returns {Comment}
   */
  function liveComment(next, commentId) {
    const comment = find(next.comments, 'commentId', commentId, 'Comment');
    if (comment.deleted) fail('The comment was deleted');
    return comment;
  }
  // Operations are the unit hosts store, audit, or forward. Each one after the
  // first comment carries its actor: personId, personName, timestamp.
  //   { type: 'thread.started', thread: { threadId, anchor, status }, comment }
  //   { type: 'comment.added', comment }
  //   { type: 'thread.status', threadId, status, ...actor }
  //   { type: 'reaction.toggled', commentId, key, ...actor }   adds or removes the actor's reaction
  //   { type: 'comment.edited', commentId, text, ...actor }
  //   { type: 'comment.deleted', commentId, ...actor }         keeps a tombstone; text is removed
  //   { type: 'thread.metadata', threadId, metadata, ...actor }
  //   { type: 'comment.metadata', commentId, metadata, ...actor }
  /**
   * @param {CommentsState} state
   * @param {Operation} operation
   * @returns {CommentsState}
   */
  function apply(state, operation) {
    if (!operation || typeof operation !== 'object') fail('Invalid operation');
    switch (operation.type) {
      case 'thread.started': {
        const thread = operation.thread || fail('Invalid operation thread');
        if (thread.status !== 'open') fail('A new thread must be open');
        if (!operation.comment || operation.comment.threadId !== thread.threadId) fail('Operation comment must use the new threadId');
        return startThread(state, { ...operation.comment, threadId: thread.threadId, anchor: thread.anchor });
      }
      case 'comment.added': return addComment(state, operation.comment || fail('Invalid operation comment'));
      case 'thread.status': return setStatus(state, /** @type {SetStatusInput} */ (operation));
      case 'reaction.toggled': {
        const next = validate(state); const actor = actorOf(operation);
        const comment = liveComment(next, /** @type {string} */ (operation.commentId));
        const key = safeKey(operation.key, 'reaction key', 50);
        const reactions = comment.reactions || {}; const people = reactions[key] || [];
        if (people.includes(actor.personId)) {
          const remaining = people.filter(personId => personId !== actor.personId);
          if (remaining.length) reactions[key] = remaining; else delete reactions[key];
        } else reactions[key] = [...people, actor.personId];
        if (Object.keys(reactions).length) comment.reactions = reactions; else delete comment.reactions;
        return validate(next);
      }
      case 'comment.edited': {
        const next = validate(state); const actor = actorOf(operation);
        const comment = liveComment(next, /** @type {string} */ (operation.commentId));
        comment.text = text(operation.text, 'comment text'); comment.edited = actor;
        return validate(next);
      }
      case 'comment.deleted': {
        const next = validate(state); const actor = actorOf(operation);
        const comment = liveComment(next, /** @type {string} */ (operation.commentId));
        comment.text = ''; comment.deleted = actor; delete comment.reactions;
        return validate(next);
      }
      case 'thread.metadata': {
        const next = validate(state); actorOf(operation);
        patchMetadata(find(next.threads, 'threadId', /** @type {string} */ (operation.threadId), 'Thread'), /** @type {Record<string, any>} */ (operation.metadata));
        return validate(next);
      }
      case 'comment.metadata': {
        const next = validate(state); actorOf(operation);
        patchMetadata(liveComment(next, /** @type {string} */ (operation.commentId)), /** @type {Record<string, any>} */ (operation.metadata));
        return validate(next);
      }
      default: return fail('Unknown operation type');
    }
  }
  /**
   * @param {CommentsState} state
   * @param {string} threadId
   * @returns {Comment[]}
   */
  function commentsFor(state, threadId) {
    return state.comments.filter(comment => comment.threadId === threadId);
  }
  /**
   * @param {CommentsState} state
   * @returns {string}
   */
  function serialize(state) {
    // Safe inside an application/json script element, including hostile comment text.
    return JSON.stringify(validate(state)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  /**
   * @returns {string}
   */
  function createId() {
    if (global.crypto.randomUUID) return global.crypto.randomUUID();
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  /**
   * @param {string} key
   * @returns {string}
   */
  const validateReactionKey = key => safeKey(key, 'reaction key', 50);
  const api = { SCHEMA_VERSION, empty, validate, validatePerson, validateAnchor, validateReactionKey, startThread, addComment, setStatus, apply, commentsFor, serialize, createId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else /** @type {any} */ (global).CollabHTMLComments = api;
})(globalThis);
