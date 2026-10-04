// Responsibility: agent-facing review I/O — render state as a brief, and read/write
// embedded review state in HTML files. Pure string and state operations only.
// No DOM, UI, storage, or networking.
import { serialize, validate } from './comments.js';
import type { Anchor, CommentsState, TextQuoteSelector } from './comments.js';

function quoteOf(anchor: Anchor): TextQuoteSelector | undefined {
  return anchor.find(selector => selector.type === 'TextQuoteSelector') as TextQuoteSelector | undefined;
}

// A stable, paste-into-chat rendering: thread IDs and anchors let the agent
// locate each thread, reply to it, or resolve it with the CLI.
export function toMarkdown(input: CommentsState): string {
  const state = validate(input);
  const open = state.threads.filter(thread => thread.status === 'open').length;
  const lines = [
    '# CollabHTML review brief',
    `Document: ${state.document.id} (revision ${state.document.revision})`,
    `Threads: ${open} open, ${state.threads.length - open} resolved, ${state.comments.length} comments total`,
    ''
  ];
  for (const thread of state.threads) {
    const comments = state.comments.filter(comment => comment.threadId === thread.threadId);
    lines.push(`## Thread ${thread.threadId} — ${thread.status}`);
    const quote = thread.anchor.length ? quoteOf(thread.anchor) : undefined;
    if (quote) {
      lines.push(`Quoted text: "${quote.exact}"`);
      if (quote.prefix || quote.suffix) lines.push(`Context: "…${quote.prefix || ''}[${quote.exact}]${quote.suffix || ''}…"`);
    } else {
      lines.push('(no text anchor)');
    }
    const position = thread.anchor.find(selector => selector.type === 'TextPositionSelector') as
      { start: number; end: number } | undefined;
    if (position) lines.push(`Anchor offsets: ${position.start}–${position.end}`);
    for (const record of thread.anchorHistory || []) {
      const prior = quoteOf(record.anchor);
      lines.push(prior
        ? `Previously anchored on "${prior.exact}" (moved by ${record.personName}, ${record.timestamp}).`
        : `Previously anchored elsewhere (moved by ${record.personName}, ${record.timestamp}).`);
    }
    if (thread.status === 'resolved' && thread.statusChange) {
      lines.push(`Resolved by ${thread.statusChange.personName} (${thread.statusChange.timestamp}).`);
    }
    for (const comment of comments) {
      if (comment.deleted) {
        lines.push(`- ${comment.personName} (${comment.timestamp}): [deleted]`);
        continue;
      }
      const flags = [
        comment.edited ? '(edited)' : '',
        comment.reactions ? Object.entries(comment.reactions).map(([key, people]) => `${key}×${people.length}`).join(' ') : ''
      ].filter(Boolean).join(' ');
      lines.push(`- ${comment.personName} (${comment.timestamp}):${flags ? ' ' + flags : ''} ${comment.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// The embedded <script data-collabhtml-comments> payload, or null when the
// file carries no review state yet (e.g. freshly wrapped, never saved).
export function extractState(html: string): CommentsState | null {
  const match = /<script\b[^>]*\bdata-collabhtml-comments\b[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  return validate(JSON.parse(match[1]) as CommentsState);
}

// Replace the embedded payload with new state. The snapshot escapes `<`,
// so the content can never contain a literal closing script tag.
export function embedState(html: string, state: CommentsState): string {
  const pattern = /(<script\b[^>]*\bdata-collabhtml-comments\b[^>]*>)([\s\S]*?)(<\/script>)/;
  if (!pattern.test(html)) throw new Error('No embedded review state: open the file in a browser and save a copy first.');
  return html.replace(pattern, (_all, open, _old, close) => `${open}${serialize(state)}${close}`);
}
