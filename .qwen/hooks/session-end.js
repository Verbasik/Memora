#!/usr/bin/env node
'use strict';

/**
 * .qwen/hooks/session-end.js — Qwen Code SessionEnd hook entrypoint
 *
 * Thin entrypoint: reads stdin JSON, delegates to bridge adapter for
 * true session finalization (onSessionEnd + shutdownAll).
 *
 * Unlike Codex (no native SessionEnd), Qwen provides this event,
 * enabling full runtime teardown at session close.
 *
 * FR-303: Finalization через SessionEnd.
 */

const { handleSessionEnd } = require('../../lib/runtime/bridge/qwen');
const { log }              = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload  = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output   = handleSessionEnd(payload);

  log('SessionEnd', `qwen session=${payload.session_id || 'unknown'} reason=${payload.reason || 'unknown'} finalized`);

  if (output) {
    process.stdout.write(JSON.stringify(output) + '\n');
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
