'use strict';

/**
 * lib/runtime/provider-registry.js — ProviderRegistry
 *
 * JavaScript port of hermes-agent's agent/memory_manager.py for the
 * Memora runtime layer.  Orchestrates one or more MemoryProvider instances
 * with full failure isolation between them.
 *
 * Design principles (inherited from Hermes MemoryManager):
 *   - Failures in any single provider NEVER block other providers.
 *   - Failures are collected as diagnostic strings, not thrown.
 *   - All fan-out operations (hooks, sync, prefetch) iterate all providers.
 *   - String-returning fan-outs (onPreCompress, prefetchAll, buildSystemPrompt)
 *     join non-empty contributions with "\n\n".
 *   - Tool name conflicts across providers are detected on registration;
 *     first-registered wins, duplicates are noted in diagnostics.
 *
 * Usage:
 *   const registry = new ProviderRegistry();
 *   registry.addProvider(new LocalMemoryProvider());
 *   registry.initializeAll('sess-001', { projectDir: process.cwd() });
 *
 *   // per-turn
 *   registry.onTurnStart(1, userMessage);
 *   const context = registry.prefetchAll(userMessage);
 *   registry.syncAll(userMsg, assistantResponse);
 *
 *   // hooks
 *   const notes = registry.onPreCompress(messages);
 *   registry.onMemoryWrite('add', 'memory', content);
 *   registry.onDelegation(task, result, { childSessionId });
 *
 *   // shutdown
 *   registry.shutdownAll();
 *
 * @module provider-registry
 */

const { MemoryProvider } = require('./provider');

