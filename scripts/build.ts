// Responsibility: assemble browser bundles and the self-contained standalone example.
//   dist/collabhtml.js          the headless primitive (controller + its comment/anchor modules)
//   dist/collabhtml-pane.js     the optional default UI (ui/); load after collabhtml.js
//   dist/collabhtml-export.js   the optional HTML export function (src/export-html.js); load after collabhtml.js
//   dist/collabhtml-full.js     all three in one file, for the examples
//   dist/comments.js            the comment API as an ES module for Node
//   dist/cli.cjs                the bundled CLI for npx / npm bin
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
const escapeScript = (source: string): string => source.replace(/<\/script/gi, '<\\/script');

function bundle(entry: string, outfile: string, options: { globalName?: string; platform?: 'browser' | 'node'; format?: 'iife' | 'esm' | 'cjs'; banner?: string } = {}): void {
  buildSync({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(dist, outfile),
    bundle: true,
    platform: options.platform ?? 'browser',
    format: options.format ?? 'iife',
    globalName: options.globalName,
    banner: options.banner ? { js: options.banner } : undefined,
    logLevel: 'silent'
  });
}

// Browser bundles expose the same globals as before for script-tag use.
bundle('src/controller.ts', 'collabhtml.js', { globalName: 'CollabHTML' });
bundle('ui/pane.ts', 'collabhtml-pane.js', { globalName: 'CollabHTMLPane' });
bundle('src/export-html.ts', 'collabhtml-export.js', { globalName: 'CollabHTMLExporter' });
bundle('src/full.ts', 'collabhtml-full.js', { globalName: 'CollabHTMLFull' });
// Node entry: the comment API as an ES module.
bundle('src/comments.ts', 'comments.js', { platform: 'node', format: 'esm' });
// Node entry as CommonJS for require() consumers (e.g. the .cjs example code).
bundle('src/comments.ts', 'comments.cjs', { platform: 'node', format: 'cjs' });
// CLI: bundled CommonJS so npx needs no build step at install time.
bundle('scripts/cli.ts', 'cli.cjs', { platform: 'node', format: 'cjs', banner: '#!/usr/bin/env node' });
fs.chmodSync(path.join(dist, 'cli.cjs'), 0o755);

const full = read('dist/collabhtml-full.js');
const bootstrap = read('examples/standalone/bootstrap.js');
fs.copyFileSync(path.join(root, 'examples/standalone/bootstrap.js'), path.join(dist, 'bootstrap.js'));
const demo = read('examples/standalone/index.html');
fs.writeFileSync(path.join(dist, 'demo.html'), demo.replace('<!-- COLLABHTML_RUNTIME -->',
  `<script data-collabhtml-runtime data-root="#report" data-document="collabhtml-demo" data-revision="1">${escapeScript(full)}</script>`)
  .replace('<!-- COLLABHTML_BOOTSTRAP -->', `<script data-collabhtml-bootstrap>${escapeScript(bootstrap)}</script>`));
console.log('Built primitive, pane, export, full bundle, node entry, CLI, and standalone example');
