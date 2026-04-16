'use strict';

/**
 * lib/runtime/provider.js — MemoryProvider base class
 *
 * JavaScript port of hermes-agent's agent/memory_provider.py for the
 * Memora runtime layer.  Defines the contract every optional memory
 * provider must implement.
 *
 * All methods have no-op / safe-default implementations so subclasses
 * only override what they actually need.  Core lifecycle methods are
 * clearly documented but deliberately not "abstract" — Node.js has no
 * built-in abstract enforcement; callers rely on JSDoc and runtime checks.
 *
 * ## Lifecycle overview
 *
 *   (1) Registration  → ProviderRegistry.addProvider(provider)
 *   (2) Startup       → provider.isAvailable() checked first; if false, skipped
 *                        provider.initialize(sessionId, opts)
 *   (3) Per-turn      → provider.onTurnStart(turnNumber, message, opts)
 *                        provider.prefetch(query, opts)  → context string
 *                        provider.syncTurn(user, assistant, opts)
 *                        provider.queuePrefetch(query, opts)  [background]
 *   (4) Hooks         → provider.onPreCompress(messages)  → string
 *                        provider.onMemoryWrite(action, target, content)
 *                        provider.onDelegation(task, result, opts)
 *   (5) Session end   → provider.onSessionEnd(messages)
 *   (6) Shutdown      → provider.shutdown()
 *
 * ## Tool integration
 *
 *   provider.getToolSchemas()  → array of { name, description, parameters }
 *   provider.handleToolCall(toolName, args, opts)  → string (JSON result)
 *
 * @module provider
 */

class MemoryProvider {
  /**
   * Short identifier for this provider.
   * Subclasses MUST override to return a unique, stable string.
   * Used as a display name and for registry lookup.
   *
   * @returns {string}
   */
  get name() {
    return 'unnamed';
  }

  // ---------------------------------------------------------------------------
  // Core lifecycle — subclasses should override
  // ---------------------------------------------------------------------------

  /**
   * Return true if this provider is configured, has credentials, and is ready.
   *
   * Called during registry initialization to decide whether to activate the
   * provider.  Must NOT make network calls — check only config and installed
   * dependencies.
   *
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Initialize for a new session.
   *
   * Called once at session startup.  May create resources, establish
   * connections, warm up caches, etc.
   *
   * @param {string} sessionId        — unique session identifier
   * @param {object} [opts]           — implementation-specific options
   * @param {string} [opts.projectDir] — working directory of the project
   * @param {string} [opts.platform]  — 'cli', 'vscode', 'api', etc.
   * @param {string} [opts.agentContext] — 'primary', 'subagent', 'cron'
   * @returns {void}
   */
  initialize(sessionId, opts = {}) {    // eslint-disable-line no-unused-vars
    // no-op default
  }

  /**
   * Clean shutdown — flush queues, close connections, release resources.
   * Called in reverse registration order by the registry.
   *
   * @returns {void}
   */
  shutdown() {
    // no-op default
  }

  // ---------------------------------------------------------------------------
  // Context integration
  // ---------------------------------------------------------------------------

  /**
   * Return a static text block to include in the system prompt.
   *
   * Called during system prompt assembly.  Return empty string to skip.
   * Use for STATIC provider info (instructions, status).
   * Prefetched recall context is injected separately via prefetch().
   *
   * @returns {string}
   */
  systemPromptBlock() {
    return '';
  }

  /**
   * Recall relevant context for the upcoming turn.
   *
   * Called before each API call.  Return formatted text to inject as
   * context, or empty string if nothing relevant.  Implementations
   * should be fast — do the heavy lifting in queuePrefetch and cache.
   *
   * @param {string} query           — the user's query / upcoming turn text
   * @param {object} [opts]
   * @param {string} [opts.sessionId] — for providers serving concurrent sessions
   * @returns {string}
   */
  prefetch(query, opts = {}) {        // eslint-disable-line no-unused-vars
    return '';
  }

  /**
   * Queue a background recall for the NEXT turn.
   *
   * Called after each turn completes.  The result will be consumed by
   * prefetch() on the next turn.  Default is no-op — override in providers
   * that do background prefetching.
   *
   * @param {string} query
   * @param {object} [opts]
   * @param {string} [opts.sessionId]
   * @returns {void}
   */
  queuePrefetch(query, opts = {}) {   // eslint-disable-line no-unused-vars
    // no-op default
  }

