# CollabHTML

**A collaboration layer over HTML.**

## Two ways to use CollabHTML

### 1. CLI (no install needed)

Make any HTML file commentable:

```bash
npx collabhtml report.html
```

This creates `report.collab.html` — a self-contained file with the comment layer embedded. Open it in a browser, select text, and start commenting. No server, no dependencies.

### Agent loop (humans review, agents resolve)

The same files work for agents, in both directions:

```bash
collabhtml extract report.collab.html --format markdown   # reviews out (or --format json)
collabhtml reply report.collab.html --thread t1 --name "Agent" --text "Fixed in revision 2."
collabhtml resolve report.collab.html --thread t1 --name "Agent" --text "Verified and resolved."
```

`extract` renders threads, quotes, anchor offsets, and authorship as Markdown (or raw JSON) — readable by humans, parseable by agents. `reply` and `resolve` write back through the same operation protocol the UI uses, so the resolution and its paper trail land in the file attributed to the agent.

### 2. As a library (for developers)

```bash
npm install collabhtml
```

```js
import { empty, startThread, addComment, serialize } from 'collabhtml';

let state = empty('report-42', '3');
state = startThread(state, { threadId: 't1', anchor: [...], commentId: 'c1', personId: 'u-1', personName: 'Manu', timestamp: new Date().toISOString(), text: 'Check the figure.' });
```

