'use strict';

/**
 * test/runtime/claude-stop.test.js
 *
 * Unit tests for claude.handleStop().
 *
 * handleStop is the Stop hook adapter: it syncs the native transcript into
 * the Memora store via native-sync.syncFromPath when transcript_path is present.
 * It always returns null — the Stop hook injects no context into Claude.
 */

const assert = require('assert');

const claudeBridge = require('../../lib/runtime/bridge/claude');

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

function makeFakeNativeSync() {
  const calls = [];
  return {
    syncFromPath(sessionId, transcriptPath, opts) {
      calls.push({ sessionId, transcriptPath, opts });
      return { synced: 2, skipped: 0, diagnostics: 'ok' };
    },
    _calls: calls,
  };
}

// ── guard: stop_hook_active ──────────────────────────────────────────────────

console.log('\nclaude.handleStop');

test('returns null when stop_hook_active=true — avoids recursive invocation', () => {
  const sync = makeFakeNativeSync();
  const result = claudeBridge.handleStop(
    { stop_hook_active: true, session_id: 'sess-001', transcript_path: '/tmp/t.jsonl' },
    { nativeSync: sync }
  );
  assert.strictEqual(result, null);
  assert.strictEqual(sync._calls.length, 0, 'syncFromPath must not be called when stop_hook_active');
});

// ── guard: missing session_id ─────────────────────────────────────────────────

test('returns null and calls nothing when session_id is absent', () => {
  const sync = makeFakeNativeSync();
  const result = claudeBridge.handleStop(
    { transcript_path: '/tmp/t.jsonl' },
    { runtime: {}, nativeSync: sync }
  );
  assert.strictEqual(result, null);
  assert.strictEqual(sync._calls.length, 0);
});

// ── guard: missing transcript_path ───────────────────────────────────────────

test('does not call syncFromPath when transcript_path is absent', () => {
  const sync = makeFakeNativeSync();
  const result = claudeBridge.handleStop(
    { session_id: 'sess-001' },
    { runtime: {}, nativeSync: sync }
  );
  assert.strictEqual(result, null);
  assert.strictEqual(sync._calls.length, 0, 'no transcript_path → no sync');
});

// ── happy path ────────────────────────────────────────────────────────────────

test('calls syncFromPath with sessionId, transcriptPath, and rt when both present', () => {
  const sync   = makeFakeNativeSync();
  const fakeRt = {};

  const result = claudeBridge.handleStop(
    { session_id: 'sess-abc', transcript_path: '/tmp/claude-transcript.jsonl' },
    { runtime: fakeRt, nativeSync: sync }
  );

  assert.strictEqual(result, null);
  assert.strictEqual(sync._calls.length, 1);
  assert.strictEqual(sync._calls[0].sessionId, 'sess-abc');
  assert.strictEqual(sync._calls[0].transcriptPath, '/tmp/claude-transcript.jsonl');
  assert.strictEqual(sync._calls[0].opts.rt, fakeRt);
  assert.strictEqual(sync._calls[0].opts.source, 'claude');
});

test('always returns null — Stop does not inject context into Claude', () => {
  const sync = makeFakeNativeSync();
  const result = claudeBridge.handleStop(
    { session_id: 'sess-001', transcript_path: '/tmp/t.jsonl' },
    { runtime: {}, nativeSync: sync }
  );
  assert.strictEqual(result, null);
});

// ── edge cases ────────────────────────────────────────────────────────────────

test('handles empty payload without throwing', () => {
  assert.doesNotThrow(() => {
    claudeBridge.handleStop({});
  });
});

test('handles undefined payload without throwing', () => {
  assert.doesNotThrow(() => {
    claudeBridge.handleStop(undefined);
  });
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
