# CollabHTML

**A collaboration layer over HTML.**

![CollabHTML demo: review an agent-written plan with comments, in a standalone file and in a hosted viewer](docs/collabhtml-demo.gif)

[Watch the sharper MP4](docs/collabhtml-demo.mp4) · Try it: `npx collabhtml report.html`, open the `.collab.html` file, select text, and comment. No server, no account.

## Quick start

**CLI — commentable files, no install:**

```bash
npx collabhtml report.html   # -> report.collab.html, self-contained
```

**Library — developers:**

```bash
npm install collabhtml
```

```js
import { empty, startThread } from 'collabhtml';

let state = empty('report-42', '3');
state = startThread(state, { threadId: 't1', anchor: [...], commentId: 'c1', personId: 'u-1', personName: 'Manu', timestamp: new Date().toISOString(), text: 'Check the figure.' });
```

**Agent loop — humans review, agents resolve (or the reverse):**

- `extract report.collab.html [--format markdown|json]` — pulls reviews out: threads, quotes, anchor offsets, authorship. Markdown reads naturally, JSON parses programmatically.
- `reply … --thread t1 --name "Agent" --text "…"` — follows up on a thread (reopens it if resolved).
- `resolve … --thread t1 --name "Agent" [--text "…"]` — optionally comments first, then marks resolved.
- `reopen … --thread t1 --name "Agent" [--text "…"]` — flips a resolved thread back open.
- `thread … --exact "quoted text" --name "Agent" --text "…"` — starts a new thread yourself; prints its ID.
- `reanchor … --thread t1 --exact "new wording" --name "Agent"` — moves a thread after editing its text, keeping history.

All writes go through the same operation protocol the UI uses, with stable per-name identity (`agent:<name>` unless `--id` is given). For agents: `npx skills add ManushGupta/collabhtml --skill collabhtml-review` (or `-g` for global); see [`skills/collabhtml-review/SKILL.md`](skills/collabhtml-review/SKILL.md).

## Why

Agents write plans, reports, and reviews faster than people can read them. HTML is an easy format to share. But HTML has no standard comment layer, so teammates cannot review it together. CollabHTML adds that layer to any HTML: select text, start a thread, follow up, resolve or reopen.

Two layers: **the primitive** is headless (Comment API + anchors; you call methods, listen to events). **The default UI** is an optional pane built only on the primitive's public API — use it or build your own. The host owns identity, permissions, and storage.

## Comment API

```text
Thread:  { threadId, anchor, status: "open" | "resolved", statusChange?, anchorHistory?, metadata? }
Comment: { commentId, threadId, personId, personName, timestamp, text,
           reactions?, edited?, deleted?, metadata? }
```

The first comment starts a thread; follow-ups share its `threadId`. A follow-up on a resolved thread reopens it. Anchors move only through `thread.reanchor`, which keeps the old anchor in `anchorHistory` with its mover. State is `{ schemaVersion: 3, document: { id, revision }, threads, comments }`.

Every change is an **operation** (`actor` = `personId`, `personName`, `timestamp` — who did it, and when):

```js
{ type: 'thread.started', thread: { threadId, anchor, status: 'open' }, comment }
{ type: 'comment.added', comment }
{ type: 'thread.status',    threadId, status,         ...actor }
{ type: 'thread.reanchor',  threadId, anchor,         ...actor }
{ type: 'reaction.toggled', commentId, key,          ...actor }
{ type: 'comment.edited',   commentId, text,         ...actor }
{ type: 'comment.deleted',  commentId,               ...actor }  // tombstone; text removed
{ type: 'thread.metadata',  threadId, metadata,      ...actor }  // patch; null removes a key
{ type: 'comment.metadata', commentId, metadata,     ...actor }
```

Pure functions, browsers and Node.js (`import` from `collabhtml`; the browser global is `CollabHTML.comments`):

