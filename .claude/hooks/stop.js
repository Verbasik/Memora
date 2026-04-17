#!/usr/bin/env node
'use strict';

const { handleStop } = require('../../lib/runtime/bridge/claude');
const { log, debug } = require('../../lib/runtime/hook-logger');

async function main() {
  const rawInput = await _readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};

  if (payload.stop_hook_active) {
    debug('Stop', 'guard — stop_hook_active, skipping transcript sync');
    return;
  }

  handleStop(payload);

  const sid = payload.session_id || 'unknown';
  const hasTranscript = !!payload.transcript_path;
  log('Stop', `transcript sync — session=${sid} transcript=${hasTranscript}`);
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
