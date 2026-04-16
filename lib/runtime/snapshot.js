'use strict';

/**
 * snapshot.js — Session snapshot semantics for Memora runtime layer
 *
 * Implements the "frozen snapshot" pattern from Hermes (MemoryStore._system_prompt_snapshot):
 *   - Snapshot is built ONCE at session start from the relevant memory-bank files.
 *   - Mid-session writes to memory files do NOT mutate the active snapshot.
 *   - Changes become available only on the NEXT session bootstrap or via explicit refresh.
 *
 * This keeps the memory context stable and predictable within a session
 * (FR-003, NFR-002, BR-003 from HERMES_RUNTIME_LAYER_TZ.md).
 *
 * Design:
 *   - createSnapshot(sources)  — reads files, builds and freezes a snapshot object
 *   - getActiveSnapshot()      — returns the current session's frozen snapshot, or null
 *   - setActiveSnapshot(snap)  — registers the snapshot as the active one for this session
 *   - clearActiveSnapshot()    — drops the active snapshot (e.g. between test runs)
 *   - generateSessionId()      — generates a stable session identifier
 *
 * The module holds ONE active snapshot per process. In a multi-session server
 * context the caller manages snapshot lifecycle per session and uses the returned
 * object directly rather than relying on the module-level active pointer.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Session ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a session ID: timestamp (ms) + 6-char hex random suffix.
 * Example: "20260416T143022-a3f1c9"
 * @returns {string}
 */
