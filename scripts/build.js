// Responsibility: assemble browser bundles and the self-contained standalone example.
//   dist/collabhtml.js          the headless primitive (src/comments.js, anchors.js, controller.js)
//   dist/collabhtml-pane.js     the optional default UI (ui/); load after collabhtml.js
//   dist/collabhtml-export.js   the optional HTML export function (src/export-html.js); load after collabhtml.js
//   dist/collabhtml-full.js     all three in one file, for the examples
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
/**
 * @param {string} file
 * @returns {string}
 */
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
/**
 * @param {string[]} files
 * @returns {string}
 */
const bundle = files => files.map(read).join('\n');
const primitive = bundle(['src/comments.js', 'src/anchors.js', 'src/controller.js']);
const pane = bundle(['ui/threads.js', 'ui/pane.js']);
const exporter = read('src/export-html.js');
const full = [primitive, pane, exporter].join('\n');
const bootstrap = read('examples/standalone/bootstrap.js');
/**
 * @param {string} source
 * @returns {string}
 */
const escapeScript = source => source.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/collabhtml.js'), primitive);
fs.writeFileSync(path.join(root, 'dist/collabhtml-pane.js'), pane);
fs.writeFileSync(path.join(root, 'dist/collabhtml-export.js'), exporter);
fs.writeFileSync(path.join(root, 'dist/collabhtml-full.js'), full);
const demo = read('examples/standalone/index.html');
fs.writeFileSync(path.join(root, 'dist/demo.html'), demo.replace('<!-- COLLABHTML_RUNTIME -->',
  `<script data-collabhtml-runtime data-root="#report" data-document="collabhtml-demo" data-revision="1">${escapeScript(full)}</script>`)
  .replace('<!-- COLLABHTML_BOOTSTRAP -->', `<script data-collabhtml-bootstrap>${escapeScript(bootstrap)}</script>`));
console.log('Built primitive, pane, export, full bundle, and standalone example');
