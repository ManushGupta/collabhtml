# Standalone example

**Responsibility:** show the library and HTML export working in one file, with no server.

- `index.html`: sample report content; build placeholders are not a runnable app.
- `bootstrap.js`: calls `CollabHTML.create`, mounts the default UI with `CollabHTMLPane.mount`, adds **Save HTML with comments** and **Copy link**, downloads the copy, warns about unsaved changes.

Run `npm run build` from the project root. Open `dist/demo.html` directly, or run `npm run dev` and open <http://127.0.0.1:4173/>.

The build embeds `dist/collabhtml-full.js` (primitive, default UI, and export) and this example's bootstrap. The library's `exportHTML` function packages the document, comments, library code, and startup code. It does not choose buttons or start the pane.

**Copy link** shows the host's role: the example builds the URL, listens to the primitive's `focus` event to update the address bar, and calls `comments.focus(threadId)` when a page opens with `#thread=ID`.

Enter your name, select text, add a comment, add follow-ups, and click **Save HTML with comments**. Comments stay in memory until saved. No person is set on the primitive, so the default UI asks for a name and gives each page session an unverified `personId`. Names and exported comments are editable, not authenticated or signed.
