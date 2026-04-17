#!/usr/bin/env node
'use strict';

const { handlePreToolUse } = require('../../lib/runtime/bridge/codex');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const result = handlePreToolUse(payload);

  if (result && result.blocked) {
    process.stderr.write(`[memora-runtime] ${result.reason}\n`);
    process.exit(2);
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
