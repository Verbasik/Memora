#!/usr/bin/env node
'use strict';

const { handleUserPromptSubmit } = require('../../lib/runtime/bridge/codex');
const { log, debug } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const text = handleUserPromptSubmit(payload);

  const chars = text ? text.length : 0;
  if (chars > 0) {
    log('UserPromptSubmit', `recall=${chars}chars injected`);
  } else {
    debug('UserPromptSubmit', 'recall empty — no history yet');
  }

  // Codex UserPromptSubmit expects plain text on stdout, not JSON.
  if (text) {
    process.stdout.write(text + '\n');
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
