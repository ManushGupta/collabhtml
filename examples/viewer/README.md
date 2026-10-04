# Host viewer example

**Responsibility:** demonstrate service-owned uploads, isolation, identity, storage, and startup. None of these files is required by the CollabHTML library.

Run `npm run build` and `npm run dev` at the project root. Open:

<http://127.0.0.1:4173/examples/viewer/>

Upload a static HTML file or click **Open sample HTML**. The viewer injects CollabHTML automatically. Add comments, then reopen the exact same file to restore them. **Refresh** loads comments added by other people. See [the standalone guide](examples/standalone/README.md) for the save-a-copy flow.

## Boundaries

```text
Parent viewer                  Opaque-origin sandbox iframe
--------------                 ---------------------------
Upload + document identity     Uploaded HTML
Person (personId, personName)  CollabHTML primitive + minimal custom UI
Comment storage                Small load/apply bridge
Validated request handler  <-> postMessage
```

The custom UI inside the iframe is built only on the primitive (`create`, `view`, events, methods) — no default pane. It proves a viewer needs just the primitive plus its own rendering. A future split UI can move the pane to the parent while keeping selections and highlights in the frame.

The bridge loads state, calls `CollabHTML.create` with the `person` from the parent, and draws thread cards from `view()`: quote (click to focus), comments, an inline reply box, and Resolve/Reopen buttons. `onChange(operation)` sends each operation to the parent, which returns the server's latest state. The primitive uses that state, so other people's comments appear after each change. The **Refresh** button calls `setState()`. The primitive never loads or saves storage.

This example injects `dist/collabhtml.js` (primitive only). HTML export lives in the standalone example, not here.

The iframe has `allow-scripts allow-forms allow-downloads`, not `allow-same-origin`. It cannot read host cookies or storage. `allow-forms` lets the pane receive submit events; handlers prevent navigation, and CSP `form-action 'none'` blocks actual submissions. CSP also blocks network requests and external assets. Document scripts are removed by default; enable them only for trusted HTML. The stripping pass is not a general-purpose sanitizer; sandbox and CSP are the security boundaries.

Messages check frame/parent source, a per-load random channel, operation type, comment schema, and exact document identity. The opaque frame requires `postMessage(..., '*')`; source/channel validation is mandatory. The channel is not proof of identity: document scripts can inspect their own bridge and send operations. A production service must take `personId` from its login session and reject operations whose person does not match.

## Storage

```text
Custom UI → comments.addComment() → onChange(operation) → iframe bridge → parent → HTTP adapter → server → JSON files
```

`storage.js` defines a two-method contract and adapters:

```js
const store = CollabHTMLViewerStorage.createStore({
  async load(document) { return api.load(document); },              // -> state
  async apply(document, operation) { return api.apply(document, operation); } // -> latest state
});
```

`createStore` validates document identity, the comment schema, and size limits for any adapter. `httpAdapter` is used by the viewer. `memoryAdapter` is used by tests.

The development server exposes:

- `GET /api/comments?document=ID&revision=REVISION` → state
- `POST /api/comments` with `{ document, operation }` → state after the operation

`file-store.js` loads the file, applies one operation, and writes the result through a temporary file and atomic rename. Files live in `.collabhtml-data/comments-v3/`, excluded from Git, one per document revision with a hashed filename. Two people adding comments do not overwrite each other. Duplicate IDs or unknown threads are rejected with HTTP 400. Read/apply/write is serialized in one Node process, not across multiple server processes.

A SHA-256 hash of the uploaded HTML identifies the document. Byte-identical HTML restores its comments; changed HTML gets a different identity. The example derives `personId` from the entered name; it is not authenticated. JSON files are unencrypted; do not use this example for sensitive documents.

This is a loopback-only development service. Host and Origin checks reject unrelated browser origins. There is no login, document ACL, trusted identity, or encryption. A production service must add those controls.

Replace the adapter, not the pane or bridge, with your backend. Use your artifact ID and revision instead of the content hash. Limit the bridge to load/apply requests for the open document. Never give iframe code access to host credentials.
