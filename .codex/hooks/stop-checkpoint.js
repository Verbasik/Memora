#!/usr/bin/env node
'use strict';

const { handleStop } = require('../../lib/runtime/bridge/codex');

const VERBOSE = process.env.MEMORA_VERBOSE === '1';
function _log(hook, msg) { process.stderr.write(`[memora:${hook}] ${msg}\n`); }

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};

  if (payload.stop_hook_active) {
    if (VERBOSE) _log('Stop', 'guard — stop_hook_active, skipping checkpoint');
    return;
  }

  handleStop(payload);
  _log('Stop', `checkpoint — session=${payload.session_id || 'unknown'} turn=${payload.turn_id || 'unknown'}`);
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
