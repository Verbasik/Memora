'use strict';

/**
 * lib/runtime/bridge/codex.js — Codex CLI hook adapters
 *
 * Codex hooks run as one-shot child processes (same isolation model as Claude).
 * Key differences from Claude adapter:
 *   - SessionStart output uses `additional_context` (snake_case), not hookSpecificOutput
 *   - UserPromptSubmit uses plain stdout text, not JSON (JSON is invalid output for this hook)
 *   - PreToolUse/PostToolUse are shell/Bash-oriented; not a universal write gate
 *   - Stop is a turn-level checkpoint, not a guaranteed true session close
 *
 * Source contracts confirmed from openai/codex source files:
 *   session_start.rs, user_prompt_submit.rs, pre_tool_use.rs, stop.rs
 */

const fs = require('fs');
const path = require('path');

const bridge = require('./');

const DEFAULT_STARTUP_FILES = [
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
];

function handleSessionStart(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || bridge;
  const projectDir = _resolveProjectDir(payload);
  const startupFiles = _resolveExistingFiles(projectDir, DEFAULT_STARTUP_FILES);

  const result = runtimeBridge.bootstrapSession({
    sessionId: _requireString(payload.session_id, 'session_id'),
    toolchain: 'codex',
    projectDir,
    title: `Codex CLI (${payload.model || 'unknown-model'})`,
    contextFiles: startupFiles,
    snapshotSources: startupFiles,
    registerLocalProvider: false,
    initializeProviders: false,
    openTranscriptSession: true,
  }, {
    runtime: deps.runtime,
  });

  return {
    result,
    output: _buildSessionStartOutput(result.additionalContext),
  };
}

function _resolveProjectDir(payload) {
  const candidates = [
    payload.cwd,
    process.env.CODEX_PROJECT_DIR,
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

function _buildSessionStartOutput(additionalContext) {
  if (typeof additionalContext !== 'string' || !additionalContext.trim()) {
    return null;
  }

  // Codex SessionStart output format: { additional_context: "..." }
  // (snake_case, not hookSpecificOutput — confirmed from Codex source contracts)
  return { additional_context: additionalContext };
}

function handleUserPromptSubmit(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || bridge;

  const result = runtimeBridge.prepareTurn({
    turnNumber: 1,
    userMessage: payload.prompt || '',
    recallQuery: payload.prompt || '',
    useProviderPrefetch: true,
    useDirectTranscriptRecall: true,
    prefetchOptions: { source: 'codex' },
    recallOptions: { source: 'codex', maxSessions: 3 },
  }, deps);

  // Codex UserPromptSubmit output: plain text stdout, not JSON.
  // JSON on stdout is considered invalid output for this hook event.
  // Source: user_prompt_submit.rs in openai/codex.
  return result.additionalContext || null;
}

// Bash commands that Memora blocks at the Codex PreToolUse level.
// This is a shell-oriented guard — NOT a universal canonical-file write gate.
// For canonical memory writes, use writeCanonicalFile() explicitly.
const BLOCKED_BASH_PATTERNS = [
  /^git push\b/,
];

function handlePreToolUse(payload = {}) {
  const command = (payload.tool_input && payload.tool_input.command) || '';

  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return {
        blocked: true,
        reason: `Memora blocked Codex Bash command: ${command.split('\n')[0].slice(0, 80)}`,
      };
    }
  }

  return null;
}

// Explicit write helper for canonical memory files.
// Codex PreToolUse/PostToolUse hooks are Bash-oriented and cannot serve as
// a universal file-write gate. Callers that need screening must call this
// function directly before writing to any canonical memory path.
function writeCanonicalFile(filePath, content, deps = {}) {
  const rt = deps.runtime || require('..');

  const check = rt.checkMemoryWrite(content);
  if (!check.allowed) {
    throw new Error(`Memora blocked write (${check.patternId || 'unknown_pattern'})`);
  }

  const fsModule = deps.fs || fs;
  const pathModule = deps.path || path;

  fsModule.mkdirSync(pathModule.dirname(filePath), { recursive: true });
  fsModule.writeFileSync(filePath, content, 'utf8');
  rt.onMemoryWrite('replace', filePath, content);
}

// Codex Stop fires at the end of each turn — it is a checkpoint, NOT a true
// session close. There is no native SessionEnd in Codex CLI (see FR-205).
// Guard against stop_hook_active to avoid recursive hook invocation.
function handleStop(payload = {}) {
  if (payload.stop_hook_active) return null;
  return null;
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
  handleStop,
  writeCanonicalFile,
};
