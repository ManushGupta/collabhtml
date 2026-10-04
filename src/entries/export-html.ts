// Responsibility: browser-global entry — attaches HTML export to window.CollabHTML.
// Bundled as dist/collabhtml-export.js; load after dist/collabhtml.js.
import { exportHTML } from '../export-html.js';

(globalThis as any).CollabHTML.exportHTML = exportHTML;
