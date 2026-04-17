#!/usr/bin/env node
'use strict';

const { handlePreToolUse } = require('../../lib/runtime/bridge/codex');
const { log, debug } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const result = handlePreToolUse(payload);

  if (result && result.blocked) {
    log('PreToolUse', `✗ BLOCKED Bash — ${result.reason}`);
    process.exit(2);
  } else {
    const cmd = ((payload.tool_input && payload.tool_input.command) || '').slice(0, 60);
    if (cmd) debug('PreToolUse', `✓ allowed Bash: ${cmd}`);
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
