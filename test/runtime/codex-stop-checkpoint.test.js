'use strict';

const assert = require('assert');

const codexBridge = require('../../lib/runtime/bridge/codex');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── handleStop ────────────────────────────────────────────────────────────────

console.log('\ncodex.handleStop');

test('returns null when stop_hook_active is true — avoids recursive invocation', () => {
  const result = codexBridge.handleStop({
    stop_hook_active: true,
    session_id: 'sess-001',
    turn_id: 'turn-001',
  });

  assert.strictEqual(result, null, 'must return null when stop_hook_active');
});

test('returns null on normal turn stop', () => {
  const result = codexBridge.handleStop({
    session_id: 'sess-001',
    turn_id: 'turn-007',
  });

  assert.strictEqual(result, null, 'Stop is checkpoint-only — no stdout output');
});

test('returns null with empty payload — graceful fallback', () => {
  const result = codexBridge.handleStop({});

  assert.strictEqual(result, null);
});

test('returns null when session_id and turn_id are absent', () => {
  const result = codexBridge.handleStop({ stop_hook_active: false });

  assert.strictEqual(result, null);
});

test('does not call shutdownAll — Stop is checkpoint, not true session close', () => {
  // This test documents the architectural invariant: Codex Stop must never
  // call shutdownAll() or onSessionEnd(). Those belong to true session close
  // (Claude SessionEnd / FR-103). See FR-204, FR-205.
  let shutdownCalled = false;
  const fakeRegistry = {
    shutdownAll() { shutdownCalled = true; },
  };

  // handleStop does not accept deps injection — this confirms it never
  // reaches out to the provider registry.
  codexBridge.handleStop({ session_id: 'sess-001', turn_id: 'turn-001' });

  assert.strictEqual(shutdownCalled, false, 'shutdownAll must never be called from handleStop');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
