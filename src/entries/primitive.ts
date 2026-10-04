// Responsibility: browser-global entry — exposes the primitive as window.CollabHTML.
// Bundled as dist/collabhtml.js. Library consumers import the modules instead.
import { create } from '../controller.js';
import * as comments from '../comments.js';
import * as anchors from '../anchors.js';

(globalThis as any).CollabHTML = { create, comments, anchors };
(globalThis as any).CollabHTMLComments = comments;
(globalThis as any).CollabHTMLAnchors = anchors;
