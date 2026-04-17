'use strict';

/**
 * lib/runtime/transcript/native-sync.js
 *
 * Reads a native toolchain transcript file (transcript_path from hook payload),
 * extracts user/assistant messages, and writes them to the Memora transcript store.
 *
 * Design:
 *   - Source of truth is the native file; local JSONL is a denormalized cache.
 *   - Deduplication via content fingerprint — safe to call on every Stop hook.
 *   - Graceful degradation: any I/O error returns { synced: 0 } instead of throwing.
 *
 * Supported formats:
 *   - Claude Code: JSONL with { type: "user"|"assistant", message: { content }, uuid, timestamp }
 *   - Codex CLI:   JSONL with { role: "user"|"assistant", content, id?, timestamp? }
 *                  (fallback: plain-text payload when transcript_path absent)
 */

const fs   = require('fs');
const path = require('path');

const VALID_ROLES = new Set(['user', 'assistant']);

/**
 * Sync messages from a native transcript file into the Memora store.
 *
 * @param {string}   sessionId
 * @param {string}   transcriptPath   — absolute path to the native transcript JSONL
 * @param {object}   opts
 * @param {object}   opts.rt          — runtime module (injectable for testing)
 * @param {string}   [opts.source]    — 'claude' | 'codex'
 * @returns {{ synced: number, skipped: number, diagnostics: string }}
 */
function syncFromPath(sessionId, transcriptPath, opts = {}) {
  const rt = opts.rt || require('..');

  if (!sessionId || typeof sessionId !== 'string') {
    return { synced: 0, skipped: 0, diagnostics: 'syncFromPath: sessionId required' };
  }
  if (!transcriptPath || typeof transcriptPath !== 'string') {
    return { synced: 0, skipped: 0, diagnostics: 'syncFromPath: transcriptPath required' };
  }

  let lines;
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8');
    lines = raw.split('\n').filter(Boolean);
  } catch (err) {
    return { synced: 0, skipped: 0, diagnostics: `syncFromPath: cannot read ${transcriptPath}: ${err.message}` };
  }

  const extracted = _extractMessages(lines, opts.source || 'unknown');
  if (!extracted.length) {
    return { synced: 0, skipped: 0, diagnostics: 'syncFromPath: no messages extracted' };
  }

  // Load existing fingerprints for this session to deduplicate.
  const seen = _loadFingerprints(sessionId, rt);

  let synced  = 0;
  let skipped = 0;

  for (const msg of extracted) {
    const fp = _fingerprint(msg.role, msg.content);
    if (seen.has(fp)) {
      skipped++;
      continue;
    }
    seen.add(fp);

    const result = rt.appendTranscriptMessage(sessionId, {
      role:      msg.role,
      content:   msg.content,
      timestamp: msg.timestamp || new Date().toISOString(),
    });

    if (result.appended) {
      synced++;
    }
  }

  return {
    synced,
    skipped,
    diagnostics: `syncFromPath: synced=${synced} skipped=${skipped} from ${path.basename(transcriptPath)}`,
  };
}

/**
 * Append a single message directly (no file read needed).
 * Used when the payload carries the content explicitly (e.g. Codex last_assistant_message,
 * or UserPromptSubmit prompt).
 *
 * @param {string}   sessionId
 * @param {'user'|'assistant'} role
 * @param {string}   content
 * @param {object}   opts
 * @param {object}   opts.rt     — injectable runtime
 * @param {string}   [opts.source]
 * @returns {{ appended: boolean, skipped: boolean, diagnostics: string }}
 */
function appendMessage(sessionId, role, content, opts = {}) {
  const rt = opts.rt || require('..');

  if (!sessionId || !VALID_ROLES.has(role) || !content || !content.trim()) {
    return { appended: false, skipped: false, diagnostics: 'appendMessage: invalid args' };
  }

  const seen = _loadFingerprints(sessionId, rt);
  const fp   = _fingerprint(role, content);

  if (seen.has(fp)) {
    return { appended: false, skipped: true, diagnostics: 'appendMessage: duplicate, skipped' };
  }
  seen.add(fp);

  const result = rt.appendTranscriptMessage(sessionId, {
    role,
    content:   content.trim(),
    timestamp: new Date().toISOString(),
  });

  return {
    appended:    result.appended,
    skipped:     false,
    diagnostics: result.diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse JSONL lines and extract { role, content, timestamp } objects.
 * Handles both Claude JSONL format and Codex JSONL format.
 */
function _extractMessages(lines, source) {
  const messages = [];

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; }
    if (!obj || typeof obj !== 'object') continue;

    const msg = _tryParseClaudeEntry(obj) || _tryParseCodexEntry(obj);
    if (msg) messages.push(msg);
  }

  return messages;
}

/**
 * Claude JSONL entry: { type: "user"|"assistant", message: { content }, uuid, timestamp }
 * content can be a string or an array of { type: "text", text: "..." } blocks.
 */
function _tryParseClaudeEntry(obj) {
  if (!VALID_ROLES.has(obj.type)) return null;

  const msgContent = obj.message && obj.message.content;
  const text = _extractText(msgContent);
  if (!text) return null;

  return {
    role:      obj.type,
    content:   text,
    timestamp: obj.timestamp || null,
    uuid:      obj.uuid || null,
  };
}

/**
 * Codex JSONL entry: { role: "user"|"assistant", content: string, id?, timestamp? }
 */
function _tryParseCodexEntry(obj) {
  if (!VALID_ROLES.has(obj.role)) return null;

  const text = _extractText(obj.content);
  if (!text) return null;

  return {
    role:      obj.role,
    content:   text,
    timestamp: obj.timestamp || null,
    uuid:      obj.id || null,
  };
}

/**
 * Normalize content: string | array of blocks → plain string.
 * Filters out empty text, tool calls, and system-injected blocks.
 */
function _extractText(content) {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (Array.isArray(content)) {
    const parts = content
      .filter(c => c && typeof c === 'object' && c.type === 'text')
      .map(c => (c.text || '').trim())
      .filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

/**
 * Content fingerprint for deduplication.
 * Normalises whitespace and truncates to avoid false positives from minor edits.
 */
function _fingerprint(role, content) {
  const normalised = content.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${role}:${normalised}`;
}

/**
 * Load the set of already-synced fingerprints for a session.
 * Reads existing messages from the store and builds the set.
 * Returns an empty Set on any error (fail-open: may re-sync some entries, but won't crash).
 */
function _loadFingerprints(sessionId, rt) {
  const set = new Set();
  try {
    const store = rt._getTranscriptStoreForSync
      ? rt._getTranscriptStoreForSync()
      : null;
    if (!store) return set;
    const messages = store.getMessages(sessionId) || [];
    for (const m of messages) {
      if (m.role && m.content) {
        set.add(_fingerprint(m.role, m.content));
      }
    }
  } catch (_) {}
  return set;
}

module.exports = { syncFromPath, appendMessage };
