#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { ensureCodexHooksEnabled } = require('../../lib/runtime/bridge/codex');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    process.stdout.write(`  ✓ ${message}\n`);
    passed++;
  } else {
    process.stderr.write(`  ✗ ${message}\n`);
    failed++;
  }
}

function makeTmpConfig(content) {
  const dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-test-'));
  const file = path.join(dir, 'config.toml');
  if (content !== null) fs.writeFileSync(file, content, 'utf8');
  return { dir, file };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFs(content) {
  // Returns a minimal fake fs that returns `content` for any path.
  return {
    existsSync: () => content !== null,
    readFileSync: () => content,
  };
}

function execOk()    { /* no-op — success */  }
function execFail()  { throw new Error('codex: command not found'); }

// ── Tests ──────────────────────────────────────────────────────────────────────

process.stdout.write('\nensureCodexHooksEnabled\n');

// 1. already enabled → status: 'already', exec never called
{
  let execCalled = false;
  const result = ensureCodexHooksEnabled({
    fsModule:   makeFs('[features]\ncodex_hooks = true\n'),
    execFn:     () => { execCalled = true; },
    configPath: '/fake/config.toml',
  });
  assert(result.status === 'already',  'returns "already" when flag is true');
  assert(!execCalled,                  'does not call exec when already enabled');
}

// 2. flag missing → calls exec, returns 'enabled'
{
  let execArgs = null;
  const result = ensureCodexHooksEnabled({
    fsModule:   makeFs('[project]\nsandbox = "workspace-write"\n'),
    execFn:     (cmd, args) => { execArgs = [cmd, ...args]; },
    configPath: '/fake/config.toml',
  });
  assert(result.status === 'enabled',                            'returns "enabled" when flag was missing');
  assert(Array.isArray(execArgs) && execArgs[0] === 'codex',    'calls codex CLI');
  assert(execArgs[1] === 'features' && execArgs[2] === 'enable','calls features enable');
  assert(execArgs[3] === 'codex_hooks',                         'enables codex_hooks flag');
}

// 3. config file absent → calls exec, returns 'enabled'
{
  let execCalled = false;
  const result = ensureCodexHooksEnabled({
    fsModule:   makeFs(null),  // existsSync → false
    execFn:     () => { execCalled = true; },
    configPath: '/fake/config.toml',
  });
  assert(result.status === 'enabled', 'returns "enabled" when config file absent');
  assert(execCalled,                  'calls exec when config file absent');
}

// 4. exec throws (codex not installed) → returns 'unavailable', non-fatal
{
  const result = ensureCodexHooksEnabled({
    fsModule:   makeFs(null),
    execFn:     execFail,
    configPath: '/fake/config.toml',
  });
  assert(result.status === 'unavailable',              'returns "unavailable" when exec fails');
  assert(typeof result.reason === 'string',            'includes reason string');
  assert(result.reason.includes('command not found'),  'reason contains error message');
}

// 5. flag set to false explicitly → calls exec (should re-enable)
{
  let execCalled = false;
  const result = ensureCodexHooksEnabled({
    fsModule:   makeFs('[features]\ncodex_hooks = false\n'),
    execFn:     () => { execCalled = true; },
    configPath: '/fake/config.toml',
  });
  assert(result.status === 'enabled', 'enables when flag is explicitly false');
  assert(execCalled,                  'calls exec when flag is false');
}

// 6. real tmp file — integration with actual fs (no real codex call)
{
  const { dir, file } = makeTmpConfig('[project]\nsandbox = "workspace-write"\n');
  let execCalled = false;
  const result = ensureCodexHooksEnabled({
    execFn:     () => { execCalled = true; },
    configPath: file,
  });
  cleanup(dir);
  assert(result.status === 'enabled', 'works with real tmp file on disk');
  assert(execCalled,                  'calls exec for real file without flag');
}

// 7. idempotency — second call with flag already present
{
  const { dir, file } = makeTmpConfig('[features]\ncodex_hooks = true\n');
  let execCalled = false;
  const result = ensureCodexHooksEnabled({
    execFn:     () => { execCalled = true; },
    configPath: file,
  });
  cleanup(dir);
  assert(result.status === 'already', 'idempotent: already enabled in real file');
  assert(!execCalled,                 'does not call exec on second run');
}

// ── Summary ───────────────────────────────────────────────────────────────────
process.stdout.write(`\nPassed: ${passed}\nFailed: ${failed}\n`);
if (failed > 0) process.exit(1);
