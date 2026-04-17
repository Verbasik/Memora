#!/usr/bin/env node
'use strict';

const { handleUserPromptSubmit } = require('../../lib/runtime/bridge/claude');

const VERBOSE = process.env.MEMORA_VERBOSE === '1';
function _log(hook, msg) { process.stderr.write(`[memora:${hook}] ${msg}\n`); }

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output = handleUserPromptSubmit(payload);

  const chars = output && output.hookSpecificOutput
    ? (output.hookSpecificOutput.additionalContext || '').length
    : 0;

  if (chars > 0) {
    _log('UserPromptSubmit', `recall=${chars}chars injected`);
  } else if (VERBOSE) {
    _log('UserPromptSubmit', 'recall empty — no history yet');
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
