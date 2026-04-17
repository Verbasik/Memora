#!/usr/bin/env node
'use strict';

/**
 * .qwen/hooks/session-start.js — Qwen Code SessionStart hook entrypoint
 *
 * Thin entrypoint: reads stdin JSON, delegates to bridge adapter,
 * writes hookSpecificOutput JSON to stdout (or nothing if no context).
 *
 * FR-301: Native bootstrap через SessionStart.
 */

const { handleSessionStart } = require('../../lib/runtime/bridge/qwen');
const { log, debug }         = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload  = rawInput.trim() ? JSON.parse(rawInput) : {};

  const { output, result } = handleSessionStart(payload);

  const files = result && result.contextEntries ? result.contextEntries.length : 0;
  const chars = result && result.additionalContext ? result.additionalContext.length : 0;
  log('SessionStart', `qwen session=${payload.session_id} files=${files} injected=${chars}chars`);

  if (output) {
    process.stdout.write(JSON.stringify(output) + '\n');
  } else {
    debug('SessionStart', 'no startup context — skipping additionalContext injection');
  }
}

function _readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data',  (chunk) => { data += chunk; });
    process.stdin.on('end',   () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
