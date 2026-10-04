// Responsibility: HTML anchors — selected text -> W3C selectors -> DOM range -> native highlight.
// No comment state, UI, storage, or export. create/locate also work in Node.
// An anchor is a list of selectors: one TextQuoteSelector and one TextPositionSelector.
// locate() never guesses: a changed or ambiguous quote returns null (shown as "Unplaced").
/**
 * @typedef {import('./comments').Anchor} Anchor
 * @typedef {import('./comments').Selector} Selector
 * @typedef {import('./comments').TextQuoteSelector} TextQuoteSelector
 * @typedef {import('./comments').TextPositionSelector} TextPositionSelector
 */
/**
 * @param {any} global
 */
(function (global) {
  'use strict';
  /**
   * @param {Anchor} anchor
   * @param {string} type
   * @returns {Selector|undefined}
   */
  const byType = (anchor, type) => anchor.find(selector => selector.type === type);
  /**
   * @param {Anchor} anchor
   * @returns {Selector|undefined}
   */
  const quoteOf = anchor => byType(anchor, 'TextQuoteSelector');

  /**
   * @param {string} content
   * @param {number} start
   * @param {number} end
   * @returns {Anchor}
   */
  function create(content, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > content.length) throw new Error('Invalid selection');
    const exact = content.slice(start, end);
    if (!exact.trim() || exact.length > 20000) throw new Error('Invalid selection');
    return [
      { type: 'TextQuoteSelector', exact, prefix: content.slice(Math.max(0, start - 48), start), suffix: content.slice(end, end + 48) },
      { type: 'TextPositionSelector', start, end }
    ];
  }
  /**
   * @param {string} content
   * @param {Anchor} anchor
   * @returns {{start: number, end: number}|null}
   */
  function locate(content, anchor) {
    const quote = /** @type {TextQuoteSelector} */ (quoteOf(anchor));
    const { exact, prefix = '', suffix = '' } = quote;
    const position = /** @type {TextPositionSelector|undefined} */ (byType(anchor, 'TextPositionSelector'));
    /**
     * @param {number} start
     * @returns {boolean}
     */
    const matches = start => content.startsWith(exact, start) &&
      (!prefix || content.slice(Math.max(0, start - prefix.length), start) === prefix) &&
      (!suffix || content.slice(start + exact.length, start + exact.length + suffix.length) === suffix);
    // The position is a hint. The quote and its context must still match there.
    if (position && position.end - position.start === exact.length && matches(position.start)) return { start: position.start, end: position.end };
    const candidates = /** @type {number[]} */ ([]);
    for (let start = content.indexOf(exact); start !== -1; start = content.indexOf(exact, start + 1)) {
      if (matches(start)) candidates.push(start);
    }
    return candidates.length === 1 ? { start: candidates[0], end: candidates[0] + exact.length } : null;
  }
  /**
   * @typedef {object} TextNodeRef
   * @property {Text} node
   * @property {number} start
   */
  /**
   * @typedef {object} TextIndex
   * @property {TextNodeRef[]} nodes
   * @property {string} content
   */
  /**
   * @param {Element} root
   * @returns {TextIndex}
   */
  function textIndex(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      /**
       * @param {Node} item
       * @returns {number}
       */
      acceptNode(item) {
        return /** @type {Element} */ (item.parentElement).closest('script,style,noscript,template,[data-collabhtml-ui]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = /** @type {TextNodeRef[]} */ ([]); let content = ''; let item;
    while ((item = walker.nextNode())) { const textNode = /** @type {Text} */ (item); nodes.push({ node: textNode, start: content.length }); content += textNode.data; }
    return { nodes, content };
  }
  /**
   * @param {TextIndex} index
   * @param {{start: number, end: number}|null} position
   * @returns {Range|null}
   */
  function toRange(index, position) {
    if (!position) return null;
    const start = index.nodes.find(item => position.start >= item.start && position.start < item.start + item.node.length);
    const end = index.nodes.find(item => position.end > item.start && position.end <= item.start + item.node.length);
    if (!start || !end) return null;
    const range = /** @type {Document} */ (start.node.ownerDocument).createRange();
    range.setStart(start.node, position.start - start.start); range.setEnd(end.node, position.end - end.start);
    return range;
  }
  // The current selection inside root as an anchor, or null.
  /**
   * @param {Element} root
   * @returns {Anchor|null}
   */
  function capture(root) {
    const doc = root.ownerDocument;
    const selection = /** @type {Window} */ (doc.defaultView).getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const index = textIndex(root);
    /**
     * @param {Node} container
     * @param {number} at
     * @returns {number}
     */
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
  /**
   * @typedef {object} HighlightHandle
   * @property {(ranges: Iterable<Range>) => void} update
   * @property {() => void} destroy
   */
  /**
   * @param {Document} doc
   * @param {string} name
   * @returns {HighlightHandle}
   */
  function highlight(doc, name) {
    const style = doc.createElement('style'); style.dataset.collabhtmlUi = '';
    style.textContent = `::highlight(${name}) { background:#ffe69a; color:inherit; }`; doc.head.append(style);
    const win = /** @type {Window} */ (doc.defaultView);
    const winAny = /** @type {any} */ (win);
    return {
      /**
       * @param {Iterable<Range>} ranges
       */
      update(ranges) { if (winAny.CSS?.highlights && winAny.Highlight) winAny.CSS.highlights.set(name, new winAny.Highlight(...ranges)); },
      destroy() { winAny.CSS?.highlights?.delete(name); style.remove(); }
    };
  }
  const api = { create, locate, textIndex, toRange, capture, highlight, quoteOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else /** @type {any} */ (global).CollabHTMLAnchors = api;
})(globalThis);
