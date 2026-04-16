'use strict';

/**
 * fenced-context.js — Fenced recall context block builder for Memora runtime layer
 *
 * Implements FR-012 and FR-013 from HERMES_RUNTIME_LAYER_TZ.md:
 *   - FR-012: Recalled context MUST be injected in a fenced block with an explicit
 *             label — it must never be mistaken for new user input.
 *   - FR-013: Context sanitization — before wrapping, remove any nested fenced
 *             blocks so recalled content cannot recursively pollute the context.
 *
 * Design:
 *   - A single canonical fence format using XML-style tags:
 *       <memory_context type="..." ...>
 *       ...content...
 *       </memory_context>
 *     Tags are detectable by regex, carry metadata attributes, and are
 *     unambiguously machine-generated (not something a user would type).
 *
 *   - sanitizeRecalledContent(content)
 *       Strips nested <memory_context>…</memory_context> blocks and other
 *       internal annotation markers from content before wrapping.
 *
 *   - buildFencedBlock(content, attrs)
 *       Wraps sanitized content in a canonical fenced block.
 *
 *   - buildRecallBlock(content, metadata)
 *       End-to-end: sanitize → fence. Primary public entry point.
 *
 *   - extractFencedBlocks(text)
 *       Parse all <memory_context> blocks from a text (for tests and tooling).
 *
 *   - stripFencedBlocks(text)
 *       Remove all <memory_context> blocks from a text (for sanitization).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FENCE_TAG      = 'memory_context';
const FENCE_OPEN_RE  = /<memory_context(\s[^>]*)?\s*>/gi;
const FENCE_CLOSE    = '</memory_context>';
const FENCE_CLOSE_RE = /<\/memory_context>/gi;

// Annotation markers written by earlier runtime operations (e.g. source comments
// from renderSnapshotContent). Remove these before re-wrapping to avoid nesting.
const SOURCE_COMMENT_RE = /<!--\s*source:[^>]*-->/gi;
const BLOCKED_STUB_RE   = /\[BLOCKED:[^\]]*\]/g;

// ---------------------------------------------------------------------------
// Attribute serialisation helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for use as an XML attribute value (double-quoted).
 * @param {string} value
 * @returns {string}
 */
function _escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Serialise an attributes object to an XML attribute string.
 * Only non-empty string/number values are included.
 *
 * @param {Object} attrs
 * @returns {string}  — leading space included if non-empty, e.g. ' type="recall" query="foo"'
 */
function _serializeAttrs(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  const parts = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (val === null || val === undefined || val === '') continue;
    parts.push(`${key}="${_escapeAttr(val)}"`);
  }
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Remove all nested <memory_context> fenced blocks from content.
 * Handles both well-formed (open+close) and orphan open/close tags.
 *
 * Also removes:
 *   - <!-- source: ... --> comments injected by renderSnapshotContent
 *   - [BLOCKED: ...] stubs injected by scanContextContent
 *
 * @param {string} content
 * @returns {string}  sanitized content
 */
