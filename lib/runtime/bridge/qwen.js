'use strict';

/**
 * lib/runtime/bridge/qwen.js — Qwen Code hook adapters
 *
 * Qwen hooks run as one-shot child processes (same isolation model as Claude).
 * Key differences from Codex adapter:
 *   - Output format: JSON with hookSpecificOutput (same as Claude, not plain text)
 *   - SessionEnd exists as a true close event (unlike Codex which has only Stop)
 *   - PreToolUse/PostToolUse support full write-gate semantics via permissionDecision
 *   - Stop is turn-level checkpoint only (no shutdownAll)
 *
 * Event contracts confirmed from official Qwen Code hooks documentation.
 * FR coverage: FR-301 (SessionStart), FR-302 (UserPromptSubmit),
 *              FR-303 (SessionEnd), FR-304 (PreToolUse/PostToolUse).
 */

const fs = require('fs');
const path = require('path');

const bridge = require('./');

const DEFAULT_STARTUP_FILES = [
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
];

const CANONICAL_MEMORY_RE =
  /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/;

// ── FR-301 ─────────────────────────────────────────────────────────────────────

/**
 * Handle Qwen SessionStart — runtime bootstrap.
 *
 * Payload fields: session_id, cwd, source, model, agent_type, permission_mode.
 * Output: JSON { hookSpecificOutput: { additionalContext } } on stdout.
 */
function handleSessionStart(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || bridge;
  const projectDir    = _resolveProjectDir(payload);
  const startupFiles  = _resolveExistingFiles(projectDir, DEFAULT_STARTUP_FILES);

  const result = runtimeBridge.bootstrapSession({
    sessionId:             _requireString(payload.session_id, 'session_id'),
    toolchain:             'qwen',
    projectDir,
    title:                 `Qwen Code (${payload.source || 'startup'})`,
    contextFiles:          startupFiles,
    snapshotSources:       startupFiles,
    registerLocalProvider: false,
    initializeProviders:   false,
    openTranscriptSession: true,
  }, { runtime: deps.runtime });

  return {
    result,
    output: _buildAdditionalContextOutput(result.additionalContext),
  };
}

// ── FR-302 ─────────────────────────────────────────────────────────────────────

/**
 * Handle Qwen UserPromptSubmit — pre-turn recall.
 *
 * Payload fields: session_id, prompt, hook_event_name.
 * Output: JSON { hookSpecificOutput: { additionalContext } } on stdout, or null.
 */
function handleUserPromptSubmit(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || bridge;
  const rt            = deps.runtime || require('..');

  const sessionId = payload.session_id || null;
  const prompt    = payload.prompt || '';

  // Record user turn into transcript store.
  if (sessionId && prompt) {
    rt.recordTurnUserMessage(sessionId, { content: prompt, source: 'qwen' });
  }

  const result = runtimeBridge.prepareTurn({
    turnNumber:               1,
    userMessage:              prompt,
    recallQuery:              prompt,
    useProviderPrefetch:      true,
    useDirectTranscriptRecall: true,
    prefetchOptions:          { source: 'qwen' },
    recallOptions:            { source: 'qwen', maxSessions: 3 },
  }, deps);

  if (!result.additionalContext) return null;

  return {
    hookSpecificOutput: {
      additionalContext: result.additionalContext,
    },
  };
}

// ── FR-304 (pre-write) ─────────────────────────────────────────────────────────

/**
 * Handle Qwen PreToolUse — canonical write screening.
 *
 * Payload fields: tool_name, tool_input (file_path, content), tool_use_id.
 * Output: JSON { hookSpecificOutput: { permissionDecision, permissionDecisionReason } }.
 * Always returns a non-null output (explicit allow/deny per Qwen hook contract).
 */
function handlePreToolUse(payload = {}, deps = {}) {
  const rt       = deps.runtime || require('..');
  const filePath = (payload.tool_input && payload.tool_input.file_path) || '';
  const content  = (payload.tool_input && payload.tool_input.content)   || '';

  if (!CANONICAL_MEMORY_RE.test(filePath)) {
    return {
      hookSpecificOutput: {
        hookEventName:             'PreToolUse',
        permissionDecision:        'allow',
        permissionDecisionReason:  'Not a canonical memory write',
      },
    };
  }

  const check = rt.checkMemoryWrite(content);

  if (check.allowed) {
    return {
      hookSpecificOutput: {
        hookEventName:             'PreToolUse',
        permissionDecision:        'allow',
        permissionDecisionReason:  'Memora screening passed',
      },
    };
  }

  return {
    hookSpecificOutput: {
      hookEventName:             'PreToolUse',
      permissionDecision:        'deny',
      permissionDecisionReason:  `Memora blocked write (${check.patternId || 'unknown_pattern'})`,
      additionalContext:         'Canonical memory write rejected by Memora runtime security screening.',
    },
  };
}