class ProviderRegistry {
  constructor() {
    /** @type {MemoryProvider[]} */
    this._providers = [];

    /**
     * Map of tool name → provider for fast dispatch.
     * @type {Map<string, MemoryProvider>}
     */
    this._toolToProvider = new Map();

    /**
     * Accumulated diagnostic messages from all operations since construction.
     * Consumers may read this for observability; it is append-only.
     * @type {string[]}
     */
    this.diagnostics = [];
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a memory provider.
   *
   * The provider's tool schemas are indexed immediately.  Duplicate tool
   * names from later-registered providers are skipped (first-registered wins)
   * and noted in diagnostics.
   *
   * Providers that report isAvailable() === false are still registered but
   * will be skipped during initializeAll().  This makes it easy to register
   * conditionally-available providers without external guard logic.
   *
   * @param {MemoryProvider} provider
   * @returns {boolean}  true if provider was accepted; false if duplicate name
   */
  addProvider(provider) {
    if (!(provider instanceof MemoryProvider)) {
      this._log(`addProvider: rejected — argument is not a MemoryProvider instance`);
      return false;
    }

    const name = provider.name;

    if (this._providers.some(p => p.name === name)) {
      this._log(`addProvider: rejected '${name}' — a provider with this name is already registered`);
      return false;
    }

    // Index tool schemas — first-registered wins on collision
    let toolSchemas;
    try {
      toolSchemas = provider.getToolSchemas();
    } catch (err) {
      toolSchemas = [];
      this._log(`addProvider: '${name}' getToolSchemas() failed during registration: ${err.message}`);
    }

    for (const schema of toolSchemas) {
      const toolName = schema && schema.name;
      if (!toolName) continue;

      if (this._toolToProvider.has(toolName)) {
        const existing = this._toolToProvider.get(toolName).name;
        this._log(
          `addProvider: tool name conflict — '${toolName}' already registered by '${existing}'; ` +
          `ignoring from '${name}'`
        );
      } else {
        this._toolToProvider.set(toolName, provider);
      }
    }

    this._providers.push(provider);
    this._log(`addProvider: '${name}' registered (${toolSchemas.length} tool(s))`);
    return true;
  }

  /**
   * Remove a provider by name.
   * Also removes its tool schema entries from the dispatch map.
   *
   * @param {string} name
   * @returns {boolean}  true if a provider was removed
   */
  removeProvider(name) {
    const idx = this._providers.findIndex(p => p.name === name);
    if (idx === -1) {
      this._log(`removeProvider: '${name}' not found`);
      return false;
    }

    const provider = this._providers[idx];
    this._providers.splice(idx, 1);

    // Remove tool entries that belonged to this provider
    for (const [toolName, owner] of this._toolToProvider.entries()) {
      if (owner === provider) {
        this._toolToProvider.delete(toolName);
      }
    }

    this._log(`removeProvider: '${name}' removed`);
    return true;
  }

  /**
   * Get a registered provider by name, or null if not found.
   *
   * @param {string} name
   * @returns {MemoryProvider|null}
   */
  getProvider(name) {
    return this._providers.find(p => p.name === name) || null;
  }

  /**
   * Check whether a provider with the given name is registered.
   *
   * @param {string} name
   * @returns {boolean}
   */
  hasProvider(name) {
    return this._providers.some(p => p.name === name);
  }

  /**
   * All registered providers in registration order (copy).
   * @returns {MemoryProvider[]}
   */
  get providers() {
    return this._providers.slice();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — bulk operations
  // ---------------------------------------------------------------------------

  /**
   * Initialize all available providers.
   *
   * Providers that return isAvailable() === false are skipped.
   * Failures in individual providers are isolated and noted in diagnostics.
   *
   * @param {string} sessionId
   * @param {object} [opts]  — forwarded to each provider.initialize()
   * @returns {{ initialized: string[], skipped: string[], failed: string[] }}
   */
  initializeAll(sessionId, opts = {}) {
    const initialized = [];
    const skipped     = [];
    const failed      = [];

    for (const provider of this._providers) {
      let available;
      try {
        available = provider.isAvailable();
      } catch (err) {
        this._log(`initializeAll: '${provider.name}' isAvailable() threw: ${err.message}`);
        available = false;
      }

      if (!available) {
        skipped.push(provider.name);
        this._log(`initializeAll: '${provider.name}' skipped (isAvailable=false)`);
        continue;
      }

      try {
        provider.initialize(sessionId, opts);
        initialized.push(provider.name);
        this._log(`initializeAll: '${provider.name}' initialized`);
      } catch (err) {
        failed.push(provider.name);
        this._log(`initializeAll: '${provider.name}' initialize() failed: ${err.message}`);
      }
    }

    return { initialized, skipped, failed };
  }

  /**
   * Shut down all providers in reverse registration order.
   *
   * Failures in individual providers are isolated and noted in diagnostics.
   *
   * @returns {{ shutdown: string[], failed: string[] }}
   */
  shutdownAll() {
    const shutdown = [];
    const failed   = [];

    for (const provider of this._providers.slice().reverse()) {
      try {
        provider.shutdown();
        shutdown.push(provider.name);
      } catch (err) {
        failed.push(provider.name);
        this._log(`shutdownAll: '${provider.name}' shutdown() failed: ${err.message}`);
      }
    }

    return { shutdown, failed };
  }

  // ---------------------------------------------------------------------------
  // Context integration — fan-out
  // ---------------------------------------------------------------------------

  /**
   * Collect system prompt blocks from all providers.
   *
   * @returns {string}  joined non-empty blocks separated by "\n\n"
   */
  buildSystemPrompt() {
    return this._collectStrings(
      p => p.systemPromptBlock(),
      'buildSystemPrompt'
    );
  }

  /**
   * Recall relevant context from all providers for the upcoming turn.
   *
   * @param {string} query
   * @param {object} [opts]
   * @param {string} [opts.sessionId]
   * @returns {string}  merged context from all providers
   */
  prefetchAll(query, opts = {}) {
    return this._collectStrings(
      p => p.prefetch(query, opts),
      'prefetchAll'
    );
  }

  /**
   * Queue background prefetch on all providers for the next turn.
   *
   * @param {string} query
   * @param {object} [opts]
   * @returns {void}
   */
  queuePrefetchAll(query, opts = {}) {
    this._fireAll(p => p.queuePrefetch(query, opts), 'queuePrefetchAll');
  }

  /**
   * Persist a completed turn to all providers.
   *
   * @param {string} userContent
   * @param {string} assistantContent
   * @param {object} [opts]
   * @returns {void}
   */
  syncAll(userContent, assistantContent, opts = {}) {
    this._fireAll(
      p => p.syncTurn(userContent, assistantContent, opts),
      'syncAll'
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks — fan-out
  // ---------------------------------------------------------------------------

  /**
   * Notify all providers of a new turn start.
   *
   * @param {number} turnNumber
   * @param {string} message
   * @param {object} [opts]   — { remainingTokens, model, platform, toolCount }
   * @returns {void}
   */
  onTurnStart(turnNumber, message, opts = {}) {
    this._fireAll(
      p => p.onTurnStart(turnNumber, message, opts),
      'onTurnStart'
    );
  }

  /**
   * Notify all providers of session end.
   *
   * @param {Array<{role:string,content:string}>} messages
   * @returns {void}
   */
  onSessionEnd(messages) {
    this._fireAll(p => p.onSessionEnd(messages), 'onSessionEnd');
  }

  /**
   * Notify all providers before context compression.
   *
   * Returns combined text from providers to include in the compression summary
   * prompt.  Empty string if no provider contributes.
   *
   * @param {Array<{role:string,content:string}>} messages — messages to be compressed
   * @returns {string}
   */
  onPreCompress(messages) {
    return this._collectStrings(
      p => p.onPreCompress(messages),
      'onPreCompress'
    );
  }

  /**
   * Notify all providers when the canonical memory is written.
   *
   * @param {string} action   — 'add' | 'replace' | 'remove'
   * @param {string} target   — target file / memory domain
   * @param {string} content
   * @returns {void}
   */
  onMemoryWrite(action, target, content) {
    this._fireAll(
      p => p.onMemoryWrite(action, target, content),
      'onMemoryWrite'
    );
  }

  /**
   * Notify all providers that a subagent completed.
   *
   * @param {string} task
   * @param {string} result
   * @param {object} [opts]
   * @param {string} [opts.childSessionId]
   * @returns {void}
   */
  onDelegation(task, result, opts = {}) {
    this._fireAll(
      p => p.onDelegation(task, result, opts),
      'onDelegation'
    );
  }

  // ---------------------------------------------------------------------------
  // Tool routing
  // ---------------------------------------------------------------------------

  /**
   * Collect tool schemas from all providers.
   * Deduplicates by name (first-registered wins, consistent with addProvider).
   *
   * @returns {Array<{name:string,description:string,parameters:object}>}
   */
  getToolSchemas() {
    const schemas = [];
    const seen    = new Set();

    for (const provider of this._providers) {
      let providerSchemas;
      try {
        providerSchemas = provider.getToolSchemas();
      } catch (err) {
        this._log(`getToolSchemas: '${provider.name}' failed: ${err.message}`);
        continue;
      }

      for (const schema of providerSchemas) {
        const toolName = schema && schema.name;
        if (!toolName || seen.has(toolName)) continue;
        seen.add(toolName);
        schemas.push(schema);
      }
    }

    return schemas;
  }

  /**
   * Return the set of all registered tool names across all providers.
   *
   * @returns {Set<string>}
   */
  getToolNames() {
    return new Set(this._toolToProvider.keys());
  }

  /**
   * Return true if any provider handles the given tool name.
   *
   * @param {string} toolName
   * @returns {boolean}
   */
  hasTool(toolName) {
    return this._toolToProvider.has(toolName);
  }

  /**
   * Route a tool call to the correct provider.
   *
   * Returns a JSON string result.
   * Returns an error JSON string if no provider handles the tool or if the
   * provider throws.
   *
   * @param {string} toolName
   * @param {object} args
   * @param {object} [opts]
   * @returns {string}  JSON result string
   */
  handleToolCall(toolName, args, opts = {}) {
    const provider = this._toolToProvider.get(toolName);
    if (!provider) {
      const msg = `No memory provider handles tool '${toolName}'`;
      this._log(`handleToolCall: ${msg}`);
      return JSON.stringify({ error: msg });
    }

    try {
      return provider.handleToolCall(toolName, args, opts);
    } catch (err) {
      const msg = `Memory tool '${toolName}' (provider '${provider.name}') failed: ${err.message}`;
      this._log(`handleToolCall: ${msg}`);
      return JSON.stringify({ error: msg });
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Append a message to the diagnostics log.
   * @param {string} msg
   * @private
   */
  _log(msg) {
    this.diagnostics.push(msg);
  }

  /**
   * Fan-out a void operation to all providers with failure isolation.
   *
   * @param {function(MemoryProvider):void} fn
   * @param {string} opName  — for diagnostics
   * @private
   */
  _fireAll(fn, opName) {
    for (const provider of this._providers) {
      try {
        fn(provider);
      } catch (err) {
        this._log(`${opName}: '${provider.name}' failed (non-fatal): ${err.message}`);
      }
    }
  }

  /**
   * Fan-out a string-returning operation; join non-empty results with "\n\n".
   *
   * @param {function(MemoryProvider):string} fn
   * @param {string} opName  — for diagnostics
   * @returns {string}
   * @private
   */
  _collectStrings(fn, opName) {
    const parts = [];
    for (const provider of this._providers) {
      let result;
      try {
        result = fn(provider);
      } catch (err) {
        this._log(`${opName}: '${provider.name}' failed (non-fatal): ${err.message}`);
        continue;
      }
      if (result && result.trim()) {
        parts.push(result);
      }
    }
    return parts.join('\n\n');
  }
}

module.exports = { ProviderRegistry };
