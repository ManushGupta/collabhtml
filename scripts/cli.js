#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
CollabHTML CLI — Make any HTML file commentable

Usage:
  collabhtml <input.html> [--out <output.html>]
  collabhtml --help
  collabhtml --version

Options:
  --out   Output file path (default: <input>.collab.html)
  --help  Show this help message
  --version  Show version

Examples:
  collabhtml report.html
  collabhtml report.html --out review.html
  npx collabhtml report.html
`);
}

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {void}
 */
function wrap(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const input = fs.readFileSync(inputPath, 'utf8');

  // Build the runtime and bootstrap code
  const root = path.resolve(__dirname, '..');
  /**
   * @param {string} file
   * @returns {string}
   */
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');

  const primitive = ['src/comments.js', 'src/anchors.js', 'src/controller.js'].map(read).join('\n');
  const pane = ['ui/threads.js', 'ui/pane.js'].map(read).join('\n');
  const exporter = read('src/export-html.js');
  const full = [primitive, pane, exporter].join('\n');
  const bootstrap = read('examples/standalone/bootstrap.js');

  /**
   * @param {string} source
   * @returns {string}
   */
  const escapeScript = source => source.replace(/<\/script/gi, '<\\/script');

  // Replace placeholders or inject before </body>
  const runtimeScript = `<script data-collabhtml-runtime data-root="main" data-document="${path.basename(inputPath, '.html')}" data-revision="1">${escapeScript(full)}</script>`;
  const bootstrapScript = `<script data-collabhtml-bootstrap>${escapeScript(bootstrap)}</script>`;

  let output;
  if (input.includes('<!-- COLLABHTML_RUNTIME -->')) {
    output = input
      .replace('<!-- COLLABHTML_RUNTIME -->', runtimeScript)
      .replace('<!-- COLLABHTML_BOOTSTRAP -->', bootstrapScript);
  } else if (input.includes('</body>')) {
    output = input.replace('</body>', `${runtimeScript}\n${bootstrapScript}\n</body>`);
  } else {
    output = input + '\n' + runtimeScript + '\n' + bootstrapScript;
  }

  fs.writeFileSync(outputPath, output);
  console.log(`Wrapped: ${inputPath} -> ${outputPath}`);
  console.log(`Open ${outputPath} in your browser to start commenting.`);
}

function main() {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(getVersion());
    return;
  }

  // First non-flag argument is the input file
  const inputPath = args.find(arg => !arg.startsWith('-'));
  if (!inputPath) {
    console.error('Error: No input file specified');
    showHelp();
    process.exit(1);
  }

  let outputPath = null;
  const outIndex = args.indexOf('--out');
  if (outIndex !== -1 && args[outIndex + 1]) {
    outputPath = args[outIndex + 1];
  } else {
    outputPath = inputPath.replace(/\.html$/i, '') + '.collab.html';
  }

  wrap(inputPath, outputPath);
}

main();