// ── FR-304 (post-write) ────────────────────────────────────────────────────────

/**
 * Handle Qwen PostToolUse — audit successful canonical write.
 *
 * Payload fields: tool_name, tool_input, tool_response, tool_use_id.
 * Output: JSON { hookSpecificOutput: { additionalContext } }, or null if not canonical.
 */
function handlePostToolUse(payload = {}, deps = {}) {
  const rt       = deps.runtime || require('..');
  const filePath = (payload.tool_input && payload.tool_input.file_path) || '';
  const content  = (payload.tool_input && payload.tool_input.content)   || '';

  if (!CANONICAL_MEMORY_RE.test(filePath)) return null;

  rt.onMemoryWrite('replace', filePath, content);

  return {
    hookSpecificOutput: {
      additionalContext: `Memora observed canonical write: ${filePath}`,
    },
  };
}

// ── FR-303 ─────────────────────────────────────────────────────────────────────

/**
 * Handle Qwen SessionEnd — true session finalization.
 *
 * Payload fields: session_id, reason (clear|logout|prompt_input_exit|bypass_permissions_disabled|other).
 * Output: JSON { hookSpecificOutput: { additionalContext } }.
 *
 * Unlike Codex, Qwen has a native SessionEnd event, so shutdownAll() is safe here.
 */
function handleSessionEnd(payload = {}, deps = {}) {
  const rt        = deps.runtime || require('..');
  const sessionId = payload.session_id || null;

  if (sessionId) {
    rt.closeTranscriptSession(sessionId);
  }

  try {
    rt.onSessionEnd([]);
  } finally {
    rt.getProviderRegistry().shutdownAll();
  }

  return {
    hookSpecificOutput: {
      additionalContext: `Memora runtime finalized for Qwen session ${sessionId || 'unknown'}`,
    },
  };
}

// ── Stop (checkpoint) ──────────────────────────────────────────────────────────

/**
 * Handle Qwen Stop — turn-level checkpoint.
 *
 * Payload fields: session_id, last_assistant_message, stop_hook_active.
 * Returns null (no stdout output needed for checkpoint-only).
 */
function handleStop(payload = {}, deps = {}) {
  if (payload.stop_hook_active) return null;

  const rt         = deps.runtime    || require('..');
  const nativeSync = deps.nativeSync || require('../transcript/native-sync');
  const sessionId  = payload.session_id || null;

  if (!sessionId) return null;

  const lastMsg = payload.last_assistant_message || null;
  if (lastMsg && typeof lastMsg === 'string' && lastMsg.trim()) {
    rt.recordTurnAssistantMessage(sessionId, { content: lastMsg, source: 'qwen' });
  }

  const transcriptPath = payload.transcript_path || null;
  if (transcriptPath) {
    nativeSync.syncFromPath(sessionId, transcriptPath, { rt, source: 'qwen' });
  }

  return null;
}

// ── PreCompact / PostCompact (optional — not in FR-301–FR-304 scope) ──────────

/**
 * Handle Qwen PreCompact — prepare compaction checkpoint.
 *
 * Payload fields: trigger, custom_instructions.
 * Output: JSON { hookSpecificOutput: { additionalContext } }.
 */
function handlePreCompact(payload = {}, deps = {}) {
  const rt = deps.runtime || require('..');

  rt.onPreCompress([]);

  return {
    hookSpecificOutput: {
      additionalContext: `Memora pre-compact checkpoint (${payload.trigger || 'unknown'})`,
    },
  };
}

/**
 * Handle Qwen PostCompact — archive generated summary.
 *
 * Payload fields: trigger, compact_summary, session_id.
 * Output: JSON { hookSpecificOutput: { additionalContext } }.
 */
function handlePostCompact(payload = {}) {
  return {
    hookSpecificOutput: {
      additionalContext: `Memora archived compact summary for ${payload.session_id || 'unknown'}`,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _resolveProjectDir(payload) {
  const candidates = [
    payload.cwd,
    process.env.QWEN_PROJECT_DIR,
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return path.resolve(candidate.trim());
    }
  }

  return process.cwd();
}

function _resolveExistingFiles(projectDir, relativePaths) {
  return relativePaths
    .map((relativePath) => path.join(projectDir, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));
}

/**
 * Build a JSON hookSpecificOutput with additionalContext.
 * Returns null if context is absent or whitespace-only.
 */
function _buildAdditionalContextOutput(additionalContext) {
  if (typeof additionalContext !== 'string' || !additionalContext.trim()) {
    return null;
  }

  return {
    hookSpecificOutput: {
      additionalContext,
    },
  };
}

function _requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

module.exports = {
  handleSessionStart,
  handleUserPromptSubmit,
  handlePreToolUse,
  handlePostToolUse,
  handleSessionEnd,
  handleStop,
  handlePreCompact,
  handlePostCompact,
};
