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
export interface Person {
  personId: string;
  personName: string;
}
export interface Actor extends Person {
  timestamp: string;
}
export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}
export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}
export type Selector = TextQuoteSelector | TextPositionSelector;
export type Anchor = Selector[];
export type Metadata = Record<string, any>;
export interface Thread {
  threadId: string;
  anchor: Anchor;
  status: 'open' | 'resolved';
  statusChange?: Actor;
  anchorHistory?: AnchorRecord[];
  metadata?: Metadata;
}
export interface AnchorRecord {
  anchor: Anchor;
  personId: string;
  personName: string;
  timestamp: string;
}
export interface Comment {
  commentId: string;
  threadId: string;
  personId: string;
  personName: string;
  timestamp: string;
  text: string;
  reactions?: Record<string, string[]>;
  edited?: Actor;
  deleted?: Actor;
  metadata?: Metadata;
}
export interface CommentsState {
  schemaVersion: number;
  document: { id: string; revision: string };
  threads: Thread[];
  comments: Comment[];
}
export interface Operation {
  type: string;
  thread?: { threadId: string; anchor: Anchor; status: 'open' | 'resolved' };
  comment?: any;
  threadId?: string;
  commentId?: string;
  anchor?: Anchor;
  status?: 'open' | 'resolved';
  key?: string;
  text?: string;
  metadata?: Record<string, any>;
  personId?: string;
  personName?: string;
  timestamp?: string;
}
export interface StartThreadInput {
  threadId: string;
  anchor: Anchor;
  commentId: string;
  personId: string;
  personName: string;
  timestamp: string;
  text: string;
}
export interface AddCommentInput {
  threadId: string;
  commentId: string;
  personId: string;
  personName: string;
  timestamp: string;
  text: string;
}
export interface SetStatusInput {
  threadId: string;
  status: 'open' | 'resolved';
  personId: string;
  personName: string;
  timestamp: string;
}

export const SCHEMA_VERSION = 3;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const fail = (message: string): never => { throw new Error(message); };

