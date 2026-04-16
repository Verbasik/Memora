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
 */

const fs = require('fs');

const securityScanner = require('./security-scanner');
const snapshotModule  = require('./snapshot');
const fencedContext   = require('./fenced-context');

// ---------------------------------------------------------------------------
// Re-export low-level modules for consumers who need fine-grained access
// ---------------------------------------------------------------------------

module.exports.security = securityScanner;
module.exports.snapshot = snapshotModule;
module.exports.fenced   = fencedContext;

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

// Attach high-level functions to module.exports
module.exports.initSession      = initSession;
module.exports.checkMemoryWrite = checkMemoryWrite;
module.exports.loadContextFile  = loadContextFile;
module.exports.buildRecallBlock = buildRecallBlock;
module.exports.getSession       = getSession;
module.exports.resetSession     = resetSession;
