// Responsibility: browser-global entry — exposes the default UI.
// Bundled as dist/collabhtml-pane.js. Library consumers import the modules instead.
import { mount } from '../../ui/pane.js';
import { icon, renderThread } from '../../ui/threads.js';

(globalThis as any).CollabHTMLPane = { mount };
(globalThis as any).CollabHTMLThreads = { renderThread, icon };
