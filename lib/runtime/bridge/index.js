'use strict';

/**
 * lib/runtime/bridge/index.js — shared runtime bridge helpers
 *
 * Thin orchestration layer between toolchain lifecycle events and the Memora
 * runtime API. This module is intentionally CLI-neutral: toolchain adapters
 * prepare event payloads, then call these helpers with normalized inputs.
 *
 * Phase 1 of the bridge layer focuses on:
 *   - session bootstrap: context screening + snapshot init + provider init
 *   - pre-turn preparation: onTurnStart + provider prefetch + transcript fallback
 *
 * Toolchain-specific hook/plugin wiring is implemented separately.
 */

const runtime = require('..');

function bootstrapSession(input, deps = {}) {
  const rt = deps.runtime || runtime;
  const diagnostics = [];
  const warnings = [];

  const sessionId = _requireString(input && input.sessionId, 'sessionId');
  const toolchain = _normalizeToolchain(input && input.toolchain);
  const projectDir = _normalizeProjectDir(input);
  const title = input && typeof input.title === 'string' ? input.title : null;
  const contextFiles = _normalizeStringArray(input && input.contextFiles);
  const snapshotSources = _normalizeStringArray(input && input.snapshotSources);

  const contextEntries = contextFiles.map((filePath) => {
    try {
      const result = rt.loadContextFile(filePath);
      if (result.diagnostics) diagnostics.push(`[context:${filePath}] ${result.diagnostics}`);
      return { filePath, ...result };
    } catch (err) {
      const message = `loadContextFile failed for '${filePath}': ${err.message}`;
      diagnostics.push(message);
      return {
        filePath,
        allowed: false,
        content: `[CONTEXT FILE ERROR: ${filePath}]`,
        diagnostics: message,
        patternId: 'bridge_context_error',
      };
    }
  });

  let snapshot = null;
  try {
    snapshot = {
      ok: true,
      ...rt.initSession(snapshotSources, input && input.snapshotOptions ? input.snapshotOptions : {}),
    };
    if (snapshot.diagnostics) diagnostics.push(snapshot.diagnostics);
  } catch (err) {
    snapshot = {
      ok: false,
      snapshot: null,
      diagnostics: `initSession failed: ${err.message}`,
      hasErrors: true,
    };
    diagnostics.push(snapshot.diagnostics);
  }

  const registry = rt.getProviderRegistry();

  let providerRegistration = {
    attempted: false,
    registered: false,
    providerName: 'local-transcript',
  };

  if (input && input.registerLocalProvider !== false) {
    providerRegistration = ensureLocalProvider(rt, input.localProviderOptions || {});
  }

  let providerInit = null;
  if (!(input && input.initializeProviders === false)) {
    try {
      providerInit = registry.initializeAll(sessionId, { projectDir, source: toolchain, title });
    } catch (err) {
      providerInit = { initialized: [], skipped: [], failed: ['bridge-initializeAll'] };
      diagnostics.push(`initializeAll failed: ${err.message}`);
    }
  }

  let transcript = null;
  if (input && input.openTranscriptSession === true) {
    if (input.registerLocalProvider !== false) {
      warnings.push(
        'openTranscriptSession=true вместе с local-transcript provider может дублировать ' +
        'session lifecycle в одном и том же storage path; используй только один primary transcript path.'
      );
    }

    try {
      transcript = rt.openTranscriptSession(sessionId, {
        projectDir,
        source: toolchain,
        title,
      });
      if (transcript.diagnostics) diagnostics.push(transcript.diagnostics);
    } catch (err) {
      transcript = {
        opened: false,
        session: null,
        diagnostics: `openTranscriptSession failed: ${err.message}`,
      };
      diagnostics.push(transcript.diagnostics);
    }
  }

  return {
    ok: snapshot.ok && (!transcript || transcript.opened),
    sessionId,
    toolchain,
    projectDir,
    title,
    contextEntries,
    additionalContext: _joinNonEmpty(contextEntries.map((entry) => entry.content)),
    snapshot,
    providerRegistration,
    providerInit,
    transcript,
    warnings,
    diagnostics,
  };
}

function prepareTurn(input, deps = {}) {
  const rt = deps.runtime || runtime;
  const diagnostics = [];

  const turnNumber = _normalizeTurnNumber(input && input.turnNumber);
  const userMessage = typeof (input && input.userMessage) === 'string'
    ? input.userMessage
    : '';
  const query = typeof (input && input.recallQuery) === 'string'
    ? input.recallQuery
    : userMessage;

  try {
    rt.onTurnStart(turnNumber, userMessage, input && input.turnOptions ? input.turnOptions : {});
  } catch (err) {
    diagnostics.push(`onTurnStart failed: ${err.message}`);
  }

  const registry = rt.getProviderRegistry();

  let providerContext = '';
  if (!(input && input.useProviderPrefetch === false) && query.trim()) {
    try {
      providerContext = registry.prefetchAll(query, input && input.prefetchOptions ? input.prefetchOptions : {});
    } catch (err) {
      diagnostics.push(`prefetchAll failed: ${err.message}`);
    }
  }

  let transcriptRecall = null;
  let transcriptContext = '';
  const shouldDirectRecall = (
    query.trim() &&
    input && input.useDirectTranscriptRecall === true &&
    (!providerContext || input.forceDirectTranscriptRecall === true)
  );

  if (shouldDirectRecall) {
    try {
      transcriptRecall = rt.recallTranscripts(query, input && input.recallOptions ? input.recallOptions : {});
      transcriptContext = transcriptRecall.block || '';
      if (Array.isArray(transcriptRecall.diagnostics)) {
        diagnostics.push(...transcriptRecall.diagnostics.map((msg) => `recallTranscripts: ${msg}`));
      }
    } catch (err) {
      diagnostics.push(`recallTranscripts failed: ${err.message}`);
    }
  }

  return {
    turnNumber,
    userMessage,
    query,
    providerContext,
    transcriptRecall,
    additionalContext: _joinNonEmpty([providerContext, transcriptContext]),
    diagnostics,
  };
}

function ensureLocalProvider(rt = runtime, providerOptions = {}) {
  const registry = rt.getProviderRegistry();
  const providerName = 'local-transcript';

  if (registry.hasProvider(providerName)) {
    return {
      attempted: true,
      registered: false,
      providerName,
    };
  }

  const provider = new rt.localProvider.LocalMemoryProvider(providerOptions);
  const registered = registry.addProvider(provider);

  return {
    attempted: true,
    registered,
    providerName,
  };
}

function _normalizeToolchain(value) {
  if (typeof value !== 'string' || !value.trim()) return 'unknown';
  return value.trim();
}

function _normalizeProjectDir(input) {
  if (input && typeof input.projectDir === 'string' && input.projectDir.trim()) {
    return input.projectDir.trim();
  }
  if (input && typeof input.cwd === 'string' && input.cwd.trim()) {
    return input.cwd.trim();
  }
  return process.cwd();
}

function _normalizeTurnNumber(value) {
  if (Number.isInteger(value) && value > 0) return value;
  return 1;
}

function _normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === 'string' && entry.trim());
}

function _joinNonEmpty(parts) {
  return parts.filter(Boolean).join('\n\n');
}

function _requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

module.exports = {
  bootstrapSession,
  prepareTurn,
  ensureLocalProvider,
};
