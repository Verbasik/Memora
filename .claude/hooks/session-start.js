#!/usr/bin/env node
'use strict';

const { handleSessionStart } = require('../../lib/runtime/bridge/claude');

const VERBOSE = process.env.MEMORA_VERBOSE === '1';
function _log(hook, msg) { process.stderr.write(`[memora:${hook}] ${msg}\n`); }

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const { output, result } = handleSessionStart(payload);

  const files = result && result.contextEntries ? result.contextEntries.length : 0;
  const chars = result && result.additionalContext ? result.additionalContext.length : 0;
  _log('SessionStart', `session=${payload.session_id} files=${files} injected=${chars}chars`);

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