export function text(value: any, name: string, max = 20000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Invalid ${name}`);
  return value;
}
export function safeKey(value: any, name: string, max?: number): string {
  text(value, name, max);
  if (UNSAFE_KEYS.has(value)) fail(`Invalid ${name}`);
  return value;
}
function validTimestamp(value: any): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('Invalid timestamp');
}
export function validatePerson(person: any): Person {
  if (!person || typeof person !== 'object') fail('Invalid person');
  return { personId: text(person.personId, 'personId', 500), personName: text(person.personName, 'personName', 200) };
}
// The actor of an operation: who did it, and when.
function actorOf(input: any): Actor {
  const person = validatePerson(input);
  validTimestamp(input.timestamp);
  return { ...person, timestamp: input.timestamp };
}
function validateActor(value: any, name: string): void {
  if (!value || typeof value !== 'object') fail(`Invalid ${name}`);
  actorOf(value);
}
const ANCHOR_KEYS = { TextQuoteSelector: ['type', 'exact', 'prefix', 'suffix'], TextPositionSelector: ['type', 'start', 'end'] };
// An anchor is a list of W3C selectors, the same shape Hypothesis and Apache Annotator use.
export function validateAnchor(anchor: Anchor): void {
  if (!Array.isArray(anchor) || !anchor.length || anchor.length > 2) fail('Invalid anchor');
  for (const selector of anchor) {
    if (!selector || typeof selector !== 'object' || !ANCHOR_KEYS[selector.type]) fail('Invalid anchor');
    if (!Object.keys(selector).every(key => ANCHOR_KEYS[selector.type].includes(key))) fail('Invalid anchor');
  }
  const quotes = anchor.filter(selector => selector.type === 'TextQuoteSelector');
  const positions = anchor.filter(selector => selector.type === 'TextPositionSelector');
  if (quotes.length !== 1 || positions.length > 1) fail('Invalid anchor');
  const quote = quotes[0] as TextQuoteSelector;
  text(quote.exact, 'anchor text');
  if (quote.prefix !== undefined && (typeof quote.prefix !== 'string' || quote.prefix.length > 80)) fail('Invalid anchor context');
  if (quote.suffix !== undefined && (typeof quote.suffix !== 'string' || quote.suffix.length > 80)) fail('Invalid anchor context');
  const position = positions[0] as TextPositionSelector | undefined;
  if (position) {
    const { start, end } = position;
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end <= start) fail('Invalid anchor position');
  }
}
function validateMetadata(metadata: any): void {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('Invalid metadata');
  const keys = Object.keys(metadata);
  if (!keys.length || keys.length > 50 || JSON.stringify(metadata).length > 10000) fail('Invalid metadata');
  for (const key of keys) safeKey(key, 'metadata key', 100);
}
function validateReactions(reactions: Record<string, string[]>): void {
  if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) fail('Invalid reactions');
  const keys = Object.keys(reactions);
  if (!keys.length || keys.length > 50) fail('Invalid reactions');
  for (const key of keys) {
    safeKey(key, 'reaction key', 50);
    const people = reactions[key];
    if (!Array.isArray(people) || !people.length || people.length > 1000) fail('Invalid reaction people');
    const seen = new Set<string>();
    for (const personId of people) {
      text(personId, 'reaction personId', 500);
      if (seen.has(personId)) fail('Duplicate reaction person');
      seen.add(personId);
    }
  }
}
function validateThread(thread: Thread): void {
  if (!thread || typeof thread !== 'object') fail('Invalid thread');
  text(thread.threadId, 'threadId', 500);
  validateAnchor(thread.anchor);
  if (!['open', 'resolved'].includes(thread.status)) fail('Invalid thread status');
  if (thread.statusChange !== undefined) validateActor(thread.statusChange, 'statusChange');
  if (thread.anchorHistory !== undefined) {
    if (!Array.isArray(thread.anchorHistory) || thread.anchorHistory.length > 100) fail('Invalid anchor history');
    for (const record of thread.anchorHistory) {
      if (!record || typeof record !== 'object') fail('Invalid anchor history');
      validateAnchor(record.anchor);
      validateActor(record, 'anchor history');
    }
  }
  if (thread.metadata !== undefined) validateMetadata(thread.metadata);
}
function validateComment(comment: Comment): void {
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
export function empty(documentId: string, revision = '1'): CommentsState {
  return { schemaVersion: SCHEMA_VERSION, document: { id: text(documentId, 'document ID', 500), revision: text(revision, 'revision', 500) }, threads: [], comments: [] };
}
export function validate(value: CommentsState): CommentsState {
  if (!value || value.schemaVersion !== SCHEMA_VERSION || !value.document || !Array.isArray(value.threads) || !Array.isArray(value.comments)) fail('Invalid comments state');
  text(value.document.id, 'document ID', 500);
  text(value.document.revision, 'revision', 500);
  if (value.threads.length > 10000 || value.comments.length > 100000) fail('Too many comments');
  const threadIds = new Set<string>();
  for (const thread of value.threads) {
    validateThread(thread);
    if (threadIds.has(thread.threadId)) fail('Duplicate threadId');
    threadIds.add(thread.threadId);
  }
  const commentIds = new Set<string>(); const usedThreads = new Set<string>();
  for (const comment of value.comments) {
    validateComment(comment);
    if (commentIds.has(comment.commentId)) fail('Duplicate commentId');
    if (!threadIds.has(comment.threadId)) fail('Comment references an unknown threadId');
    commentIds.add(comment.commentId); usedThreads.add(comment.threadId);
  }
  if (usedThreads.size !== threadIds.size) fail('Every thread needs at least one comment');
  return structuredClone(value);
}
function find(list: any[], field: string, id: string, label: string): any {
  return list.find(item => item[field] === id) || fail(`${label} not found`);
}
function pickComment(input: StartThreadInput | AddCommentInput, threadId: string): Comment {
  return { commentId: input.commentId, threadId, personId: input.personId, personName: input.personName, timestamp: input.timestamp, text: input.text };
}
// input: { threadId, anchor, commentId, personId, personName, timestamp, text }
export function startThread(state: CommentsState, input: StartThreadInput): CommentsState {
  const next = validate(state);
  next.threads.push({ threadId: input.threadId, anchor: input.anchor, status: 'open' });
  next.comments.push(pickComment(input, input.threadId));
  return validate(next);
}
// input: { threadId, commentId, personId, personName, timestamp, text }
// A follow-up on a resolved thread reopens it: new discussion voids the old resolution.
export function addComment(state: CommentsState, input: AddCommentInput): CommentsState {
  const next = validate(state);
  const thread = find(next.threads, 'threadId', input.threadId, 'Thread');
  next.comments.push(pickComment(input, input.threadId));
  if (thread.status === 'resolved') {
    thread.status = 'open';
    thread.statusChange = { personId: input.personId, personName: input.personName, timestamp: input.timestamp };
  }
  return validate(next);
}
// input: { threadId, status, personId, personName, timestamp }
export function setStatus(state: CommentsState, input: SetStatusInput): CommentsState {
  const next = validate(state);
  const thread = find(next.threads, 'threadId', input.threadId, 'Thread');
  if (!['open', 'resolved'].includes(input.status)) fail('Invalid thread status');
  thread.status = input.status; thread.statusChange = actorOf(input);
  return validate(next);
}
// A patch sets keys; a null value removes a key. The library never interprets metadata.
function patchMetadata(target: Thread | Comment, patch: Record<string, any>): void {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Invalid metadata');
  const merged: Metadata = { ...(target.metadata || {}) };
  for (const [key, value] of Object.entries(patch)) {
    safeKey(key, 'metadata key', 100);
    if (value === null) delete merged[key]; else merged[key] = value;
  }
  if (Object.keys(merged).length) target.metadata = merged; else delete target.metadata;
}
function liveComment(next: CommentsState, commentId: string): Comment {
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
//   { type: 'thread.reanchor', threadId, anchor, ...actor }   moves the thread; the old anchor is kept in anchorHistory
export function apply(state: CommentsState, operation: Operation): CommentsState {
  if (!operation || typeof operation !== 'object') fail('Invalid operation');
  switch (operation.type) {
    case 'thread.started': {
      const thread = operation.thread || fail('Invalid operation thread');
      if (thread.status !== 'open') fail('A new thread must be open');
      if (!operation.comment || operation.comment.threadId !== thread.threadId) fail('Operation comment must use the new threadId');
      return startThread(state, { ...operation.comment, threadId: thread.threadId, anchor: thread.anchor });
    }
    case 'comment.added': return addComment(state, operation.comment || fail('Invalid operation comment'));
    case 'thread.status': return setStatus(state, operation as SetStatusInput);
    case 'reaction.toggled': {
      const next = validate(state); const actor = actorOf(operation);
      const comment = liveComment(next, operation.commentId as string);
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
      const comment = liveComment(next, operation.commentId as string);
      comment.text = text(operation.text, 'comment text'); comment.edited = actor;
      return validate(next);
    }
    case 'comment.deleted': {
      const next = validate(state); const actor = actorOf(operation);
      const comment = liveComment(next, operation.commentId as string);
      comment.text = ''; comment.deleted = actor; delete comment.reactions;
      return validate(next);
    }
    case 'thread.metadata': {
      const next = validate(state); actorOf(operation);
      patchMetadata(find(next.threads, 'threadId', operation.threadId as string, 'Thread'), operation.metadata as Record<string, any>);
      return validate(next);
    }
    case 'thread.reanchor': {
      const next = validate(state); const actor = actorOf(operation);
      const thread = find(next.threads, 'threadId', operation.threadId as string, 'Thread');
      const anchor = operation.anchor as Anchor;
      validateAnchor(anchor);
      const history = thread.anchorHistory || [];
      history.push({ anchor: thread.anchor, ...actor });
      thread.anchorHistory = history;
      thread.anchor = anchor;
      return validate(next);
    }
    case 'comment.metadata': {
      const next = validate(state); actorOf(operation);
      patchMetadata(liveComment(next, operation.commentId as string), operation.metadata as Record<string, any>);
      return validate(next);
    }
    default: return fail('Unknown operation type');
  }
}
export function commentsFor(state: CommentsState, threadId: string): Comment[] {
  return state.comments.filter(comment => comment.threadId === threadId);
}
export function serialize(state: CommentsState): string {
  // Safe inside an application/json script element, including hostile comment text.
  return JSON.stringify(validate(state)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function createId(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const validateReactionKey = (key: string): string => safeKey(key, 'reaction key', 50);
