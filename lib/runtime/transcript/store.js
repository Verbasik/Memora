'use strict';

/**
 * lib/runtime/transcript/store.js — JSONL-backed transcript store for Memora
 *
 * Implements Phase 2 of the runtime layer (HERMES_RUNTIME_LAYER_TZ.md):
 *
 *   FR-006  Atomic writes via tempfile + os.rename (no partial-read race)
 *   FR-007  Dedicated transcript store — lives in dataDir, NOT inside memory-bank/
 *   FR-009  Rich schema: sessionId, projectDir, source, role, content,
 *           toolName, toolCalls, timestamp, tokenCount
 *
 * Storage layout (inside dataDir):
 *   transcript-sessions.jsonl  — one JSON object per line; one record per session
 *   transcript-messages.jsonl  — one JSON object per line; one record per message
 *
 * Both files are append-only for writes. `closeSession()` and
 * `appendMessage()` perform an atomic rewrite of sessions.jsonl to keep
 * messageCount and endedAt up-to-date without leaving stale lines.
 *
 * Design goals:
 *   - Zero external dependencies (Node.js >= 16 built-ins only)
 *   - Interface-stable: a future SQLite backend can be swapped in without
 *     changing callers (same method signatures, same return shapes)
 *   - Transparent failure isolation: constructor and all methods throw only
 *     on programming errors (bad types); I/O errors propagate with cause
 *
 * Inspired by hermes_state.py (SQLite + WAL + schema versioning) but adapted
 * to Memora's zero-dep constraint and single-writer, single-process model.
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Atomic write helper  (FR-006)
// ---------------------------------------------------------------------------

/**
 * Write `content` to `filePath` atomically via temp-file + os.rename.
 *
 * Guarantees that concurrent readers always see either the old complete file
 * or the new complete file — never a partially-written version.
 * The temp file is placed in the same directory as the target so that rename(2)
 * is a same-filesystem operation (avoids EXDEV on cross-mount moves).
 *
 * @param {string} filePath  — absolute or resolvable target path
 * @param {string} content   — UTF-8 string to write
 */
