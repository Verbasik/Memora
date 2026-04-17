#!/usr/bin/env node
'use strict';

/**
 * .qwen/hooks/user-prompt-submit.js — Qwen Code UserPromptSubmit hook entrypoint
 *
 * Thin entrypoint: reads stdin JSON, delegates to bridge adapter,
 * writes hookSpecificOutput JSON to stdout (or nothing if no recall).
 *
 * FR-302: Pre-turn recall через UserPromptSubmit.
 */

const { handleUserPromptSubmit } = require('../../lib/runtime/bridge/qwen');
const { log, debug }             = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload  = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output   = handleUserPromptSubmit(payload);

  const chars = output && output.hookSpecificOutput
    ? (output.hookSpecificOutput.additionalContext || '').length
    : 0;

  if (chars > 0) {
    log('UserPromptSubmit', `qwen recall=${chars}chars injected`);
  } else {
    debug('UserPromptSubmit', 'qwen recall empty — no history yet');
  }

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
