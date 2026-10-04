// Responsibility: HTML anchors — selected text -> W3C selectors -> DOM range -> native highlight.
// No comment state, UI, storage, or export. create/locate also work in Node.
// An anchor is a list of selectors: one TextQuoteSelector and one TextPositionSelector.
// locate() never guesses: a changed or ambiguous quote returns null (shown as "Unplaced").
(function (global) {
  'use strict';
  const byType = (anchor, type) => anchor.find(selector => selector.type === type);
  const quoteOf = anchor => byType(anchor, 'TextQuoteSelector');

  function create(content, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > content.length) throw new Error('Invalid selection');
    const exact = content.slice(start, end);
    if (!exact.trim() || exact.length > 20000) throw new Error('Invalid selection');
    return [
      { type: 'TextQuoteSelector', exact, prefix: content.slice(Math.max(0, start - 48), start), suffix: content.slice(end, end + 48) },
      { type: 'TextPositionSelector', start, end }
    ];
  }
  function locate(content, anchor) {
    const { exact, prefix = '', suffix = '' } = quoteOf(anchor);
    const position = byType(anchor, 'TextPositionSelector');
    const matches = start => content.startsWith(exact, start) &&
      (!prefix || content.slice(Math.max(0, start - prefix.length), start) === prefix) &&
      (!suffix || content.slice(start + exact.length, start + exact.length + suffix.length) === suffix);
    // The position is a hint. The quote and its context must still match there.
    if (position && position.end - position.start === exact.length && matches(position.start)) return { start: position.start, end: position.end };
    const candidates = [];
    for (let start = content.indexOf(exact); start !== -1; start = content.indexOf(exact, start + 1)) {
      if (matches(start)) candidates.push(start);
    }
    return candidates.length === 1 ? { start: candidates[0], end: candidates[0] + exact.length } : null;
  }
  function textIndex(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(item) {
        return item.parentElement.closest('script,style,noscript,template,[data-collabhtml-ui]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let content = ''; let item;
    while ((item = walker.nextNode())) { nodes.push({ node: item, start: content.length }); content += item.data; }
    return { nodes, content };
  }
  function toRange(index, position) {
    if (!position) return null;
    const start = index.nodes.find(item => position.start >= item.start && position.start < item.start + item.node.length);
    const end = index.nodes.find(item => position.end > item.start && position.end <= item.start + item.node.length);
    if (!start || !end) return null;
    const range = start.node.ownerDocument.createRange();
    range.setStart(start.node, position.start - start.start); range.setEnd(end.node, position.end - end.start);
    return range;
  }
  // The current selection inside root as an anchor, or null.
  function capture(root) {
    const doc = root.ownerDocument;
    const selection = doc.defaultView.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const index = textIndex(root);
    const offset = (container, at) => {
      const before = doc.createRange(); before.selectNodeContents(root); before.setEnd(container, at);
      let length = 0;
      for (const item of index.nodes) {
        const end = doc.createRange(); end.selectNodeContents(item.node);
        if (before.compareBoundaryPoints(Range.END_TO_END, end) >= 0) length += item.node.length;
        else if (item.node === container) { length += at; break; }
        else break;
      }
      return length;
    };
    return create(index.content, offset(range.startContainer, range.startOffset), offset(range.endContainer, range.endOffset));
  }
  function highlight(doc, name) {
    const style = doc.createElement('style'); style.dataset.collabhtmlUi = '';
    style.textContent = `::highlight(${name}) { background:#ffe69a; color:inherit; }`; doc.head.append(style);
    const win = doc.defaultView;
    return {
      update(ranges) { if (win.CSS?.highlights && win.Highlight) win.CSS.highlights.set(name, new win.Highlight(...ranges)); },
      destroy() { win.CSS?.highlights?.delete(name); style.remove(); }
    };
  }
  const api = { create, locate, textIndex, toRange, capture, highlight, quoteOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CollabHTMLAnchors = api;
})(globalThis);