function writeFileAtomic(filePath, content) {
  const dir     = path.dirname(filePath);
  const tmpPath = path.join(dir, '.' + path.basename(filePath) + '.tmp.' + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

/**
 * Read all JSON lines from a JSONL file.
 * Returns an empty array if the file does not exist.
 * Throws on I/O errors other than ENOENT, and on malformed JSON.
 *
 * @param {string} filePath
 * @returns {object[]}
 */
function readJsonl(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
}

/**
 * Append one JSON record as a single line to a JSONL file.
 * Creates parent directories if needed.
 * POSIX append(2) is atomic for writes smaller than PIPE_BUF (~4 KB),
 * which covers all transcript records written by this module.
 *
 * @param {string} filePath
 * @param {object} record
 */
function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// TranscriptStore
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SessionRecord
 * @property {string}      sessionId    — unique identifier (e.g. '20260416T143022-a3f1c9')
 * @property {string}      projectDir   — absolute path of the project root at open time
 * @property {string}      source       — toolchain origin: 'claude'|'codex'|'qwen'|'opencode'|'cli'|'test'|'unknown'
 * @property {string}      startedAt    — ISO 8601 timestamp
 * @property {string|null} endedAt      — ISO 8601 timestamp, null while session is open
 * @property {number}      messageCount — total messages appended so far
 * @property {string|null} title        — optional human-readable title
 */

/**
 * @typedef {Object} MessageRecord
 * @property {number}      id           — auto-incrementing integer (file-scoped)
 * @property {string}      sessionId    — parent session identifier
 * @property {string}      role         — 'user' | 'assistant' | 'tool' | 'system'
 * @property {string|null} content      — message text (null for tool-only turns)
 * @property {string|null} toolName     — tool identifier for role:'tool' turns
 * @property {string|null} toolCalls    — JSON-serialized array of tool call objects
 * @property {string}      timestamp    — ISO 8601 timestamp
 * @property {number|null} tokenCount   — estimated token count, null if unknown
 */

const VALID_SOURCES = new Set(['claude', 'codex', 'qwen', 'opencode', 'cli', 'test', 'unknown']);
const VALID_ROLES   = new Set(['user', 'assistant', 'tool', 'system']);

/**
 * JSONL-backed session transcript storage.
 *
 * One TranscriptStore instance per working directory.
 * Multiple instances for the same dataDir in the same process are safe
 * (last atomic rewrite wins) but may race on messageCount increments.
 * Use a single shared instance per process for production code.
 */
class TranscriptStore {
  /**
   * @param {object} [options]
   * @param {string} [options.dataDir]  — directory where JSONL files are written.
   *   Defaults to `<cwd>/memory-bank/.local`. The directory is created on first write.
   */
  constructor(options = {}) {
    this.dataDir      = options.dataDir
      ? path.resolve(options.dataDir)
      : path.resolve(process.cwd(), 'memory-bank', '.local');
    this.sessionsFile = path.join(this.dataDir, 'transcript-sessions.jsonl');
    this.messagesFile = path.join(this.dataDir, 'transcript-messages.jsonl');
    this._nextId      = null;  // lazy-initialised message ID counter
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /**
   * Open a new session record and append it to sessions.jsonl.
   *
   * Does NOT check for duplicate sessionId — callers should use unique IDs
   * (e.g. from snapshot.generateSessionId()).
   *
   * @param {string} sessionId
   * @param {object} [meta]
   * @param {string} [meta.source]      — toolchain origin; falls back to 'unknown'
   * @param {string} [meta.projectDir]  — project root; falls back to process.cwd()
   * @param {string} [meta.title]       — optional human-readable title
   * @returns {SessionRecord}
   */
  openSession(sessionId, meta = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string');
    }
    const source = VALID_SOURCES.has(meta.source) ? meta.source : 'unknown';
    const record = {
      sessionId,
      projectDir:   meta.projectDir ? path.resolve(meta.projectDir) : process.cwd(),
      source,
      startedAt:    new Date().toISOString(),
      endedAt:      null,
      messageCount: 0,
      title:        meta.title || null,
    };
    appendJsonl(this.sessionsFile, record);
    return record;
  }

  /**
   * Close a session: set `endedAt` and optionally update `title`.
   * Atomically rewrites sessions.jsonl to persist the change.
   *
   * @param {string} sessionId
   * @param {object} [meta]
   * @param {string} [meta.title]  — update title on close
   * @returns {SessionRecord|null}  — updated record, or null if session not found
   */
  closeSession(sessionId, meta = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string');
    }
    const sessions = readJsonl(this.sessionsFile);
    let updated    = null;

    const patched = sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      updated = {
        ...s,
        endedAt: new Date().toISOString(),
        ...(meta.title ? { title: meta.title } : {}),
      };
      return updated;
    });

    if (!updated) return null;

    writeFileAtomic(this.sessionsFile, patched.map(s => JSON.stringify(s)).join('\n') + '\n');
    return updated;
  }

  /**
   * Retrieve a session record by ID.
   *
   * @param {string} sessionId
   * @returns {SessionRecord|null}
   */
  getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string');
    }
    return readJsonl(this.sessionsFile).find(s => s.sessionId === sessionId) || null;
  }

  /**
   * List sessions ordered by startedAt descending (most recent first).
   *
   * @param {object} [options]
   * @param {number} [options.limit=20]   — max records to return
   * @param {string} [options.source]     — filter to a specific toolchain source
   * @returns {SessionRecord[]}
   */
  listSessions(options = {}) {
    const limit  = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 20;
    const source = options.source || null;

    // Read with original file index so that insertion order breaks timestamp ties
    let sessions = readJsonl(this.sessionsFile).map((s, i) => ({ _idx: i, ...s }));
    if (source) sessions = sessions.filter(s => s.source === source);

    // Primary: startedAt descending; secondary: file insertion index descending
    sessions.sort((a, b) => {
      const ta = a.startedAt || '';
      const tb = b.startedAt || '';
      const cmp = tb.localeCompare(ta);
      if (cmp !== 0) return cmp;
      return (b._idx || 0) - (a._idx || 0);
    });

    return sessions.slice(0, limit).map(({ _idx, ...s }) => s);
  }

  // -------------------------------------------------------------------------
  // Message management
  // -------------------------------------------------------------------------

  /**
   * Append a message to the transcript and increment the session messageCount.
   *
   * The message ID is assigned sequentially based on the current file length.
   * The session record is atomically updated after each append.
   *
   * @param {string} sessionId
   * @param {object} message
   * @param {string}      message.role        — required; must be one of VALID_ROLES
   * @param {string|null} [message.content]   — message text
   * @param {string|null} [message.toolName]  — tool identifier for 'tool' turns
   * @param {Array|string|null} [message.toolCalls]  — tool call objects or pre-serialized JSON
   * @param {number|null} [message.tokenCount]
   * @returns {MessageRecord}
   */
  appendMessage(sessionId, message) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string');
    }
    if (!VALID_ROLES.has(message.role)) {
      throw new TypeError(`message.role must be one of: ${[...VALID_ROLES].join(', ')}`);
    }

    // Lazy-init message ID counter from existing file
    if (this._nextId === null) {
      const existing = readJsonl(this.messagesFile);
      this._nextId   = existing.length > 0
        ? Math.max(...existing.map(m => (typeof m.id === 'number' ? m.id : 0))) + 1
        : 1;
    }

    // Normalise toolCalls to JSON string or null
    let toolCalls = null;
    if (message.toolCalls !== undefined && message.toolCalls !== null) {
      toolCalls = typeof message.toolCalls === 'string'
        ? message.toolCalls
        : JSON.stringify(message.toolCalls);
    }

    const record = {
      id:         this._nextId++,
      sessionId,
      role:       message.role,
      content:    message.content   !== undefined ? (message.content   || null) : null,
      toolName:   message.toolName  !== undefined ? (message.toolName  || null) : null,
      toolCalls,
      timestamp:  new Date().toISOString(),
      tokenCount: message.tokenCount !== undefined ? (message.tokenCount || null) : null,
    };

    appendJsonl(this.messagesFile, record);

    // Atomically increment messageCount on the session record
    const sessions = readJsonl(this.sessionsFile);
    const patched  = sessions.map(s =>
      s.sessionId === sessionId
        ? { ...s, messageCount: (s.messageCount || 0) + 1 }
        : s
    );
    if (patched.some(s => s.sessionId === sessionId)) {
      writeFileAtomic(this.sessionsFile, patched.map(s => JSON.stringify(s)).join('\n') + '\n');
    }

    return record;
  }

  /**
   * Return all messages for a session, ordered by id ascending.
   *
   * @param {string} sessionId
   * @returns {MessageRecord[]}
   */
  getMessages(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId must be a non-empty string');
    }
    return readJsonl(this.messagesFile)
      .filter(m => m.sessionId === sessionId)
      .sort((a, b) => (a.id || 0) - (b.id || 0));
  }

  // -------------------------------------------------------------------------
  // Search (FR-010 baseline — substring matching)
  // -------------------------------------------------------------------------

  /**
   * Case-insensitive substring search across message content.
   *
   * Groups matching messages by session and returns results ordered by session
   * recency (most recently started session first). This is the Phase 2 baseline
   * implementation. A future SQLite/FTS5 backend can replace the internals
   * without changing this method's signature or return shape.
   *
   * @param {string} query                    — search string
   * @param {object} [options]
   * @param {number} [options.maxSessions=5]  — max unique sessions in result
   * @param {string} [options.source]         — filter to a specific toolchain source
   * @returns {{ session: SessionRecord, messages: MessageRecord[] }[]}
   */
  search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];

    const maxSessions = typeof options.maxSessions === 'number' ? options.maxSessions : 5;
    const source      = options.source || null;
    const queryLower  = query.toLowerCase();

    const allMessages = readJsonl(this.messagesFile);
    const allSessions = readJsonl(this.sessionsFile);

    const sessionMap = new Map(allSessions.map(s => [s.sessionId, s]));

    // Filter sessions by source if requested
    const allowedSessions = source
      ? new Set(allSessions.filter(s => s.source === source).map(s => s.sessionId))
      : null;

    // Find matching messages
    const matching = allMessages.filter(m => {
      if (!m.content) return false;
      if (allowedSessions && !allowedSessions.has(m.sessionId)) return false;
      return m.content.toLowerCase().includes(queryLower);
    });

    // Group by session
    const grouped = new Map();
    for (const msg of matching) {
      if (!grouped.has(msg.sessionId)) grouped.set(msg.sessionId, []);
      grouped.get(msg.sessionId).push(msg);
    }

    // Sort session IDs by recency (most recent startedAt first)
    const sortedIds = [...grouped.keys()]
      .map(sid => sessionMap.get(sid))
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
      .map(s => s.sessionId)
      .slice(0, maxSessions);

    return sortedIds.map(sid => ({
      session:  sessionMap.get(sid) || { sessionId: sid },
      messages: (grouped.get(sid) || []).sort((a, b) => (a.id || 0) - (b.id || 0)),
    }));
  }
}

module.exports = { TranscriptStore, writeFileAtomic, readJsonl, appendJsonl };
