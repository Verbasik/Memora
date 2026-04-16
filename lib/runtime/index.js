'use strict';

/**
 * lib/runtime/index.js — Public API for the Memora runtime/recall layer
 *
 * Phase 1 MVP of the runtime layer described in HERMES_RUNTIME_LAYER_TZ.md.
 *
 * Exports three low-level modules and a high-level convenience API:
 *
 *   Low-level (use directly when you need fine-grained control):
 *     require('./security-scanner')  — scanMemoryContent, scanContextContent
 *     require('./snapshot')          — createSnapshot, buildAndActivateSnapshot, …
 *     require('./fenced-context')    — buildRecallBlock, sanitizeRecalledContent, …
 *
 *   High-level (covers the most common agent-facing operations):
 *     runtime.initSession(sources, options)
 *       Build and activate a frozen session snapshot from the given file paths.
 *       Returns { snapshot, diagnostics }.
 *
 *     runtime.checkMemoryWrite(content)
 *       Run security screening on content before it is persisted to a memory file.
 *       Returns { allowed: boolean, reason: string|null, patternId: string|null }.
 *
 *     runtime.loadContextFile(filePath)
 *       Read a prompt-adjacent context file (AGENTS.md, CLAUDE.md, etc.) and
 *       scan it before injection. Returns { allowed, content, diagnostics }.
 *
 *     runtime.buildRecallBlock(content, metadata)
 *       Sanitize + wrap recalled content in a canonical fenced block.
 *       Thin re-export of fenced-context.buildRecallBlock.
 *
 *     runtime.getSession()
 *       Return the active session snapshot (or null if not initialised).
 *
 *     runtime.resetSession()
 *       Clear the active snapshot — use between test runs or explicit refreshes.
 *
 *   Transcript API (Phase 2 — wired in Step 3):
 *     runtime.openTranscriptSession(sessionId, meta)
 *       Open a new transcript session in the store and return { opened, session, diagnostics }.
 *
 *     runtime.appendTranscriptMessage(sessionId, message)
 *       Append a message record to an open transcript session.
 *       Returns { appended, message, diagnostics }.
 *
 *     runtime.recallTranscripts(query, options)
 *       Search the transcript store and return a RecallResult (fenced block + metadata).
 *       Options: { maxSessions, source, maxSessionChars }.
 *
 *     runtime.resetTranscriptStore()
 *       Clear the module-level TranscriptStore singleton — use between test runs.
 */

const fs = require('fs');

const securityScanner  = require('./security-scanner');
const snapshotModule   = require('./snapshot');
const fencedContext    = require('./fenced-context');
const { TranscriptStore } = require('./transcript/store');
const transcriptRecall = require('./transcript/recall');

// ---------------------------------------------------------------------------
// Re-export low-level modules for consumers who need fine-grained access
// ---------------------------------------------------------------------------

module.exports.security        = securityScanner;
module.exports.snapshot        = snapshotModule;
module.exports.fenced          = fencedContext;
module.exports.transcriptStore  = require('./transcript/store');
module.exports.transcriptRecall = transcriptRecall;

// ---------------------------------------------------------------------------
// High-level convenience API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} InitSessionResult
 * @property {import('./snapshot').SessionSnapshot} snapshot  — the frozen snapshot
 * @property {string}   diagnostics  — human-readable summary (for logging)
 * @property {boolean}  hasErrors    — true if any source file failed to load
 */

/**
 * Build and activate a frozen session snapshot from the given source files.
 *
 * Designed to be called ONCE at the start of a session (e.g. during memory-restore).
 * Throws if a snapshot is already active — call resetSession() first for an explicit
 * refresh.
 *
 * @param {string[]} sources   — file paths to include in the snapshot (memory-bank files)
 * @param {object}  [options]  — passed through to snapshot.createSnapshot()
 * @returns {InitSessionResult}
 */
function initSession(sources, options = {}) {
  const snap = snapshotModule.buildAndActivateSnapshot(sources, options);
  return {
    snapshot:    snap,
    diagnostics: snapshotModule.describeSnapshot(snap),
    hasErrors:   snap.errorCount > 0,
  };
}

/**
 * @typedef {Object} MemoryWriteResult
 * @property {boolean}     allowed    — true if write is safe to proceed
 * @property {string|null} reason     — block reason (null if allowed)
 * @property {string|null} patternId  — matched pattern identifier (null if allowed)
 */

/**
 * Screen content before writing it to a memory file.
 *
 * Memory files are prompt-adjacent: they get injected into the system prompt
 * on future sessions. Blocking dangerous content here prevents prompt injection
 * and exfiltration payloads from persisting.
 *
 * @param {string} content
 * @returns {MemoryWriteResult}
 */
function checkMemoryWrite(content) {
  const result = securityScanner.scanMemoryContent(content);
  return {
    allowed:   !result.blocked,
    reason:    result.reason,
    patternId: result.patternId,
  };
}

/**
 * @typedef {Object} ContextFileResult
 * @property {boolean}     allowed      — true if file passed screening
 * @property {string}      content      — safe content (original if allowed; sanitized placeholder if blocked)
 * @property {string|null} diagnostics  — block reason (null if allowed)
 * @property {string|null} patternId    — matched pattern identifier (null if allowed)
 */

/**
 * Read a prompt-adjacent context file and screen it before injection.
 *
 * Returns the original content when safe, or a sanitized placeholder string
 * when a threat is detected (matches Hermes prompt_builder behaviour: the
 * caller can still inject the placeholder instead of silently skipping).
 *
 * @param {string} filePath   — path to AGENTS.md, CLAUDE.md, .hermes.md, etc.
 * @returns {ContextFileResult}
 */
