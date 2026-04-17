#!/usr/bin/env node
'use strict';

/**
 * .qwen/hooks/pre-tool-use.js — Qwen Code PreToolUse hook entrypoint
 *
 * Thin entrypoint: reads stdin JSON, delegates to bridge adapter,
 * writes hookSpecificOutput JSON with permissionDecision to stdout.
 *
 * Unlike Claude (which returns null for non-canonical paths), this handler
 * always returns an explicit permissionDecision per Qwen hook contract.
 *
 * FR-304: Write interception через PreToolUse.
 */

const { handlePreToolUse } = require('../../lib/runtime/bridge/qwen');
const { log, debug }       = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload  = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output   = handlePreToolUse(payload);

  const fp      = (payload.tool_input && payload.tool_input.file_path) || '';
  const decision = output && output.hookSpecificOutput
    ? output.hookSpecificOutput.permissionDecision
    : 'allow';

  if (decision === 'deny') {
    log('PreToolUse', `qwen ✗ BLOCKED write — ${output.hookSpecificOutput.permissionDecisionReason} (${fp})`);
  } else if (/memory-bank\//.test(fp)) {
    debug('PreToolUse', `qwen ✓ allowed write — ${fp}`);
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
