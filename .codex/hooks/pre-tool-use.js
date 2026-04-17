#!/usr/bin/env node
'use strict';

const { handlePreToolUse } = require('../../lib/runtime/bridge/codex');

const VERBOSE = process.env.MEMORA_VERBOSE === '1';
function _log(hook, msg) { process.stderr.write(`[memora:${hook}] ${msg}\n`); }

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const result = handlePreToolUse(payload);

  if (result && result.blocked) {
    // Always log blocks
    _log('PreToolUse', `✗ BLOCKED Bash — ${result.reason}`);
    process.exit(2);
  } else if (VERBOSE) {
    const cmd = ((payload.tool_input && payload.tool_input.command) || '').slice(0, 60);
    if (cmd) _log('PreToolUse', `✓ allowed Bash: ${cmd}`);
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