| Function | Purpose |
|---|---|
| `empty(documentId, revision)` | New state for one document revision |
| `apply(state, operation)` | Validate and apply one operation; returns new state |
| `startThread`, `addComment`, `setStatus` | Direct forms of three operations. `apply` is the general form |
| `commentsFor(state, threadId)` | Comments in one thread, in order |
| `validate(state)`, `validatePerson(person)`, `validateAnchor(anchor)` | Validation |
| `serialize(state)` | JSON safe to embed in HTML |
| `createId()` | Random UUID for new `threadId` or `commentId` values |

The library never checks who may edit or delete: the host decides permissions. Upvotes and emoji share the reaction operation (`upvote` or `👍`).

## Use the primitive

```js
import { create } from 'collabhtml/controller'; // or CollabHTML.create via script tag

const comments = create({
  root: document.querySelector('#report'),
  state: await host.load(),                          // or empty('report-42', '3')
  person: { personId: 'u-123', personName: 'Manu' }, // from the host's login session
  onChange(operation, { previous, next, document }) {
    return host.apply(operation);                    // may return the host's latest state
  }
});
```

Options: `root` (element or selector), `state` (default: empty state for the root ID), `person` (or `setPerson()` later), `onChange(operation, context)` (throw/reject to refuse; return host state to override; return nothing to apply locally), `highlight: false` (off the text highlight).

Methods return a promise for `{ operation, state }`, run one at a time, in order:

```js
comments.addThread({ anchor, text });          // anchor comes from the 'selection' event
comments.addComment({ threadId, text });
comments.setStatus(threadId, 'resolved');
comments.toggleReaction(commentId, '👍');
comments.editComment(commentId, text);
comments.deleteComment(commentId);
comments.updateMetadata({ threadId }, { actionItem: true });
comments.reanchor(threadId, anchor);           // moves the thread; history kept
comments.getState(); comments.setState(latest);
comments.view();                               // [{ thread, comments, placed }] in page order
comments.getPerson(); comments.setPerson({ personId, personName });
comments.focus(threadId); comments.destroy();
```

Events (`on(type, handler)` returns an unsubscriber): `update` (comments or placement changed), `selection` (user selected text — anchor ready for `addThread`), `focus` (`threadId`), `busy` (boolean), `destroy`.

The primitive has no UI, storage, loading, networking, polling, export, or startup. `personId`/`personName` are data, not proof of identity: the host verifies them.

## Use the default UI

```js
import { mount } from 'collabhtml/ui'; // or CollabHTMLPane.mount via script tag

mount(comments, {
  reactions: ['upvote', '👍', '🎉'],
  threadActions: [{ label: 'Toggle Action Item',
    run: (thread, api) => api.updateMetadata({ threadId: thread.threadId }, { actionItem: thread.metadata?.actionItem ? null : true }) }],
  threadBadges: thread => (thread.metadata?.actionItem ? ['Action item'] : []),
  personAvatar: personId => avatarUrlFor(personId)
});
```

Thread cards show the quoted text (click to scroll to it), comments with relative times, an inline reply box, reactions, and a `•••` menu (Resolve/Reopen, edits, deletes, your actions). Reanchored threads show their original quote for provenance. Optional: `open: false`, `filter` (`all`/`open`/`resolved`/`mine`), `actions`, `threadActions`, `commentActions`, `reactions` (default `['👍']`), `personAvatar`, `threadBadges` (up to five).

Without a host person, the pane asks for a name (unverified per-session ID). **To build your own UI,** skip the pane: listen to `selection` and `update`, draw from `view()`, call the methods.

## HTML export

```js
const html = CollabHTML.exportHTML({
  root: document.querySelector('#report'),
  state: comments.getState(),
  runtimeSource: libraryCode,
  bootstrapSource: startupCode
});
```

Returns self-contained HTML with library, startup, and comments embedded (`<script type="application/json" data-collabhtml-comments>`). The caller supplies the code; the function fetches nothing and downloads nothing. Roots without an ID get one assigned.

## Connect a service

```text
UI → comments.addComment() → onChange(operation) → service API → database or files
service API → latest state → onChange return value, or setState()
```

Store operations as rows or apply them to stored state. The service owns auth, permissions, encryption, ordering, and notifications; poll/push then `setState()` for other people's updates.

