#!/usr/bin/env node
'use strict';

const path = require('path');
const fs   = require('fs');

const { handleSessionStart } = require('../../lib/runtime/bridge/codex');
const { log, debug } = require('../../lib/runtime/hook-logger');

/**
 * Codex always renders SessionStart stdout as "hook context:" in the TUI.
 * Stage the full bootstrap context to a file and emit only a short reference
 * so the session does not begin with a terminal-sized wall of text.
 */
const BOOTSTRAP_FILE = 'memory-bank/.local/ACTIVE_BOOTSTRAP.md';

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const { output, result } = handleSessionStart(payload);

  const files = result && result.contextEntries ? result.contextEntries.length : 0;
  if (!output) {
    debug('SessionStart', `session=${payload.session_id || 'unknown'} files=${files} injected=0chars`);
    return;
  }

  const projectDir = path.resolve((payload && payload.cwd) || process.cwd());
  const bootstrapPath = path.join(projectDir, BOOTSTRAP_FILE);

  try {
    fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
    fs.writeFileSync(bootstrapPath, output, 'utf8');
  } catch (err) {
    log('SessionStart', `session=${payload.session_id} files=${files} staging failed (${err.message}), falling back to inline`);
    process.stdout.write(output + '\n');
    return;
  }

  log('SessionStart', `session=${payload.session_id} files=${files} staged=${output.length}chars → ${BOOTSTRAP_FILE}`);

  // Do NOT start stdout with '[' or '{' — Codex may attempt JSON parsing.
  const brief =
    `Memora bootstrap: startup context ready — see \`${BOOTSTRAP_FILE}\` if project state is relevant.`;

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