function loadContextFile(filePath) {
  const basename = require('path').basename(filePath);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return {
      allowed:     false,
      content:     `[CONTEXT FILE UNREADABLE: ${basename} — ${err.message}]`,
      diagnostics: `Could not read context file '${basename}': ${err.message}`,
      patternId:   'file_read_error',
    };
  }

  const scan = securityScanner.scanContextContent(raw, basename);

  return {
    allowed:     !scan.blocked,
    content:     scan.sanitized,   // original if clean; [BLOCKED: ...] placeholder if not
    diagnostics: scan.reason,
    patternId:   scan.patternId,
  };
}

/**
 * Sanitize and wrap recalled content in a canonical fenced block.
 *
 * Thin re-export of fenced-context.buildRecallBlock.
 *
 * @param {string}  content   — raw recalled content (may contain nested blocks)
 * @param {object} [metadata] — { type, source, query, createdAt, note }
 * @returns {string}  fenced block, or empty string if content is empty after sanitization
 */
function buildRecallBlock(content, metadata = {}) {
  return fencedContext.buildRecallBlock(content, metadata);
}

/**
 * Return the active session snapshot, or null if the session has not been initialised.
 * @returns {import('./snapshot').SessionSnapshot|null}
 */
function getSession() {
  return snapshotModule.getActiveSnapshot();
}

/**
 * Clear the active session snapshot.
 * Use between test runs or when an explicit session refresh is needed.
 */
function resetSession() {
  snapshotModule.clearActiveSnapshot();
}

// ---------------------------------------------------------------------------
// Transcript store singleton  (Phase 2 — Step 3)
// ---------------------------------------------------------------------------

/** Module-level TranscriptStore singleton; lazy-initialized on first use. */
let _transcriptStore = null;

/**
 * Return the module-level TranscriptStore singleton, creating it on first call.
 * @returns {TranscriptStore}
 */
function _getTranscriptStore() {
  if (!_transcriptStore) {
    _transcriptStore = new TranscriptStore();
  }
  return _transcriptStore;
}

// ---------------------------------------------------------------------------
// Transcript session management  (Phase 2 — Step 3)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TranscriptSessionResult
 * @property {boolean}     opened      — true if session was opened successfully
 * @property {import('./transcript/store').SessionRecord|null} session
 * @property {string}      diagnostics — human-readable status message
 */

/**
 * Open a new transcript session in the store.
 *
 * Errors are isolated — failures return { opened: false } rather than throwing.
 *
 * @param {string} sessionId   — unique session identifier; use snapshot.generateSessionId()
 * @param {object} [meta]      — forwarded to TranscriptStore.openSession()
 * @returns {TranscriptSessionResult}
 */
function openTranscriptSession(sessionId, meta) {
  try {
    const session = _getTranscriptStore().openSession(sessionId, meta || {});
    return {
      opened:      true,
      session,
      diagnostics: `Transcript session '${sessionId}' opened.`,
    };
  } catch (err) {
    return {
      opened:      false,
      session:     null,
      diagnostics: `openTranscriptSession failed: ${err.message}`,
    };
  }
}

/**
 * @typedef {Object} TranscriptMessageResult
 * @property {boolean}     appended    — true if message was appended successfully
 * @property {import('./transcript/store').MessageRecord|null} message
 * @property {string}      diagnostics
 */

/**
 * Append a message to an open transcript session.
 *
 * Errors are isolated — failures return { appended: false } rather than throwing.
 *
 * @param {string} sessionId
 * @param {object} message   — forwarded to TranscriptStore.appendMessage()
 * @returns {TranscriptMessageResult}
 */
function appendTranscriptMessage(sessionId, message) {
  try {
    const record = _getTranscriptStore().appendMessage(sessionId, message);
    return {
      appended:    true,
      message:     record,
      diagnostics: `Message appended to transcript session '${sessionId}'.`,
    };
  } catch (err) {
    return {
      appended:    false,
      message:     null,
      diagnostics: `appendTranscriptMessage failed: ${err.message}`,
    };
  }
}

/**
 * Search the transcript store and return a fenced recall block.
 *
 * Delegates to recallTranscripts() from lib/runtime/transcript/recall.js.
 * The module-level TranscriptStore singleton is used as the store.
 *
 * @param {string} query
 * @param {object} [options]  — maxSessions, source, maxSessionChars
 * @returns {import('./transcript/recall').RecallResult}
 */
function recallTranscripts(query, options) {
  return transcriptRecall.recallTranscripts(_getTranscriptStore(), query, options);
}

/**
 * Clear the module-level TranscriptStore singleton.
 * Use between test runs to ensure isolation.
 * A fresh store will be lazily created on the next transcript operation.
 */
function resetTranscriptStore() {
  _transcriptStore = null;
}

// ---------------------------------------------------------------------------
// Attach high-level functions to module.exports
// ---------------------------------------------------------------------------

module.exports.initSession      = initSession;
module.exports.checkMemoryWrite = checkMemoryWrite;
module.exports.loadContextFile  = loadContextFile;
module.exports.buildRecallBlock = buildRecallBlock;
module.exports.getSession       = getSession;
module.exports.resetSession     = resetSession;

module.exports.openTranscriptSession   = openTranscriptSession;
module.exports.appendTranscriptMessage = appendTranscriptMessage;
module.exports.recallTranscripts       = recallTranscripts;
module.exports.resetTranscriptStore    = resetTranscriptStore;
