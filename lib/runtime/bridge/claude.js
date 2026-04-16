'use strict';

/**
 * lib/runtime/bridge/claude.js — Claude Code hook adapters
 *
 * Claude hooks run as one-shot child processes, so in-memory runtime singletons
 * do not survive between hook invocations. The first integration slice therefore
 * focuses on file-backed operations that are still useful in an isolated process:
 *   - screen startup context files before injecting them into Claude
 *   - create a transcript session record in the local JSONL store
 *   - build a bootstrap snapshot for validation/diagnostics in-process
 *
 * Later lifecycle hooks (UserPromptSubmit, SessionEnd, write interception) can
 * reuse the same stateless pattern while broader runtime orchestration matures.
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
    toolchain: 'claude',
    projectDir,
    title: _buildSessionTitle(payload),
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
    process.env.CLAUDE_PROJECT_DIR,
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

  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };
}

function _buildSessionTitle(payload) {
  if (typeof payload.source === 'string' && payload.source.trim()) {
    return `Claude Code (${payload.source.trim()})`;
  }
  return 'Claude Code';
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
