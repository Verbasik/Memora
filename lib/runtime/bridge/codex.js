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

function _requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

module.exports = {
  handleSessionStart,
};
