// Responsibility: CLI — turn any HTML file into a self-contained commentable copy.
// Usage: collabhtml <input.html> [--out <output.collab.html>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function main(): void {
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