  /**
   * Persist a completed turn to the backend.
   *
   * Called after each turn completes.  Should be non-blocking — queue for
   * background processing if the backend has latency.
   *
   * @param {string} userContent       — the user's turn content
   * @param {string} assistantContent  — the assistant's response
   * @param {object} [opts]
   * @param {string} [opts.sessionId]
   * @returns {void}
   */
  syncTurn(userContent, assistantContent, opts = {}) {  // eslint-disable-line no-unused-vars
    // no-op default
  }

  // ---------------------------------------------------------------------------
  // Tool integration
  // ---------------------------------------------------------------------------

  /**
   * Return tool schemas this provider exposes to the model.
   *
   * Each schema follows the OpenAI function-calling format:
   *   { name: string, description: string, parameters: JSONSchema }
   *
   * Return empty array if this provider has no tools (context-only).
   *
   * @returns {Array<{name:string, description:string, parameters:object}>}
   */
  getToolSchemas() {
    return [];
  }

  /**
   * Handle a tool call for one of this provider's tools.
   *
   * Must return a JSON string (the tool result).
   * Only called for tool names returned by getToolSchemas().
   *
   * @param {string} toolName
   * @param {object} args
   * @param {object} [opts]
   * @returns {string}   JSON result string
   */
  handleToolCall(toolName, args, opts = {}) {  // eslint-disable-line no-unused-vars
    throw new Error(`Provider '${this.name}' does not handle tool '${toolName}'`);
  }

  // ---------------------------------------------------------------------------
  // Optional lifecycle hooks — override to opt in
  // ---------------------------------------------------------------------------

  /**
   * Called at the start of each turn with the user message.
   *
   * Use for turn-counting, scope management, periodic maintenance.
   *
   * @param {number} turnNumber  — 1-based turn counter
   * @param {string} message     — user message text for this turn
   * @param {object} [opts]      — { remainingTokens, model, platform, toolCount }
   * @returns {void}
   */
  onTurnStart(turnNumber, message, opts = {}) {  // eslint-disable-line no-unused-vars
    // no-op default
  }

  /**
   * Called when a session ends (explicit exit, /reset, timeout).
   *
   * Use for end-of-session fact extraction, summarization, etc.
   * messages is the full conversation history.
   *
   * NOT called after every turn — only at actual session boundaries.
   *
   * @param {Array<{role:string, content:string}>} messages
   * @returns {void}
   */
  onSessionEnd(messages) {  // eslint-disable-line no-unused-vars
    // no-op default
  }

  /**
   * Called before context compression discards old messages.
   *
   * Use to extract insights from messages about to be compressed.
   * Return text to include in the compression summary prompt so the
   * compressor preserves provider-extracted insights.
   * Return empty string for no contribution (backwards-compatible default).
   *
   * @param {Array<{role:string, content:string}>} messages — messages to be compressed
   * @returns {string}
   */
  onPreCompress(messages) {  // eslint-disable-line no-unused-vars
    return '';
  }

  /**
   * Called when the canonical memory (memory-bank) is written.
   *
   * Use to mirror canonical memory writes to your backend.
   * action: 'add' | 'replace' | 'remove'
   * target: 'memory' | 'user' | path fragment
   * content: the entry content
   *
   * @param {string} action   — 'add' | 'replace' | 'remove'
   * @param {string} target   — target file / memory domain
   * @param {string} content  — entry content
   * @returns {void}
   */
  onMemoryWrite(action, target, content) {  // eslint-disable-line no-unused-vars
    // no-op default
  }

  /**
   * Called on the PARENT agent when a subagent completes.
   *
   * The parent's provider gets the task+result pair as an observation of
   * what was delegated and what came back.
   *
   * @param {string} task              — the delegation prompt / task description
   * @param {string} result            — the subagent's final response
   * @param {object} [opts]
   * @param {string} [opts.childSessionId] — the subagent's session identifier
   * @returns {void}
   */
  onDelegation(task, result, opts = {}) {  // eslint-disable-line no-unused-vars
    // no-op default
  }
}

module.exports = { MemoryProvider };
