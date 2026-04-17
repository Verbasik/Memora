'use strict';

/**
 * lib/runtime/bridge/opencode.js — OpenCode plugin bridge adapters
 *
 * OpenCode uses a server-side plugin architecture (ES module, @opencode-ai/plugin SDK).
 * This module provides CJS bridge handlers that are called by the ESM plugin entrypoint
 * at .opencode/plugins/runtime-bridge.js via dynamic require (createRequire).
 *
 * Key differences from Claude/Codex/Qwen hook adapters:
 *   - No stdin/stdout shell protocol — plugin functions receive structured JS objects
 *   - session.created replaces SessionStart; session.deleted replaces SessionEnd
 *   - chat.message is the pre-turn recall entry point (not a command hook)
 *   - tool.execute.before/after intercept tool calls in-process (not shell level)
 *   - No permissionDecision output — blocked writes throw an Error
 *   - apply_patch interception uses input.args (not output.args) in tool.execute.after
 *
 * Event contracts confirmed from @opencode-ai/plugin 1.4.6 type definitions.
 * FR coverage: FR-401 (session.created), FR-402 (chat.message),
 *              FR-403 (session.deleted), FR-404 (tool.execute.before/after, session.status).
 */

const fs   = require('fs');
const path = require('path');

const bridge = require('./');

const DEFAULT_STARTUP_FILES = [
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
];

// Matches canonical memory paths that Memora manages.
const CANONICAL_MEMORY_RE =
  /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/;

// ── FR-401 ─────────────────────────────────────────────────────────────────────

/**
 * Handle OpenCode session.created event — runtime bootstrap.
 *
 * Called by the plugin's `event` handler when event.type === 'session.created'.
 * Unlike hook-based adapters, this receives a structured event object.
 *
 * @param {object} event   - OpenCode Event: { type, properties }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {object|null}  - bootstrapSession result, or null if sessionId absent
 */
function handleSessionCreated(event, deps = {}) {
  const sessionId   = (event && event.properties && event.properties.sessionID) || null;
  if (!sessionId) return null;

  const runtimeBridge = deps.bridge    || bridge;
  const rt            = deps.runtime   || require('..');
  const projectDir    = deps.projectDir || process.cwd();
  const startupFiles  = _resolveExistingFiles(projectDir, DEFAULT_STARTUP_FILES);

  const result = runtimeBridge.bootstrapSession({
    sessionId,
    toolchain:             'opencode',
    projectDir,
    title:                 'OpenCode session',
    contextFiles:          startupFiles,
    snapshotSources:       startupFiles,
    // OpenCode has an in-process runtime — use provider registration path.
    registerLocalProvider: true,
    initializeProviders:   true,
    openTranscriptSession: false,
  }, { runtime: rt });

  return result;
}

// ── FR-402 ─────────────────────────────────────────────────────────────────────

/**
 * Handle OpenCode chat.message hook — pre-turn recall.
 *
 * Called by the plugin's `chat.message` handler with the SDK input/output objects.
 * Returns the additionalContext string to prepend, or null if no recall.
 *
 * The caller (plugin entrypoint) is responsible for mutating output.parts.
 *
 * @param {object} input   - { sessionID, agent?, model?, messageID?, variant? }
 * @param {object} output  - { message: UserMessage, parts: Part[] }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {string|null}  - additionalContext to prepend, or null
 */
function handleChatMessage(input, output, deps = {}) {
  const runtimeBridge = deps.bridge  || bridge;
  const rt            = deps.runtime || require('..');

  const sessionId = (input && input.sessionID) || null;
  const text      = _extractMessageText(output);

  // Record user turn into transcript store.
  if (sessionId && text) {
    rt.recordTurnUserMessage(sessionId, { content: text, source: 'opencode' });
  }

  if (!text) return null;

  const result = runtimeBridge.prepareTurn({
    turnNumber:               1,
    userMessage:              text,
    recallQuery:              text,
    useProviderPrefetch:      true,
    useDirectTranscriptRecall: true,
    prefetchOptions:          { source: 'opencode' },
    recallOptions:            { source: 'opencode', maxSessions: 3 },
  }, deps);

  return result.additionalContext || null;
}

// ── FR-404 (pre-write) ─────────────────────────────────────────────────────────

/**
 * Handle OpenCode tool.execute.before — canonical write screening.
 *
 * Called by the plugin's `tool.execute.before` handler.
 * The file path is in output.args (mutable; can be modified before tool runs).
 *
 * Throws an Error if write is blocked — OpenCode treats thrown errors as
 * tool-execution failures (equivalent to deny).
 *
 * @param {object} input   - { tool, sessionID, callID }
 * @param {object} output  - { args: { filePath?, path?, content?, ... } }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {null}         - Returns null on pass; throws on deny
 */