## Anchors

[W3C Web Annotation](https://www.w3.org/TR/annotation-model/) selectors, like [Hypothesis](https://github.com/hypothesis/client):

```js
[
  { type: 'TextQuoteSelector',    exact: 'revenue increased 12 percent', prefix: 'The report says ', suffix: ' this quarter.' },
  { type: 'TextPositionSelector', start: 16, end: 44 }
]
```

Quote required; position is a hint. Changed or ambiguous text shows **Unplaced** — never moved silently. Anchors change only via `thread.reanchor` (exact matching; no fuzzy recovery yet). State belongs to one document revision; cross-revision migration is the host's job.

## Security

- The primitive attaches **in the same document**. Untrusted uploads belong in a sandboxed iframe with a validated `postMessage` bridge (as in `examples/viewer/`). Never expose host tokens to document scripts.
- Export is not a sanitizer: it preserves page scripts and embeds editable, unsigned comments. Open copies from trusted authors only.
- Comment text uses `textContent`; embedded JSON escapes `<`. Private hosted comments need encryption (not implemented).

## Development

```text
src/                          THE PRIMITIVE (headless ESM TypeScript)
  comments.ts                  Comment API: threads, comments, operations, validation
  anchors.ts                   Selected text -> W3C selectors -> DOM range; highlights
  controller.ts                create(): methods, view(), events, change queue
  export-html.ts               Optional HTML packaging; no startup or download
  brief.ts                     Agent briefs; embedded-state read/write (no DOM)
  entries/                     Browser-global shims for the IIFE bundles (primitive, pane, export, full)
ui/                           DEFAULT UI (optional; public API only)
  pane.ts                      Pane shell: styles, compose form, filter, mount()
  threads.ts                   Thread cards: comments, reactions, menus, edit/delete
scripts/                      build.ts (esbuild bundles + demo), cli.ts (wrap/extract/reply/resolve/reopen/thread/reanchor/skill)
skills/collabhtml-review/     SKILL.md agent instructions
examples/standalone/          Single-file demo (index.html, bootstrap.js)
examples/viewer/              Service-integration demo (upload, iframe, bridge, storage contract, server, file store)
tests/                        Unit, API, boundary, and CLI checks (browser-smoke files run via Browser Control)
```

| Bundle | Contains | Needs |
|---|---|---|
| `dist/collabhtml.js` | The primitive | Nothing |
| `dist/collabhtml-pane.js` | The default UI | `collabhtml.js` first |
| `dist/collabhtml-export.js` | `exportHTML()` | `collabhtml.js` first |
| `dist/collabhtml-full.js` | All three | Nothing |
| `dist/comments.js` | Comment API for Node (ESM/CJS) | Nothing |
| `dist/cli.cjs` | The `collabhtml` CLI | Nothing |

ES module entries with types (for bundlers — the IIFE bundles above are only for `<script>` tags and inlined single-file use): `collabhtml` (Comment API), `collabhtml/controller` (`create()`), `collabhtml/ui` (`mount()`, thread rendering).

```sh
npm install   # dev tooling (TypeScript, esbuild, tsx — the library has no dependencies)
npm run build # bundles + demo.html + type declarations
npm test      # build + unit tests (47 and counting; typecheck runs in CI)
npm run dev   # example server at http://127.0.0.1:4173
```

- **Standalone:** open <http://127.0.0.1:4173> or `dist/demo.html` directly. Comments stay in memory until you save.
- **Viewer:** open <http://127.0.0.1:4173/examples/viewer/index.html>. Operations persist to `.collabhtml-data/comments-v3/`.
- Browser checks: `browser-control execute --file tests/browser-smoke.js` (regenerates the demo video via `docs/demo/scene.js` + `render.py`; needs `ffmpeg`).

## Next increments

Pluggable fuzzy anchoring; host-supplied UI text and theme; in-line view; merge/extract parity for multi-copy reviews; push updates in the viewer; keyboard and screen-reader refinements; encrypted comment storage.
