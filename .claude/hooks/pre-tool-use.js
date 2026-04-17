#!/usr/bin/env node
'use strict';

const { handlePreToolUse } = require('../../lib/runtime/bridge/claude');

const VERBOSE = process.env.MEMORA_VERBOSE === '1';
function _log(hook, msg) { process.stderr.write(`[memora:${hook}] ${msg}\n`); }

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output = handlePreToolUse(payload);

  const fp = (payload.tool_input && payload.tool_input.file_path) || '';

  if (output && output.hookSpecificOutput) {
    // Always log blocks — this is the most important signal
    _log('PreToolUse', `✗ BLOCKED write — ${output.hookSpecificOutput.permissionDecisionReason} (${fp})`);
  } else if (VERBOSE && /memory-bank\//.test(fp)) {
    _log('PreToolUse', `✓ allowed write — ${fp}`);
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