function generateSessionId() {
  const now  = new Date();
  const ts   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', 'T');
  const rand = crypto.randomBytes(3).toString('hex');
  return `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Snapshot creation
// ---------------------------------------------------------------------------

/**
 * Read a single file for inclusion in the snapshot.
 * Returns { path, content, error } — error is null on success, string on failure.
 *
 * @param {string} filePath — absolute or project-relative path
 * @returns {{ path: string, content: string|null, error: string|null }}
 */
function _readSourceFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { path: filePath, content, error: null };
  } catch (err) {
    return { path: filePath, content: null, error: err.message };
  }
}

/**
 * Compute a stable SHA-256 fingerprint for snapshot content.
 * @param {string} concatenated — all file contents joined
 * @returns {string} hex digest
 */
function _hashContent(concatenated) {
  return crypto.createHash('sha256').update(concatenated, 'utf8').digest('hex');
}

/**
 * @typedef {Object} SnapshotEntry
 * @property {string}      path     — file path as provided
 * @property {string|null} content  — file content, or null if unreadable
 * @property {string|null} error    — error message if file could not be read
 */

/**
 * @typedef {Object} SessionSnapshot
 * @property {string}          sessionId    — unique session identifier
 * @property {string}          createdAt    — ISO 8601 creation timestamp
 * @property {string[]}        sources      — list of source paths requested
 * @property {SnapshotEntry[]} files        — per-file content (includes failures)
 * @property {string}          contentHash  — SHA-256 of all successfully read content
 * @property {number}          loadedCount  — number of files successfully loaded
 * @property {number}          errorCount   — number of files that failed to load
 * @property {boolean}         frozen       — always true; marker for consumers
 */

/**
 * Build a frozen session snapshot from the provided source paths.
 *
 * The snapshot captures the state of each file AT BUILD TIME. Any subsequent
 * writes to those files do not change the snapshot (frozen semantics).
 *
 * @param {string[]} sources       — array of file paths to include
 * @param {object}  [options]
 * @param {string}  [options.sessionId]  — override auto-generated session ID
 * @param {string}  [options.createdAt]  — override auto-generated timestamp (ISO 8601)
 * @returns {SessionSnapshot}
 */
function createSnapshot(sources, options = {}) {
  if (!Array.isArray(sources)) {
    throw new TypeError('createSnapshot: sources must be an array of file paths');
  }

  const sessionId = options.sessionId || generateSessionId();
  const createdAt = options.createdAt || new Date().toISOString();

  const files = sources.map(_readSourceFile);

  // Build concatenated content for hashing (only successful reads)
  const loaded   = files.filter(f => f.content !== null);
  const concatenated = loaded.map(f => f.content).join('\n');
  const contentHash  = loaded.length > 0 ? _hashContent(concatenated) : '';

  const snapshot = {
    sessionId,
    createdAt,
    sources: [...sources],
    files,
    contentHash,
    loadedCount: loaded.length,
    errorCount:  files.length - loaded.length,
    frozen: true,
  };

  // Deep-freeze the snapshot so mutations are caught at development time
  Object.freeze(snapshot.sources);
  Object.freeze(snapshot.files);
  Object.freeze(snapshot);

  return snapshot;
}

// ---------------------------------------------------------------------------
// Module-level active snapshot (single-session process model)
// ---------------------------------------------------------------------------

/** @type {SessionSnapshot|null} */
let _activeSnapshot = null;

/**
 * Return the active snapshot for the current session, or null if none has been set.
 * @returns {SessionSnapshot|null}
 */
function getActiveSnapshot() {
  return _activeSnapshot;
}

/**
 * Register a snapshot as the active one for the current session.
 * Can only be called once per session; subsequent calls throw to prevent
 * accidental mid-session replacement (frozen semantics).
 *
 * To replace the snapshot deliberately (e.g. explicit refresh), call
 * clearActiveSnapshot() first.
 *
 * @param {SessionSnapshot} snapshot
 * @throws {Error} if an active snapshot already exists
 */
function setActiveSnapshot(snapshot) {
  if (_activeSnapshot !== null) {
    throw new Error(
      'setActiveSnapshot: a snapshot is already active for this session. ' +
      'Call clearActiveSnapshot() first if an explicit refresh is intended.'
    );
  }
  if (!snapshot || typeof snapshot !== 'object' || snapshot.frozen !== true) {
    throw new TypeError('setActiveSnapshot: argument must be a frozen SessionSnapshot object');
  }
  _activeSnapshot = snapshot;
}

/**
 * Clear the active snapshot. Allows a new snapshot to be registered.
 * Intended for: test teardown, explicit session refresh, process restart.
 */
function clearActiveSnapshot() {
  _activeSnapshot = null;
}

/**
 * Convenience: build a snapshot from sources and immediately set it as active.
 * Throws if a snapshot is already active (use clearActiveSnapshot() first).
 *
 * @param {string[]} sources
 * @param {object}  [options]  — passed through to createSnapshot()
 * @returns {SessionSnapshot}
 */
function buildAndActivateSnapshot(sources, options = {}) {
  const snap = createSnapshot(sources, options);
  setActiveSnapshot(snap);
  return snap;
}

// ---------------------------------------------------------------------------
// Snapshot rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render the snapshot's loaded file content as a single string suitable for
 * injection into a session context or prompt.
 *
 * Only successfully loaded files are included. Files that failed to load
 * appear as a short diagnostic comment instead of being silently skipped.
 *
 * @param {SessionSnapshot} snapshot
 * @param {object} [options]
 * @param {boolean} [options.includeErrors=true]  — include error stubs for unreadable files
 * @param {string}  [options.separator='\n\n---\n\n']
 * @returns {string}
 */
function renderSnapshotContent(snapshot, options = {}) {
  const includeErrors = options.includeErrors !== false;
  const separator     = options.separator || '\n\n---\n\n';

  const parts = [];
  for (const entry of snapshot.files) {
    if (entry.content !== null) {
      const basename = path.basename(entry.path);
      parts.push(`<!-- source: ${basename} -->\n${entry.content}`);
    } else if (includeErrors) {
      const basename = path.basename(entry.path);
      parts.push(`<!-- source: ${basename} — could not be loaded: ${entry.error} -->`);
    }
  }

  return parts.join(separator);
}

/**
 * Return a compact diagnostics summary for logging/reporting.
 *
 * @param {SessionSnapshot} snapshot
 * @returns {string}
 */
function describeSnapshot(snapshot) {
  const lines = [
    `Session: ${snapshot.sessionId}`,
    `Created: ${snapshot.createdAt}`,
    `Files:   ${snapshot.loadedCount} loaded, ${snapshot.errorCount} failed`,
    `Hash:    ${snapshot.contentHash || '(empty)'}`,
  ];
  if (snapshot.errorCount > 0) {
    const failed = snapshot.files.filter(f => f.error).map(f => `  - ${f.path}: ${f.error}`);
    lines.push('Failed sources:');
    lines.push(...failed);
  }
  return lines.join('\n');
}

module.exports = {
  generateSessionId,
  createSnapshot,
  getActiveSnapshot,
  setActiveSnapshot,
  clearActiveSnapshot,
  buildAndActivateSnapshot,
  renderSnapshotContent,
  describeSnapshot,
};
