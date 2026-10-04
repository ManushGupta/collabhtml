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
(function (global) {
  'use strict';
  const SCHEMA_VERSION = 3;
  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  function text(value, name, max = 20000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Invalid ${name}`);
    return value;
  }
  function safeKey(value, name, max) {
    text(value, name, max);
    if (UNSAFE_KEYS.has(value)) fail(`Invalid ${name}`);
    return value;
  }
  function validTimestamp(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('Invalid timestamp');
  }
  function validatePerson(person) {
    if (!person || typeof person !== 'object') fail('Invalid person');
    return { personId: text(person.personId, 'personId', 500), personName: text(person.personName, 'personName', 200) };
  }
  // The actor of an operation: who did it, and when.
  function actorOf(input) {
    const person = validatePerson(input);
    validTimestamp(input.timestamp);
    return { ...person, timestamp: input.timestamp };
  }
  function validateActor(value, name) {
    if (!value || typeof value !== 'object') fail(`Invalid ${name}`);
    actorOf(value);
  }
  const ANCHOR_KEYS = { TextQuoteSelector: ['type', 'exact', 'prefix', 'suffix'], TextPositionSelector: ['type', 'start', 'end'] };
  // An anchor is a list of W3C selectors, the same shape Hypothesis and Apache Annotator use.
  function validateAnchor(anchor) {
    if (!Array.isArray(anchor) || !anchor.length || anchor.length > 2) fail('Invalid anchor');
    for (const selector of anchor) {
      if (!selector || typeof selector !== 'object' || !ANCHOR_KEYS[selector.type]) fail('Invalid anchor');
      if (!Object.keys(selector).every(key => ANCHOR_KEYS[selector.type].includes(key))) fail('Invalid anchor');
    }
    const quotes = anchor.filter(selector => selector.type === 'TextQuoteSelector');
    const positions = anchor.filter(selector => selector.type === 'TextPositionSelector');
    if (quotes.length !== 1 || positions.length > 1) fail('Invalid anchor');
    text(quotes[0].exact, 'anchor text');
    for (const key of ['prefix', 'suffix']) {
      if (quotes[0][key] !== undefined && (typeof quotes[0][key] !== 'string' || quotes[0][key].length > 80)) fail('Invalid anchor context');
    }
    if (positions[0]) {
      const { start, end } = positions[0];
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end <= start) fail('Invalid anchor position');
    }
  }
  function validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('Invalid metadata');
    const keys = Object.keys(metadata);
    if (!keys.length || keys.length > 50 || JSON.stringify(metadata).length > 10000) fail('Invalid metadata');
    for (const key of keys) safeKey(key, 'metadata key', 100);
  }
  function validateReactions(reactions) {
    if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) fail('Invalid reactions');
    const keys = Object.keys(reactions);
    if (!keys.length || keys.length > 50) fail('Invalid reactions');
    for (const key of keys) {
      safeKey(key, 'reaction key', 50);
      const people = reactions[key];
      if (!Array.isArray(people) || !people.length || people.length > 1000) fail('Invalid reaction people');
      const seen = new Set();
      for (const personId of people) {
        text(personId, 'reaction personId', 500);
        if (seen.has(personId)) fail('Duplicate reaction person');
        seen.add(personId);
      }
    }
  }
  function validateThread(thread) {
    if (!thread || typeof thread !== 'object') fail('Invalid thread');
    text(thread.threadId, 'threadId', 500);
    validateAnchor(thread.anchor);
    if (!['open', 'resolved'].includes(thread.status)) fail('Invalid thread status');
    if (thread.statusChange !== undefined) validateActor(thread.statusChange, 'statusChange');
    if (thread.metadata !== undefined) validateMetadata(thread.metadata);
  }
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
  function empty(documentId, revision = '1') {
    return { schemaVersion: SCHEMA_VERSION, document: { id: text(documentId, 'document ID', 500), revision: text(revision, 'revision', 500) }, threads: [], comments: [] };
  }
  function validate(value) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION || !value.document || !Array.isArray(value.threads) || !Array.isArray(value.comments)) fail('Invalid comments state');
    text(value.document.id, 'document ID', 500);
    text(value.document.revision, 'revision', 500);
    if (value.threads.length > 10000 || value.comments.length > 100000) fail('Too many comments');
    const threadIds = new Set();
    for (const thread of value.threads) {
      validateThread(thread);
      if (threadIds.has(thread.threadId)) fail('Duplicate threadId');
      threadIds.add(thread.threadId);
    }
    const commentIds = new Set(); const usedThreads = new Set();
    for (const comment of value.comments) {
      validateComment(comment);
      if (commentIds.has(comment.commentId)) fail('Duplicate commentId');
      if (!threadIds.has(comment.threadId)) fail('Comment references an unknown threadId');
      commentIds.add(comment.commentId); usedThreads.add(comment.threadId);
    }
    if (usedThreads.size !== threadIds.size) fail('Every thread needs at least one comment');
    return clone(value);
  }
  function find(list, field, id, label) {
    return list.find(item => item[field] === id) || fail(`${label} not found`);
  }
  function pickComment(input, threadId) {
    return { commentId: input.commentId, threadId, personId: input.personId, personName: input.personName, timestamp: input.timestamp, text: input.text };
  }
  // input: { threadId, anchor, commentId, personId, personName, timestamp, text }
  function startThread(state, input) {
    const next = validate(state);
    next.threads.push({ threadId: input.threadId, anchor: input.anchor, status: 'open' });
    next.comments.push(pickComment(input, input.threadId));
    return validate(next);
  }
  // input: { threadId, commentId, personId, personName, timestamp, text }
  function addComment(state, input) {
    const next = validate(state);
    find(next.threads, 'threadId', input.threadId, 'Thread');
    next.comments.push(pickComment(input, input.threadId));
    return validate(next);
  }
  // input: { threadId, status, personId, personName, timestamp }
  function setStatus(state, input) {
    const next = validate(state);
    const thread = find(next.threads, 'threadId', input.threadId, 'Thread');
    if (!['open', 'resolved'].includes(input.status)) fail('Invalid thread status');
    thread.status = input.status; thread.statusChange = actorOf(input);
    return validate(next);
  }
  // A patch sets keys; a null value removes a key. The library never interprets metadata.
  function patchMetadata(target, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Invalid metadata');
    const merged = { ...(target.metadata || {}) };
    for (const [key, value] of Object.entries(patch)) {
      safeKey(key, 'metadata key', 100);
      if (value === null) delete merged[key]; else merged[key] = value;
    }
    if (Object.keys(merged).length) target.metadata = merged; else delete target.metadata;
  }
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
      case 'thread.status': return setStatus(state, operation);
      case 'reaction.toggled': {
        const next = validate(state); const actor = actorOf(operation);
        const comment = liveComment(next, operation.commentId);
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
        const comment = liveComment(next, operation.commentId);
        comment.text = text(operation.text, 'comment text'); comment.edited = actor;
        return validate(next);
      }
      case 'comment.deleted': {
        const next = validate(state); const actor = actorOf(operation);
        const comment = liveComment(next, operation.commentId);
        comment.text = ''; comment.deleted = actor; delete comment.reactions;
        return validate(next);
      }
      case 'thread.metadata': {
        const next = validate(state); actorOf(operation);
        patchMetadata(find(next.threads, 'threadId', operation.threadId, 'Thread'), operation.metadata);
        return validate(next);
      }
      case 'comment.metadata': {
        const next = validate(state); actorOf(operation);
        patchMetadata(liveComment(next, operation.commentId), operation.metadata);
        return validate(next);
      }
      default: return fail('Unknown operation type');
    }
  }
  function commentsFor(state, threadId) {
    return state.comments.filter(comment => comment.threadId === threadId);
  }
  function serialize(state) {
    // Safe inside an application/json script element, including hostile comment text.
    return JSON.stringify(validate(state)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  function createId() {
    if (global.crypto.randomUUID) return global.crypto.randomUUID();
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const validateReactionKey = key => safeKey(key, 'reaction key', 50);
  const api = { SCHEMA_VERSION, empty, validate, validatePerson, validateAnchor, validateReactionKey, startThread, addComment, setStatus, apply, commentsFor, serialize, createId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CollabHTMLComments = api;
})(globalThis);
