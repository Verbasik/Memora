#!/usr/bin/env node
'use strict';

const { handleSessionEnd } = require('../../lib/runtime/bridge/claude');
const { log } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output = handleSessionEnd(payload);

  log('SessionEnd', `session=${payload.session_id || 'unknown'} reason=${payload.reason || 'unknown'} finalized`);

  if (output) {
    process.stdout.write(JSON.stringify(output) + '\n');
  }
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
