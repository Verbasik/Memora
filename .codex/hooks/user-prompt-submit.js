#!/usr/bin/env node
'use strict';

/**
 * .codex/hooks/user-prompt-submit.js — Codex UserPromptSubmit hook entrypoint
 *
 * Codex always displays hook stdout as "hook context:" in the terminal UI.
 * To avoid polluting the console with a wall of recalled text, this hook stages
 * the full recall context to a file (ACTIVE_RECALL.md) and emits only a brief
 * one-line reference on stdout.
 *
 * The model reads ACTIVE_RECALL.md autonomously when the brief reference signals
 * that relevant past-session content is available.
 *
 * Fallback: if the file write fails, the full context is emitted inline (original
 * behavior) so the recall still reaches the model.
 */

const path = require('path');
const fs   = require('fs');

const { handleUserPromptSubmit } = require('../../lib/runtime/bridge/codex');
const { log, debug } = require('../../lib/runtime/hook-logger');

/** Path relative to projectDir where the staged recall is written. */
const RECALL_FILE = 'memory-bank/.local/ACTIVE_RECALL.md';

async function main() {
  const rawInput    = await _readStdin();
  const payload     = rawInput.trim() ? JSON.parse(rawInput) : {};
  const fullContext = handleUserPromptSubmit(payload);

  if (!fullContext) {
    debug('UserPromptSubmit', 'recall empty — no history yet');
    return; // nothing written to stdout → Codex shows no hook context
  }

  // Stage full context to a file; return only a brief reference on stdout.
  const projectDir = path.resolve((payload && payload.cwd) || process.cwd());
  const recallPath = path.join(projectDir, RECALL_FILE);

  try {
    fs.mkdirSync(path.dirname(recallPath), { recursive: true });
    fs.writeFileSync(recallPath, fullContext, 'utf8');
  } catch (err) {
    // File write failed — fall back to inline injection (original behaviour).
    log('UserPromptSubmit', `staging failed (${err.message}), falling back to inline`);
    process.stdout.write(fullContext + '\n');
    return;
  }

  const sessions = (fullContext.match(/^--- Session:/gm) || []).length;
  log('UserPromptSubmit', `recall=${fullContext.length}chars staged → ${RECALL_FILE}`);

  // Brief one-liner: shown in terminal AND injected as minimal context for the model.
  const noun  = sessions === 1 ? 'session' : 'sessions';
  const brief = `[Memora Recall] ${sessions} ${noun} matched — read \`${RECALL_FILE}\` for context.`;

  process.stdout.write(brief + '\n');
}

function _readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
