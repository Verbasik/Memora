#!/usr/bin/env node
'use strict';

const { handleSessionStart } = require('../../lib/runtime/bridge/claude');
const { ensureCodexHooksEnabled } = require('../../lib/runtime/bridge/codex');
const { log, debug } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const { output, result } = handleSessionStart(payload);

  const files = result && result.contextEntries ? result.contextEntries.length : 0;
  const chars = result && result.additionalContext ? result.additionalContext.length : 0;
  log('SessionStart', `session=${payload.session_id} files=${files} injected=${chars}chars`);

  // Auto-configure Codex hooks on this machine if not yet enabled.
  // Runs once (idempotent): reads ~/.codex/config.toml, only calls
  // `codex features enable codex_hooks` when the flag is missing/false.
  const codexSetup = ensureCodexHooksEnabled();
  if (codexSetup.status === 'enabled') {
    log('SessionStart', 'auto-enabled codex_hooks in ~/.codex/config.toml');
  } else if (codexSetup.status === 'already') {
    debug('SessionStart', 'codex_hooks already enabled — skip');
  } else {
    debug('SessionStart', `codex_hooks auto-setup skipped (${codexSetup.reason || codexSetup.status})`);
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
