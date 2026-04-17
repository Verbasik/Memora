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

  // Inject a fake rt that would reveal shutdownAll being called if it were.
  const fakeRt = {
    recordTurnAssistantMessage() {},
    getProviderRegistry() {
      return {
        shutdownAll() { shutdownCalled = true; },
      };
    },
  };
  const fakeSyncNoop = { syncFromPath() { return { synced: 0, skipped: 0 }; } };

  codexBridge.handleStop(
    { session_id: 'sess-001', turn_id: 'turn-001' },
    { runtime: fakeRt, nativeSync: fakeSyncNoop }
  );

  assert.strictEqual(shutdownCalled, false, 'shutdownAll must never be called from handleStop');
});

// ── transcript recording ──────────────────────────────────────────────────────

console.log('\ncodex.handleStop — transcript recording');

test('records last_assistant_message via rt.recordTurnAssistantMessage', () => {
  const recorded = [];
  const fakeRt   = {
    recordTurnAssistantMessage(sessionId, meta) { recorded.push({ sessionId, ...meta }); },
  };
  const fakeSyncNoop = { syncFromPath() { return { synced: 0, skipped: 0 }; } };

  codexBridge.handleStop(
    { session_id: 'sess-001', last_assistant_message: 'Great, done!' },
    { runtime: fakeRt, nativeSync: fakeSyncNoop }
  );

  assert.strictEqual(recorded.length, 1);
  assert.strictEqual(recorded[0].sessionId, 'sess-001');
  assert.strictEqual(recorded[0].content, 'Great, done!');
  assert.strictEqual(recorded[0].source, 'codex');
});

test('does not record when last_assistant_message is empty string', () => {
  const recorded = [];
  const fakeRt   = {
    recordTurnAssistantMessage(sessionId, meta) { recorded.push({ sessionId, ...meta }); },
  };
  const fakeSyncNoop = { syncFromPath() { return { synced: 0, skipped: 0 }; } };

  codexBridge.handleStop(
    { session_id: 'sess-001', last_assistant_message: '' },
    { runtime: fakeRt, nativeSync: fakeSyncNoop }
  );

  assert.strictEqual(recorded.length, 0, 'empty last_assistant_message must not be recorded');
});

test('does not record when last_assistant_message is absent', () => {
  const recorded = [];
  const fakeRt   = {
    recordTurnAssistantMessage(sessionId, meta) { recorded.push({ sessionId, ...meta }); },
  };
  const fakeSyncNoop = { syncFromPath() { return { synced: 0, skipped: 0 }; } };

  codexBridge.handleStop(
    { session_id: 'sess-001' },
    { runtime: fakeRt, nativeSync: fakeSyncNoop }
  );

  assert.strictEqual(recorded.length, 0);
});

test('calls syncFromPath when transcript_path is present', () => {
  const syncCalls = [];
  const fakeRt    = {
    recordTurnAssistantMessage() {},
  };
  const fakeSync = {
    syncFromPath(sessionId, transcriptPath, opts) {
      syncCalls.push({ sessionId, transcriptPath, opts });
      return { synced: 1, skipped: 0 };
    },
  };

  codexBridge.handleStop(
    { session_id: 'sess-001', transcript_path: '/tmp/codex-transcript.jsonl' },
    { runtime: fakeRt, nativeSync: fakeSync }
  );

  assert.strictEqual(syncCalls.length, 1);
  assert.strictEqual(syncCalls[0].sessionId, 'sess-001');
  assert.strictEqual(syncCalls[0].transcriptPath, '/tmp/codex-transcript.jsonl');
  assert.strictEqual(syncCalls[0].opts.source, 'codex');
});

test('does not call syncFromPath when transcript_path is absent', () => {
  const syncCalls = [];
  const fakeRt    = { recordTurnAssistantMessage() {} };
  const fakeSync  = {
    syncFromPath() { syncCalls.push(true); return { synced: 0, skipped: 0 }; },
  };

  codexBridge.handleStop(
    { session_id: 'sess-001', last_assistant_message: 'Done.' },
    { runtime: fakeRt, nativeSync: fakeSync }
  );

  assert.strictEqual(syncCalls.length, 0, 'no transcript_path → no syncFromPath call');
});

test('does nothing when session_id is absent', () => {
  const recorded  = [];
  const syncCalls = [];
  const fakeRt    = {
    recordTurnAssistantMessage(sid, meta) { recorded.push(meta); },
  };
  const fakeSync = {
    syncFromPath() { syncCalls.push(true); return { synced: 0, skipped: 0 }; },
  };

  const result = codexBridge.handleStop(
    { last_assistant_message: 'Something', transcript_path: '/tmp/t.jsonl' },
    { runtime: fakeRt, nativeSync: fakeSync }
  );

  assert.strictEqual(result, null);
  assert.strictEqual(recorded.length, 0);
  assert.strictEqual(syncCalls.length, 0);
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
