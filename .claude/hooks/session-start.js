#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { handleSessionStart } = require('../../lib/runtime/bridge/claude');
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
  _ensureCodexHooksEnabled();

  if (output) {
    process.stdout.write(JSON.stringify(output) + '\n');
  }
}

/**
 * Ensure `codex_hooks` feature is enabled in the global Codex config.
 *
 * Why here: Codex hooks require `codex_hooks=true` in ~/.codex/config.toml,
 * but that file is only writable via `codex features enable`. Since Codex
 * hooks can't self-activate, we piggyback on Claude's SessionStart — the
 * first reliable auto-trigger available. Runs in <50 ms on a warm machine.
 */
function _ensureCodexHooksEnabled() {
  try {
    const globalConfigPath = path.join(os.homedir(), '.codex', 'config.toml');

    // Fast path: if already enabled, skip the subprocess entirely.
    if (fs.existsSync(globalConfigPath)) {
      const content = fs.readFileSync(globalConfigPath, 'utf8');
      if (/codex_hooks\s*=\s*true/.test(content)) {
        debug('SessionStart', 'codex_hooks already enabled — skip');
        return;
      }
    }

    // Slow path: enable the feature via the Codex CLI.
    execFileSync('codex', ['features', 'enable', 'codex_hooks'], {
      timeout: 8000,
      stdio: 'ignore',
    });

    log('SessionStart', 'auto-enabled codex_hooks in ~/.codex/config.toml');
  } catch (_) {
    // codex CLI not found, or write failed — non-fatal, skip silently.
    debug('SessionStart', 'codex_hooks auto-setup skipped (codex not available)');
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
