'use strict';

/**
 * lib/runtime/providers/local.js — LocalMemoryProvider
 *
 * Built-in MemoryProvider that bridges the Phase 2 Transcript Layer
 * (TranscriptStore JSONL backend + recallTranscripts pipeline) to the
 * Phase 3 MemoryProvider contract.
 *
 * This is Memora's default, zero-dependency memory provider:
 *   - No external services required (pure local JSONL storage)
 *   - isAvailable() always returns true
 *   - Injectable store for isolated unit/integration testing
 *
 * Lifecycle mapping:
 *   initialize(sessionId, opts) → store.openSession()  (session start)
 *   prefetch(query, opts)       → recallTranscripts()  (before each turn)
 *   syncTurn(user, assistant)   → store.appendMessage() × 2 (after each turn)
 *   onSessionEnd(messages)      → store.closeSession() (explicit session end)
 *   shutdown()                  → store.closeSession() (safety fallback teardown)
 *
 * Out-of-scope for Phase 3 (kept as no-op base defaults):
 *   - getToolSchemas() / handleToolCall() — no tools exposed in Phase 3
 *   - systemPromptBlock()   — no static instructions injected
 *   - queuePrefetch()       — background prefetch not needed here
 *   - onTurnStart()         — no per-turn side effects needed
 *   - onPreCompress()       — no compression annotations needed
 *   - onMemoryWrite()       — canonical writes not mirrored to transcript
 *   - onDelegation()        — subagent observation out of scope for Phase 3
 *
 * @module providers/local
 */

const { MemoryProvider } = require('../provider');
const { TranscriptStore } = require('../transcript/store');
const { recallTranscripts } = require('../transcript/recall');

class LocalMemoryProvider extends MemoryProvider {
  /**
   * @param {object}          [opts]
   * @param {TranscriptStore} [opts.store]    — inject a pre-built store (testing)
   * @param {string}          [opts.dataDir]  — forwarded to TranscriptStore constructor
   *                                            if no store is injected
   */
  constructor(opts = {}) {
    super();
    /** @type {TranscriptStore|null} */
    this._store      = opts.store   || null;
    this._dataDir    = opts.dataDir || undefined;
    this._sessionId  = null;
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** @returns {'local-transcript'} */
  get name() {
    return 'local-transcript';
  }

  // ---------------------------------------------------------------------------
  // Core lifecycle
  // ---------------------------------------------------------------------------

  /** Always available — no external service or credential required. */
  isAvailable() {
    return true;
  }

  /**
   * Open a transcript session in the store.
   *
   * If no store was injected in the constructor, a TranscriptStore is
   * created here (lazy init) pointing at opts.dataDir or the default path.
   *
   * @param {string} sessionId   — unique session identifier
   * @param {object} [opts]
   * @param {string} [opts.projectDir]  — forwarded to TranscriptStore.openSession()
   * @param {string} [opts.source]      — toolchain id; see VALID_SOURCES in store.js
   * @param {string} [opts.title]       — optional human-readable session title
   */
  initialize(sessionId, opts = {}) {
    if (!this._store) {
      this._store = new TranscriptStore(this._dataDir);
    }
    this._sessionId = sessionId;
    this._store.openSession(sessionId, {
      projectDir: opts.projectDir || process.cwd(),
      source:     opts.source    || 'unknown',
      title:      opts.title     || null,
    });
  }

  /**
   * Close the active transcript session (safety fallback).
   *
   * Called in reverse registration order by ProviderRegistry.shutdownAll().
   * Idempotent — safe to call even if onSessionEnd() already ran.
   */
  shutdown() {
    this._closeSession();
  }

  // ---------------------------------------------------------------------------
  // Context integration
  // ---------------------------------------------------------------------------

  /**
   * Recall relevant context from past transcript sessions for the upcoming turn.
   *
   * Delegates to recallTranscripts() which returns a fenced recall block
   * assembled from matching sessions.  Returns '' if the store is not ready
   * or no query is provided.
   *
   * @param {string} query
   * @param {object} [opts]  — maxSessions, maxSessionChars, source
   * @returns {string}  fenced recall block or empty string
   */
  prefetch(query, opts = {}) {
    if (!this._store || !query || !query.trim()) return '';
    const result = recallTranscripts(this._store, query, opts);
    return result.block || '';
  }

  /**
   * Append a completed turn (user message + assistant response) to the store.
   *
   * Silently no-ops if the provider was not successfully initialized (no
   * sessionId), so registry-level failure isolation is not required here.
   *
   * @param {string} userContent
   * @param {string} assistantContent
   * @param {object} [opts]
   * @param {string} [opts.sessionId]  — override active sessionId (for multi-session use)
   */
  syncTurn(userContent, assistantContent, opts = {}) {
    if (!this._store || !this._sessionId) return;
    const sid = opts.sessionId || this._sessionId;
    if (userContent) {
      this._store.appendMessage(sid, { role: 'user',      content: userContent });
    }
    if (assistantContent) {
      this._store.appendMessage(sid, { role: 'assistant', content: assistantContent });
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  /**
   * Close the active transcript session when the session ends.
   *
   * @param {Array<{role:string,content:string}>} messages — full conversation history
   */
  onSessionEnd(messages) {  // eslint-disable-line no-unused-vars
    this._closeSession();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Close the active session in the store and reset internal state.
   * Idempotent — safe to call multiple times.
   * @private
   */
  _closeSession() {
    if (this._store && this._sessionId) {
      try {
        this._store.closeSession(this._sessionId);
      } catch (_) {
        // best-effort — session might already be closed or I/O unavailable
      }
      this._sessionId = null;
    }
  }
}

module.exports = { LocalMemoryProvider };