function handleToolExecuteBefore(input, output, deps = {}) {
  const rt = deps.runtime || require('..');

  const args     = (output && output.args) || {};
  const filePath = args.filePath || args.path || '';
  const content  = args.content  || '';

  if (!CANONICAL_MEMORY_RE.test(filePath)) return null;

  const check = rt.checkMemoryWrite(content);
  if (check.allowed) return null;

  throw new Error(
    `Memora blocked ${(input && input.tool) || 'tool'} (${check.patternId || 'unknown_pattern'})`
  );
}

// ── FR-404 (post-write) ────────────────────────────────────────────────────────

/**
 * Handle OpenCode tool.execute.after — observe apply_patch canonical writes.
 *
 * Called by the plugin's `tool.execute.after` handler.
 * Note: in tool.execute.after, args come from input.args (already executed),
 * NOT from output.args (which is for tool.execute.before only).
 *
 * @param {object} input   - { tool, sessionID, callID, args }
 * @param {object} output  - { title, output, metadata }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {null}         - Always null; side effects only
 */
function handleToolExecuteAfter(input, output, deps = {}) {
  const rt = deps.runtime || require('..');

  if (!input || input.tool !== 'apply_patch') return null;

  const patchText = (input.args && input.args.patchText) || '';
  if (!patchText || !CANONICAL_MEMORY_RE.test(patchText)) return null;

  rt.onMemoryWrite('apply_patch', 'memory-bank', patchText);
  return null;
}

// ── FR-404 (compaction) ────────────────────────────────────────────────────────

/**
 * Handle OpenCode experimental.session.compacting — inject preserved runtime context.
 *
 * Called by the plugin's `experimental.session.compacting` handler.
 * Mutates output.context by appending a Memora context string.
 *
 * @param {object} input   - { sessionID }
 * @param {object} output  - { context: string[], prompt?: string }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {null}         - Side effects only (mutates output.context)
 */
function handleSessionCompacting(input, output, deps = {}) {
  const rt = deps.runtime || require('..');

  rt.onPreCompress([]);

  if (output) {
    if (!Array.isArray(output.context)) {
      output.context = [];
    }
    output.context.push([
      '## Memora Runtime',
      '- Canonical memory lives in memory-bank/',
      '- Transcript recall is non-canonical',
      '- Preserve current runtime-bridge progress and active files',
    ].join('\n'));
  }

  return null;
}

// ── FR-403 ─────────────────────────────────────────────────────────────────────

/**
 * Handle OpenCode session.deleted event — true session finalization.
 *
 * Called by the plugin's `event` handler when event.type === 'session.deleted'.
 * Uses session.deleted (not session.idle) as the authoritative close signal
 * per FR-403: session.idle is deprecated and must not be used as the sole finalizer.
 *
 * @param {object} event   - OpenCode Event: { type, properties }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {null}         - Always null; side effects only
 */
function handleSessionDeleted(event, deps = {}) {
  const rt        = deps.runtime || require('..');
  const sessionId = (event && event.properties && event.properties.sessionID) || null;

  if (sessionId) {
    rt.closeTranscriptSession(sessionId);
  }

  try {
    rt.onSessionEnd([]);
  } finally {
    rt.getProviderRegistry().shutdownAll();
  }

  return null;
}

// ── FR-404 (session.status checkpoint) ────────────────────────────────────────

/**
 * Handle OpenCode session.status event — checkpoint observability.
 *
 * session.status is the primary status event per FR-404.
 * session.idle is deprecated legacy; handled as a backward-compat fallback only.
 *
 * @param {object} event   - OpenCode Event: { type, properties }
 * @param {object} [deps]  - Injectable dependencies for testing
 * @returns {null}         - Observability only; no output mutations
 */
function handleSessionStatus(event, deps = {}) {
  // Observability-only: log idle transitions for diagnostics.
  const statusType = (event && event.properties && event.properties.status && event.properties.status.type) || null;

  if (statusType === 'idle') {
    // Side-effect: could trigger checkpoint flush in the future.
    // For now, this is a no-op observer (logging done by plugin entrypoint).
  }

  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _resolveExistingFiles(projectDir, relativePaths) {
  return relativePaths
    .map((relativePath) => path.join(projectDir, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));
}

/**
 * Extract plain text from a UserMessage output object.
 * output.message.content may be a string or an array of Parts.
 */
function _extractMessageText(output) {
  if (!output || !output.message) return '';

  const content = output.message.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join(' ');
  }

  return '';
}

module.exports = {
  handleSessionCreated,
  handleChatMessage,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
  handleSessionCompacting,
  handleSessionDeleted,
  handleSessionStatus,
};
