// Responsibility: CLI — wrap HTML for commenting; read and write review state.
// Usage:
//   collabhtml <input.html> [--out <output.collab.html>]
//   collabhtml extract <file.collab.html> [--format markdown|json] [--out <path>]
//   collabhtml reply <file.collab.html> --thread <id> --name <n> [--id <pid>] --text <t> [--out <path>]
//   collabhtml resolve <file.collab.html> --thread <id> --name <n> [--id <pid>] [--text <t>] [--out <path>]
//   collabhtml reopen <file.collab.html> --thread <id> --name <n> [--id <pid>] [--text <t>] [--out <path>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, createId, serialize } from '../src/comments.js';
import { embedState, extractState, toMarkdown } from '../src/brief.js';

const args = process.argv.slice(2);

// Works both bundled as CJS (dist/cli.cjs, where import.meta is gone)
// and run from source via tsx.
function scriptDir(): string {
  if (typeof __filename !== 'undefined') return path.dirname(__filename);
  return path.dirname(fileURLToPath(import.meta.url));
}

function showHelp(): void {
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

Agent loop (human reviews in, agent work out, resolution back in):
  collabhtml extract report.collab.html --format markdown
  collabhtml reply report.collab.html --thread t1 --name "Agent" --text "Fixed in revision 2."
  collabhtml resolve report.collab.html --thread t1 --name "Agent" --text "Verified and resolved."
`);
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(scriptDir(), '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function wrap(inputPath: string, outputPath: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const input = fs.readFileSync(inputPath, 'utf8');

  // The bundled runtime lives in dist/ after `npm run build`.
  const root = path.resolve(scriptDir(), '..');
  const dist = path.join(root, 'dist');
  const read = (file: string): string => fs.readFileSync(path.join(dist, file), 'utf8');

  const full = read('collabhtml-full.js');
  const bootstrap = read('bootstrap.js');

  const escapeScript = (source: string): string => source.replace(/<\/script/gi, '<\\/script');

  // Replace placeholders or inject before </body>
  const runtimeScript = `<script data-collabhtml-runtime data-root="main" data-document="${path.basename(inputPath, '.html')}" data-revision="1">${escapeScript(full)}</script>`;
  const bootstrapScript = `<script data-collabhtml-bootstrap>${escapeScript(bootstrap)}</script>`;

  let output: string;
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

function readState(inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }
  const html = fs.readFileSync(inputPath, 'utf8');
  const state = extractState(html);
  if (!state) {
    console.error('Error: no review state in file (open it in a browser and save a copy first).');
    process.exit(1);
  }
  return { html, state };
}

function writeState(inputPath: string, html: string, outIndex: number): void {
  const outputPath = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : inputPath;
  fs.writeFileSync(outputPath, html);
  console.log(`Updated: ${outputPath}`);
}

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

function actorInput() {
  const personName = flag('--name');
  if (!personName) {
    console.error('Error: --name is required.');
    process.exit(1);
  }
  return { personId: flag('--id') || `agent:${encodeURIComponent(personName.toLowerCase())}`, personName, timestamp: new Date().toISOString() };
}

function runExtract(inputPath: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }
  const html = fs.readFileSync(inputPath, 'utf8');
  const state = extractState(html);
  const format = flag('--format') || 'markdown';
  const out = flag('--out');
  const text = format === 'json'
    ? serialize(state || { schemaVersion: 3, document: { id: 'unknown', revision: '1' }, threads: [], comments: [] })
    : toMarkdown(state || { schemaVersion: 3, document: { id: 'unknown', revision: '1' }, threads: [], comments: [] });
  if (format !== 'markdown' && format !== 'json') {
    console.error('Error: --format must be markdown or json.');
    process.exit(1);
  }
  if (out) fs.writeFileSync(out, text); else console.log(text);
}

function runReply(inputPath: string): void {
  const text = flag('--text');
  if (!text) {
    console.error('Error: --text is required.');
    process.exit(1);
  }
  const threadId = flag('--thread');
  if (!threadId) {
    console.error('Error: --thread is required.');
    process.exit(1);
  }
  const { html, state } = readState(inputPath);
  const actor = actorInput();
  const next = apply(state, {
    type: 'comment.added',
    comment: { commentId: createId(), threadId, ...actor, text }
  });
  writeState(inputPath, embedState(html, next), args.indexOf('--out'));
}

function runResolve(inputPath: string): void {
  runSetStatus(inputPath, 'resolved');
}

function runReopen(inputPath: string): void {
  runSetStatus(inputPath, 'open');
}

function runSetStatus(inputPath: string, status: 'open' | 'resolved'): void {
  const threadId = flag('--thread');
  if (!threadId) {
    console.error('Error: --thread is required.');
    process.exit(1);
  }
  const { html, state } = readState(inputPath);
  const actor = actorInput();
  const text = flag('--text');
  const withComment = text
    ? apply(state, { type: 'comment.added', comment: { commentId: createId(), threadId, ...actor, text } })
    : state;
  const next = apply(withComment, { type: 'thread.status', threadId, status, ...actor });
  writeState(inputPath, embedState(html, next), args.indexOf('--out'));
}

function main(): void {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(getVersion());
    return;
  }

  // First non-flag argument is the input file, unless it names a subcommand.
  const [first, second] = args;
  if (first === 'extract' && second) return runExtract(second);
  if (first === 'reply' && second) return runReply(second);
  if (first === 'resolve' && second) return runResolve(second);
  if (first === 'reopen' && second) return runReopen(second);

  const inputPath = args.find(arg => !arg.startsWith('-'));
  if (!inputPath) {
    console.error('Error: No input file specified');
    showHelp();
    process.exit(1);
  }

  let outputPath: string | null = null;
  const outIndex = args.indexOf('--out');
  if (outIndex !== -1 && args[outIndex + 1]) {
    outputPath = args[outIndex + 1];
  } else {
    outputPath = inputPath.replace(/\.html$/i, '') + '.collab.html';
  }

  wrap(inputPath, outputPath);
}

main();