Use the primitive in your own app, with or without the default UI. The sources are TypeScript (`src/`, `ui/`) with strict typechecking in CI. See [Use the primitive](#use-the-primitive) and [Use the default UI](#use-the-default-ui) below.

![CollabHTML demo: review an agent-written plan with comments, in a standalone file and in a hosted viewer](docs/collabhtml-demo.gif)

[Watch the sharper MP4](docs/collabhtml-demo.mp4)

## Why

Agents write plans, reports, and reviews faster than people can read them. HTML is an easy format to share. But HTML has no standard comment layer, so teammates cannot review it together. CollabHTML adds that layer to any HTML.

Add comment threads to any static HTML: select text, start a thread, add follow-up comments, and resolve or reopen it.

CollabHTML has two layers:

- **The primitive** is headless. It has the Comment API and HTML anchors. It has no UI. You call methods and listen to events.
- **The default UI** is an optional comments pane. It uses only the primitive's public API. Use it, or build your own.

The host owns identity, permissions, and storage. HTML export is an optional function.

## Comment API

```text
Thread:  { threadId, anchor, status: "open" | "resolved", statusChange?, metadata? }
Comment: { commentId, threadId, personId, personName, timestamp, text,
           reactions?, edited?, deleted?, metadata? }
```

The first comment starts a thread. Every follow-up comment uses the same `threadId`. The anchor and status belong to the thread. The first six comment fields are required. `statusChange`, `edited`, and `deleted` record `{ personId, personName, timestamp }`. `reactions` maps a key to the `personId` values that chose it. `metadata` is host data that the library stores but never interprets.

State is `{ schemaVersion: 3, document: { id, revision }, threads, comments }`.

Every change is an **operation**:

```js
{ type: 'thread.started', thread: { threadId, anchor, status: 'open' }, comment }
{ type: 'comment.added', comment }
{ type: 'thread.status',    threadId, status,         ...actor }
{ type: 'reaction.toggled', commentId, key,          ...actor }  // adds or removes the actor's reaction
{ type: 'comment.edited',   commentId, text,         ...actor }
{ type: 'comment.deleted',  commentId,               ...actor }  // keeps a tombstone; text is removed
{ type: 'thread.metadata',  threadId, metadata,      ...actor }  // a patch; null removes a key
{ type: 'comment.metadata', commentId, metadata,     ...actor }
```

`actor` means `personId`, `personName`, and `timestamp`: **who did it, and when.** Every operation after a comment is created requires them. Upvotes and emoji use the same reaction operation (the key `upvote` or `👍`). The library does not check who may edit or delete: the host decides permissions.

`CollabHTML.comments` provides pure functions that work in browsers and Node.js:

| Function | Purpose |
|---|---|
| `empty(documentId, revision)` | New state for one document revision |
| `apply(state, operation)` | Validate and apply one operation; returns new state |
| `startThread`, `addComment`, `setStatus` | Direct forms of three operations. `apply` is the general form |
| `commentsFor(state, threadId)` | Comments in one thread, in order |
| `validate(state)`, `validatePerson(person)`, `validateAnchor(anchor)` | Validation |
| `serialize(state)` | JSON safe to embed in HTML |
| `createId()` | Random UUID for new `threadId` or `commentId` values |

## Use the primitive

```js
const comments = CollabHTML.create({
  root: document.querySelector('#report'),
  state: await host.load(),                          // or CollabHTML.comments.empty('report-42', '3')
  person: { personId: 'u-123', personName: 'Manu' }, // from the host's login session
  onChange(operation, { previous, next, document }) {
    return host.apply(operation);                    // may return the host's latest state
  }
});
```

**Options:**

- `root`: element or selector to comment on.
- `state`: initial state. Default: empty state for the root ID.
- `person`: who changes are made as. You can also call `setPerson()` later.
- `onChange(operation, context)`: called before a change is accepted. Throw or reject to refuse it; existing comments stay unchanged. Return the host's latest state to use it instead of applying the operation locally. Return nothing to apply it locally.
- `highlight: false`: turn off the built-in text highlight (CSS Custom Highlight API).

**Methods.** Changes return a promise for `{ operation, state }` and reject when they fail. They run one at a time, in order, so none is dropped.

```js
comments.addThread({ anchor, text });          // anchor comes from the 'selection' event
comments.addComment({ threadId, text });       // follow-up in a thread
comments.setStatus(threadId, 'resolved');
comments.toggleReaction(commentId, '👍');
comments.editComment(commentId, text);
comments.deleteComment(commentId);
comments.updateMetadata({ threadId }, { actionItem: true });   // or { commentId }; null removes a key

comments.getState();            // defensive copy
comments.setState(latest);      // show comments from other people
comments.view();                // [{ thread, comments, placed }] in page order; placed is false when the text is gone
comments.getPerson();  comments.setPerson({ personId, personName });
comments.focus(threadId);       // scroll to the text, select it, emit 'focus'; false for an unknown thread
comments.destroy();
```

**Events.** `on(type, handler)` returns a function that removes the handler.

| Event | When | Detail |
|---|---|---|
| `update` | Comments changed, or text moved or disappeared | `{ operation? }` |
| `selection` | The user selected text on the page | An anchor, ready for `addThread` |
| `focus` | `focus()` ran | `threadId` |
| `busy` | Changes are pending, or finished | `true` or `false` |
| `destroy` | `destroy()` ran | none |

The primitive has no UI, storage, loading, networking, polling, file export, or automatic startup. `personId` and `personName` are data, not proof of identity: the host must verify them.

## Use the default UI

```js
CollabHTMLPane.mount(comments, {
  reactions: ['upvote', '👍', '🎉'],
  threadActions: [{ label: 'Toggle Action Item',
    run: (thread, api) => api.updateMetadata({ threadId: thread.threadId }, { actionItem: thread.metadata?.actionItem ? null : true }) }],
  threadBadges: thread => (thread.metadata?.actionItem ? ['Action item'] : []),
  personAvatar: personId => avatarUrlFor(personId)
});
```

Each thread card shows the quoted text (click it to scroll to that text), the comments with avatars and relative times, and one inline **Reply…** input (press Enter to send). Under each comment is a row of small icon controls:

- a reaction chip (the first reaction you offer, such as an upvote) and, when you offer more than one, an add-reaction button;
- a copy button;
- one `•••` menu. On a thread's first comment it also holds the thread actions: **Resolve** or **Reopen**, then your `threadActions`. On your own comments it adds **Edit** and **Delete**, then your `commentActions`.

The header shows the comment count, a filter, and a close button. Popovers close on Escape or a click elsewhere. Threads are listed in page order.

Options, all optional:

- `open: false`: start collapsed.
- `filter`: starting view: `all`, `open`, `resolved`, or `mine`.
- `actions: [{ label, run(comments) }]`: toolbar buttons in the header.
- `threadActions: [{ label, run(thread, comments) }]`: thread items in the `•••` menu of the first comment.
- `commentActions: [{ label, run(comment, comments) }]`: comment items in each comment's `•••` menu.
- `reactions`: the reactions people can choose. The host picks the keys; the primitive owns the behavior. Default: `['👍']`.
- `personAvatar(personId)`: returns an `https:` or `data:image` URL. Without one, the pane shows a colored circle with the person's initial.
- `threadBadges(thread)`: returns up to five short strings shown as badges.

If the primitive has no person, the pane asks for a name and uses an unverified per-session `personId`. If the host set a person, the pane shows it read-only. Host actions change data through the primitive's methods, so every change goes through validation and `onChange`.

**To build your own UI,** skip `collabhtml-pane.js`. Listen to `selection` and `update`, call `view()` to draw, and call the methods. The default UI does the same and nothing more. The UI text and colors are fixed in the pane today; your own UI controls them.

## Optional HTML export

`dist/collabhtml-export.js` adds one function:

```js
const html = CollabHTML.exportHTML({
  root: document.querySelector('#report'),
  state: comments.getState(),
  runtimeSource: libraryCode,
  bootstrapSource: startupCode
});
```

It only returns HTML. The caller supplies the library code and startup code to embed. It does not fetch scripts, start the pane, add buttons, download files, or warn about unsaved changes. Give the root a unique ID. Mark library and host scripts with `data-collabhtml-runtime` and `data-collabhtml-bootstrap`; export replaces them with the supplied code. Comments are embedded in `<script type="application/json" data-collabhtml-comments>`.

## Connect a service

The browser runs CollabHTML. The service stores operations or state in any language (Node.js, Python, Java, and so on):

```text
UI → comments.addComment() → onChange(operation) → service API → database or files
service API → latest state → onChange return value, or setState()
```

Store operations as rows or apply them to a stored state. Operations append or change one thread, so two people adding comments do not overwrite each other. The service owns authentication, permissions, encryption, ordering, and notifications. For updates from other people, call `setState()` after polling, a push message, or a manual Refresh.

## Responsibilities at a glance

```text
src/                         THE PRIMITIVE (headless, no UI)
  comments.js                Comment API: threads, comments, operations, validation
  anchors.js                 Selected text -> W3C selectors -> DOM range; highlights
  controller.js              create(): methods, view(), events, change queue
  export-html.js             Optional HTML packaging; no startup or download

ui/                          DEFAULT UI (optional; public API only)
  pane.js                    Pane shell: styles, compose form, filter, mount()
  threads.js                 Thread cards: comments, reactions, menus, edit/delete

examples/standalone/          SINGLE-FILE DEMONSTRATION
  index.html                 Sample content
  bootstrap.js               Starts comments; Save button, download, unsaved warning
  README.md                  Standalone usage

examples/viewer/              SERVICE-INTEGRATION DEMONSTRATION
  index.html                 Upload controls and isolated iframe
  viewer.js                  Upload processing, identity, injection, message checks
  bridge.js                  Iframe startup; load/apply messages; Refresh and Save actions
  storage.js                 Example storage contract: load and apply
  server.js                  Loopback server and comments API
  file-store.js              Server JSON persistence; applies one operation at a time
  README.md                  Integration and security guide

scripts/build.js             Builds the bundles and the standalone example
docs/                        Demo video, GIF, and the scripts that record them (docs/demo/)
tests/                       Unit, API, boundary, and browser checks
```

Each implementation and test file starts with its responsibility. A test enforces the layers: the primitive has no UI, storage, or export code, and the UI calls only public methods.

| Bundle | Contains | Needs |
|---|---|---|
| `dist/collabhtml.js` | The primitive | Nothing |
| `dist/collabhtml-pane.js` | The default UI | `collabhtml.js` first |
| `dist/collabhtml-export.js` | `exportHTML()` | `collabhtml.js` first |
| `dist/collabhtml-full.js` | All three | Nothing |
| `dist/comments.js` | The Comment API for Node (ESM/CJS) | Nothing |
| `dist/cli.cjs` | The `collabhtml` CLI | Nothing |

For bundler consumers, the package also exposes ES module entries (with types): `collabhtml` (Comment API), `collabhtml/controller` (`create()`), and `collabhtml/ui` (`mount()`, thread rendering). The `dist/*.js` IIFE bundles above are only for `<script>` tags and inlined single-file use.

## Run the examples

Requires Node.js 20 or newer. Run `npm install` first for the build and dev tooling (TypeScript, esbuild, tsx — all dev-only; the library itself has no dependencies).

```sh
npm run build
npm test
npm run dev
```

- **Standalone:** open <http://127.0.0.1:4173>, or open `dist/demo.html` directly. Enter your name, select text, add a comment, reply, resolve, and click **Save HTML with comments**. Comments stay in memory until you save. See [the standalone guide](examples/standalone/README.md).
- **Viewer service:** open <http://127.0.0.1:4173/examples/viewer/index.html>. Upload HTML or open the sample. Each operation is sent to the example server and stored in `.collabhtml-data/comments-v3/`. See [the viewer guide](examples/viewer/README.md).

## Anchors

An anchor is a list of [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) selectors, the same shape [Hypothesis](https://github.com/hypothesis/client) and [Apache Annotator](https://github.com/apache/incubator-annotator) use:

```js
[
  { type: 'TextQuoteSelector',    exact: 'revenue increased 12 percent', prefix: 'The report says ', suffix: ' this quarter.' },
  { type: 'TextPositionSelector', start: 16, end: 44 }
]
```

The quote selector is required. The position is a hint. Comments can span inline elements. Changed or ambiguous text shows the thread as **Unplaced**; it is never moved silently. The matcher does exact matching only. Load state for the correct document revision. Revision migration is not implemented.

## Host isolation

The primitive attaches to content **in the same document**. Do not render untrusted uploaded HTML in the host's authenticated DOM. The viewer example keeps content in a sandboxed iframe and passes operations to the parent through a validated `postMessage` bridge. Never expose host tokens to document scripts.

## Export and security limits

- Export embeds the library and comments but **does not inline external page assets**.
- Export preserves the page's existing scripts. It is not an HTML sanitizer. Only open copies from trusted authors.
- Comment text is inserted with `textContent`. Embedded JSON escapes `<`.
- Exported comments are editable, not signed. Imported `personId` and `personName` values must not become trusted identities.
- Private hosted comments need encryption for comment text and anchor quotes. This prototype does not implement encryption.

## Generated files and tests

```text
dist/                          Generated bundles and demo.html (not source)
.collabhtml-data/comments-v3/  Example-server comment files (not source)
test-results/                  Browser-check output (not source)

tests/comments.test.js         Comment API: operations, reactions, edit/delete, metadata, validation
tests/anchors.test.js          W3C selectors: creation, relocation, ambiguity, validation
tests/library-boundary.test.js Layer boundaries: primitive has no UI; UI uses only public API
tests/viewer-storage.test.js   Example storage contract
tests/file-store.test.js       Example persistence and API
tests/browser-smoke.js         Headless primitive, default UI, setState, standalone export
tests/viewer-browser-smoke.js  Upload/viewer integration
```

Browser checks (with `npm run dev` running):

```sh
browser-control execute --file tests/browser-smoke.js
browser-control execute --file tests/viewer-browser-smoke.js
```

Comment files from schema version 2 are not read. The example server now uses `comments-v3/`.

## Regenerate the demo video

The demo is one live run made with Browser Control, not a slideshow. A script types, drags, clicks, and shows annotations next to the controls. While it runs, it saves sharp page screenshots to a frames folder (`FRAMES` at the top of `docs/demo/scene.js`). `ffmpeg` then makes the MP4 and the GIF. With `npm run dev` running:

```sh
browser-control execute 'await page.goto("http://127.0.0.1:4173/dist/demo.html")'   # new session; note its id
browser-control execute --session <id> --file docs/demo/scene.js                    # about 70 seconds
python3 docs/demo/render.py <frames-dir> docs   # writes docs/collabhtml-demo.mp4 and .gif
```

Do not set a viewport size. The page then fills the real window. `render.py` needs `ffmpeg`. It also accepts a raw `.mp4` from `browser-control recording start`, but that capture is softer.

## Next increments

A pluggable anchoring option (for example Apache Annotator for fuzzy matching); host-supplied UI text and theme; in-line view; element pins; push updates in the viewer example; parent-owned pane with iframe selection bridge; keyboard and screen-reader refinements; encrypted comment storage.