function sanitizeRecalledContent(content) {
  if (typeof content !== 'string') return '';

  let result = content;

  // Remove well-formed <memory_context ...>...</memory_context> blocks.
  // Use a loop to handle non-greedy multi-line matching across nested structures.
  // We can't use /s flag in Node 10, so we match [\s\S]*? instead.
  let prev;
  do {
    prev = result;
    result = result.replace(/<memory_context(?:\s[^>]*)?\s*>[\s\S]*?<\/memory_context>/gi, '');
  } while (result !== prev);

  // Remove any orphan open/close tags that remain
  result = result.replace(FENCE_OPEN_RE, '');
  result = result.replace(FENCE_CLOSE_RE, '');

  // Remove source comments from renderSnapshotContent
  result = result.replace(SOURCE_COMMENT_RE, '');

  // Remove blocked content stubs
  result = result.replace(BLOCKED_STUB_RE, '');

  // Collapse 3+ consecutive blank lines introduced by removal into at most 2
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

// ---------------------------------------------------------------------------
// Block construction
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FenceAttrs
 * @property {string} [type]       — context type, e.g. "recall", "snapshot", "canonical"
 * @property {string} [source]     — provenance hint, e.g. session ID or filename
 * @property {string} [query]      — search query that produced this recall (for recall type)
 * @property {string} [createdAt]  — ISO 8601 timestamp
 * @property {string} [note]       — free-form human-readable note
 */

/**
 * Wrap content in a canonical <memory_context> fenced block.
 *
 * The caller is responsible for sanitizing content first if it may contain
 * nested blocks. Use buildRecallBlock() for the safe all-in-one path.
 *
 * @param {string}    content — the content to wrap (should already be sanitized)
 * @param {FenceAttrs} [attrs] — metadata attributes for the opening tag
 * @returns {string}
 */
function buildFencedBlock(content, attrs = {}) {
  if (typeof content !== 'string') {
    throw new TypeError('buildFencedBlock: content must be a string');
  }

  const attrStr = _serializeAttrs(attrs);
  const body    = content.trim();

  return `<${FENCE_TAG}${attrStr}>\n${body}\n</${FENCE_TAG}>`;
}

/**
 * @typedef {Object} RecallMetadata
 * @property {string} [source]     — session ID or other provenance
 * @property {string} [query]      — search query
 * @property {string} [createdAt]  — ISO 8601 timestamp of when the recall was built
 * @property {string} [note]       — optional human note (e.g. "degraded — no summarization")
 */

/**
 * Primary public entry point.
 *
 * Full pipeline: sanitize content → wrap in canonical fenced block.
 *
 * @param {string}         content   — raw recalled content (may contain nested blocks)
 * @param {RecallMetadata} [metadata] — metadata attached to the fence opening tag
 * @returns {string}  — safe, fenced recall block
 */
function buildRecallBlock(content, metadata = {}) {
  const sanitized = sanitizeRecalledContent(content);

  if (!sanitized) {
    return '';  // Nothing to inject — empty recall
  }

  const attrs = Object.assign({ type: 'recall' }, metadata);
  return buildFencedBlock(sanitized, attrs);
}

// ---------------------------------------------------------------------------
// Parsing helpers (for tests and downstream tooling)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FencedBlock
 * @property {string} raw      — full matched string including tags
 * @property {Object} attrs    — parsed attribute key/value pairs (strings only)
 * @property {string} body     — inner content between open and close tag (trimmed)
 */

/**
 * Parse attribute string like ` type="recall" query="foo bar"` into a plain object.
 * @param {string} attrStr
 * @returns {Object}
 */
function _parseAttrs(attrStr) {
  if (!attrStr) return {};
  const result = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    result[m[1]] = m[2]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  return result;
}

/**
 * Extract all <memory_context> fenced blocks from text.
 *
 * @param {string} text
 * @returns {FencedBlock[]}
 */
function extractFencedBlocks(text) {
  if (typeof text !== 'string') return [];

  const blocks = [];
  const re = /<memory_context(\s[^>]*)?\s*>([\s\S]*?)<\/memory_context>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({
      raw:   m[0],
      attrs: _parseAttrs(m[1] || ''),
      body:  (m[2] || '').trim(),
    });
  }
  return blocks;
}

/**
 * Remove all <memory_context> fenced blocks from text.
 * Alias for the complete sanitization that strips blocks only (no other markers).
 *
 * @param {string} text
 * @returns {string}
 */
function stripFencedBlocks(text) {
  if (typeof text !== 'string') return '';
  let result = text;
  let prev;
  do {
    prev = result;
    result = result.replace(/<memory_context(?:\s[^>]*)?\s*>[\s\S]*?<\/memory_context>/gi, '');
  } while (result !== prev);
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  sanitizeRecalledContent,
  buildFencedBlock,
  buildRecallBlock,
  extractFencedBlocks,
  stripFencedBlocks,
};
