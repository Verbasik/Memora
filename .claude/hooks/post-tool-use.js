#!/usr/bin/env node
'use strict';

const { handlePostToolUse } = require('../../lib/runtime/bridge/claude');
const { log, debug } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output = handlePostToolUse(payload);

  const fp = (payload.tool_input && payload.tool_input.file_path) || '';

  if (output) {
    log('PostToolUse', `✓ canonical write observed: ${fp}`);
  } else if (fp) {
    debug('PostToolUse', `pass (non-canonical): ${fp}`);
  }

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
