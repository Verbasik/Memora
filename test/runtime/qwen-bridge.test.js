'use strict';

/**
 * test/runtime/qwen-bridge.test.js
 *
 * Unit tests for lib/runtime/bridge/qwen.js.
 * All runtime and bridge dependencies are injected as fakes.
 * No file I/O, no real transcript store touches.
 *
 * FR coverage: FR-301 (handleSessionStart), FR-302 (handleUserPromptSubmit),
 *              FR-303 (handleSessionEnd), FR-304 (handlePreToolUse, handlePostToolUse),
 *              Stop (checkpoint), handlePreCompact, handlePostCompact.
 */

const assert = require('assert');

const qwen = require('../../lib/runtime/bridge/qwen');

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

// ── Fake factories ─────────────────────────────────────────────────────────────

function makeFakeBridge(additionalContext = '') {
  return {
    bootstrapSession(input) {
      return {
        ok: true,
        sessionId: input.sessionId,
        toolchain: input.toolchain,
        additionalContext,
        diagnostics: [],
        warnings: [],
      };
    },
    prepareTurn(input) {
      return {
        additionalContext,
        diagnostics: [],
      };
    },
  };
}

function makeFakeRt(opts = {}) {
  const recorded  = [];
  const written   = [];
  const closed    = [];
  const sessionEnded = [];
  const shutdown  = { called: false };

  return {
    _recorded:    recorded,
    _written:     written,
    _closed:      closed,
    _sessionEnded: sessionEnded,
    _shutdown:    shutdown,

    recordTurnUserMessage(sessionId, meta) {
      recorded.push({ type: 'user', sessionId, ...meta });
    },
    recordTurnAssistantMessage(sessionId, meta) {
      recorded.push({ type: 'assistant', sessionId, ...meta });
    },
    closeTranscriptSession(sessionId) {
      closed.push(sessionId);
    },
    checkMemoryWrite(content) {
      if (opts.blockWrite) {
        // Use explicit null/undefined check so callers can test the null-patternId fallback.
        const patternId = 'blockPatternId' in opts ? opts.blockPatternId : 'test_blocked';
        return { allowed: false, patternId };
      }
      return { allowed: true };
    },
    onMemoryWrite(op, filePath, content) {
      written.push({ op, filePath, content });
    },
    onSessionEnd(items) {
      sessionEnded.push(items);
    },
    onPreCompress(items) {},
    getProviderRegistry() {
      return {
        shutdownAll() { shutdown.called = true; },
      };
    },
  };
}

function makeFakeNativeSync() {
  const syncCalls = [];
  return {
    _syncCalls: syncCalls,
    syncFromPath(sessionId, transcriptPath, opts) {
      syncCalls.push({ sessionId, transcriptPath, opts });
      return { synced: 0, skipped: 0 };
    },
  };
}

// ── handleSessionStart (FR-301) ────────────────────────────────────────────────

console.log('\nqwen.handleSessionStart (FR-301)');

test('returns output with hookSpecificOutput.additionalContext when context present', () => {
  const fakeBridge = makeFakeBridge('startup context');
  const { output } = qwen.handleSessionStart(
    { session_id: 'q-001', cwd: '/tmp/proj', source: 'startup' },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.ok(output, 'output must be non-null');
  assert.ok(output.hookSpecificOutput, 'must have hookSpecificOutput');
  assert.strictEqual(output.hookSpecificOutput.additionalContext, 'startup context');
});

test('returns output with null when no context files produce content', () => {
  const fakeBridge = makeFakeBridge('');
  const { output } = qwen.handleSessionStart(
    { session_id: 'q-002', cwd: '/tmp/proj' },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.strictEqual(output, null, 'output must be null when additionalContext is empty');
});

test('throws when session_id is missing', () => {
  let threw = false;
  try {
    qwen.handleSessionStart({ cwd: '/tmp/proj' }, { bridge: makeFakeBridge(), runtime: makeFakeRt() });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('session_id'));
  }
  assert.ok(threw, 'must throw for missing session_id');
});

test('passes toolchain=qwen to bootstrapSession', () => {
  let capturedToolchain = null;
  const fakeBridge = {
    bootstrapSession(input) {
      capturedToolchain = input.toolchain;
      return { ok: true, additionalContext: '', diagnostics: [], warnings: [] };
    },
    prepareTurn() { return { additionalContext: '', diagnostics: [] }; },
  };

  qwen.handleSessionStart(
    { session_id: 'q-003', cwd: '/tmp' },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.strictEqual(capturedToolchain, 'qwen');
});

test('uses source field for session title', () => {
  let capturedTitle = null;
  const fakeBridge = {
    bootstrapSession(input) {
      capturedTitle = input.title;
      return { ok: true, additionalContext: '', diagnostics: [], warnings: [] };
    },
    prepareTurn() { return { additionalContext: '', diagnostics: [] }; },
  };

  qwen.handleSessionStart(
    { session_id: 'q-004', source: 'ide', cwd: '/tmp' },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.strictEqual(capturedTitle, 'Qwen Code (ide)');
});

// ── handleUserPromptSubmit (FR-302) ────────────────────────────────────────────

console.log('\nqwen.handleUserPromptSubmit (FR-302)');

test('returns hookSpecificOutput.additionalContext when recall produces context', () => {
  const fakeBridge = makeFakeBridge('recall context here');
  const rt = makeFakeRt();

  const output = qwen.handleUserPromptSubmit(
    { session_id: 'q-010', prompt: 'hello' },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.ok(output, 'output must be non-null');
  assert.strictEqual(output.hookSpecificOutput.additionalContext, 'recall context here');
});

test('returns null when recall produces no context', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  const output = qwen.handleUserPromptSubmit(
    { session_id: 'q-011', prompt: 'hello' },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(output, null);
});

test('records user message via rt.recordTurnUserMessage', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  qwen.handleUserPromptSubmit(
    { session_id: 'q-012', prompt: 'test prompt' },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(rt._recorded.length, 1);
  assert.strictEqual(rt._recorded[0].type, 'user');
  assert.strictEqual(rt._recorded[0].sessionId, 'q-012');
  assert.strictEqual(rt._recorded[0].content, 'test prompt');
  assert.strictEqual(rt._recorded[0].source, 'qwen');
});

test('does not record when prompt is empty', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  qwen.handleUserPromptSubmit(
    { session_id: 'q-013', prompt: '' },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(rt._recorded.length, 0);
});

test('does not record when session_id is absent', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  qwen.handleUserPromptSubmit(
    { prompt: 'hello world' },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(rt._recorded.length, 0);
});

// ── handlePreToolUse (FR-304) ──────────────────────────────────────────────────

console.log('\nqwen.handlePreToolUse (FR-304)');

test('returns allow for non-canonical path', () => {
  const rt = makeFakeRt();
  const output = qwen.handlePreToolUse(
    { tool_input: { file_path: 'src/app.js', content: 'code' } },
    { runtime: rt }
  );

  assert.ok(output, 'must return explicit allow (not null)');
  assert.strictEqual(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.ok(output.hookSpecificOutput.permissionDecisionReason.includes('Not a canonical'));
});

test('returns allow for canonical path when content passes screening', () => {
  const rt = makeFakeRt();
  const output = qwen.handlePreToolUse(
    { tool_input: { file_path: 'memory-bank/.local/CURRENT.md', content: 'valid content' } },
    { runtime: rt }
  );

  assert.strictEqual(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.ok(output.hookSpecificOutput.permissionDecisionReason.includes('screening passed'));
});

test('returns deny for canonical path when content blocked', () => {
  const rt = makeFakeRt({ blockWrite: true, blockPatternId: 'sensitive_pattern' });
  const output = qwen.handlePreToolUse(
    { tool_input: { file_path: 'memory-bank/.local/HANDOFF.md', content: 'bad' } },
    { runtime: rt }
  );

  assert.strictEqual(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(output.hookSpecificOutput.permissionDecisionReason.includes('sensitive_pattern'));
  assert.ok(output.hookSpecificOutput.additionalContext, 'deny must include additionalContext');
});

test('returns deny when patternId is absent (fallback unknown_pattern)', () => {
  const rt = makeFakeRt({ blockWrite: true, blockPatternId: null });
  const output = qwen.handlePreToolUse(
    { tool_input: { file_path: 'memory-bank/DECISIONS.md', content: 'bad' } },
    { runtime: rt }
  );

  assert.strictEqual(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(output.hookSpecificOutput.permissionDecisionReason.includes('unknown_pattern'));
});

test('matches all canonical memory paths', () => {
  const paths = [
    'memory-bank/.local/CURRENT.md',
    'memory-bank/.local/HANDOFF.md',
    'memory-bank/DECISIONS.md',
    'memory-bank/ADR/0001-some.md',
    'memory-bank/PATTERNS/cache-pattern.md',
  ];

  paths.forEach((filePath) => {
    const rt = makeFakeRt();
    const output = qwen.handlePreToolUse(
      { tool_input: { file_path: filePath, content: '' } },
      { runtime: rt }
    );
    // Content is empty but path matched — screening allowed (empty content passes by default)
    assert.strictEqual(output.hookSpecificOutput.hookEventName, 'PreToolUse', `${filePath} must match`);
  });
});

// ── handlePostToolUse (FR-304) ─────────────────────────────────────────────────

console.log('\nqwen.handlePostToolUse (FR-304)');

test('returns null for non-canonical path', () => {
  const rt = makeFakeRt();
  const output = qwen.handlePostToolUse(
    { tool_input: { file_path: 'src/app.js', content: 'code' } },
    { runtime: rt }
  );
  assert.strictEqual(output, null);
  assert.strictEqual(rt._written.length, 0);
});

test('calls onMemoryWrite and returns additionalContext for canonical path', () => {
  const rt = makeFakeRt();
  const output = qwen.handlePostToolUse(
    { tool_input: { file_path: 'memory-bank/.local/CURRENT.md', content: 'new content' } },
    { runtime: rt }
  );

  assert.ok(output, 'output must be non-null');
  assert.ok(output.hookSpecificOutput.additionalContext.includes('CURRENT.md'));
  assert.strictEqual(rt._written.length, 1);
  assert.strictEqual(rt._written[0].op, 'replace');
  assert.strictEqual(rt._written[0].filePath, 'memory-bank/.local/CURRENT.md');
});

// ── handleSessionEnd (FR-303) ──────────────────────────────────────────────────

console.log('\nqwen.handleSessionEnd (FR-303)');

test('calls onSessionEnd and shutdownAll', () => {
  const rt = makeFakeRt();
  qwen.handleSessionEnd({ session_id: 'q-020' }, { runtime: rt });

  assert.strictEqual(rt._sessionEnded.length, 1);
  assert.strictEqual(rt._shutdown.called, true);
});

test('calls closeTranscriptSession with session_id', () => {
  const rt = makeFakeRt();
  qwen.handleSessionEnd({ session_id: 'q-021' }, { runtime: rt });

  assert.strictEqual(rt._closed.length, 1);
  assert.strictEqual(rt._closed[0], 'q-021');
});

test('shutdownAll is called even if onSessionEnd throws', () => {
  const rt = makeFakeRt();
  rt.onSessionEnd = () => { throw new Error('session end error'); };

  // The exception propagates (hook process exits with error — expected behavior),
  // but the try/finally must still call shutdownAll before the process exits.
  try {
    qwen.handleSessionEnd({ session_id: 'q-022' }, { runtime: rt });
  } catch (_err) {
    // expected
  }

  assert.strictEqual(rt._shutdown.called, true, 'shutdownAll must be called in finally block');
});

test('returns hookSpecificOutput with session id in context', () => {
  const rt = makeFakeRt();
  const output = qwen.handleSessionEnd({ session_id: 'q-023' }, { runtime: rt });

  assert.ok(output.hookSpecificOutput.additionalContext.includes('q-023'));
});

test('works without session_id (graceful fallback)', () => {
  const rt = makeFakeRt();
  const output = qwen.handleSessionEnd({}, { runtime: rt });

  assert.ok(output, 'must return output');
  assert.strictEqual(rt._closed.length, 0, 'closeTranscriptSession not called when no session_id');
  assert.strictEqual(rt._shutdown.called, true);
});

// ── handleStop (checkpoint) ────────────────────────────────────────────────────

console.log('\nqwen.handleStop (checkpoint)');

test('returns null on normal stop', () => {
  const rt = makeFakeRt();
  const result = qwen.handleStop(
    { session_id: 'q-030', last_assistant_message: 'Done.' },
    { runtime: rt, nativeSync: makeFakeNativeSync() }
  );
  assert.strictEqual(result, null);
});

test('returns null when stop_hook_active is true', () => {
  const result = qwen.handleStop({ stop_hook_active: true, session_id: 'q-031' });
  assert.strictEqual(result, null);
});

test('records last_assistant_message via recordTurnAssistantMessage', () => {
  const rt = makeFakeRt();
  qwen.handleStop(
    { session_id: 'q-032', last_assistant_message: 'Answer here' },
    { runtime: rt, nativeSync: makeFakeNativeSync() }
  );

  assert.strictEqual(rt._recorded.length, 1);
  assert.strictEqual(rt._recorded[0].type, 'assistant');
  assert.strictEqual(rt._recorded[0].content, 'Answer here');
  assert.strictEqual(rt._recorded[0].source, 'qwen');
});

test('does not record when last_assistant_message is absent', () => {
  const rt = makeFakeRt();
  qwen.handleStop(
    { session_id: 'q-033' },
    { runtime: rt, nativeSync: makeFakeNativeSync() }
  );
  assert.strictEqual(rt._recorded.length, 0);
});

test('calls syncFromPath when transcript_path present', () => {
  const rt = makeFakeRt();
  const fakeSync = makeFakeNativeSync();

  qwen.handleStop(
    { session_id: 'q-034', transcript_path: '/tmp/qwen.jsonl' },
    { runtime: rt, nativeSync: fakeSync }
  );

  assert.strictEqual(fakeSync._syncCalls.length, 1);
  assert.strictEqual(fakeSync._syncCalls[0].sessionId, 'q-034');
  assert.strictEqual(fakeSync._syncCalls[0].transcriptPath, '/tmp/qwen.jsonl');
});

test('does not call syncFromPath when transcript_path absent', () => {
  const rt = makeFakeRt();
  const fakeSync = makeFakeNativeSync();

  qwen.handleStop(
    { session_id: 'q-035', last_assistant_message: 'Done.' },
    { runtime: rt, nativeSync: fakeSync }
  );

  assert.strictEqual(fakeSync._syncCalls.length, 0);
});

test('returns null when session_id absent', () => {
  const result = qwen.handleStop(
    { last_assistant_message: 'Hmm' },
    { runtime: makeFakeRt(), nativeSync: makeFakeNativeSync() }
  );
  assert.strictEqual(result, null);
});

// ── handlePreCompact / handlePostCompact ───────────────────────────────────────

console.log('\nqwen.handlePreCompact / handlePostCompact');

test('handlePreCompact calls onPreCompress and returns additionalContext', () => {
  let compressCalled = false;
  const rt = makeFakeRt();
  rt.onPreCompress = () => { compressCalled = true; };

  const output = qwen.handlePreCompact(
    { trigger: 'auto', session_id: 'q-040' },
    { runtime: rt }
  );

  assert.ok(compressCalled, 'onPreCompress must be called');
  assert.ok(output.hookSpecificOutput.additionalContext.includes('auto'));
});

test('handlePreCompact uses "unknown" when trigger absent', () => {
  const rt = makeFakeRt();
  const output = qwen.handlePreCompact({}, { runtime: rt });

  assert.ok(output.hookSpecificOutput.additionalContext.includes('unknown'));
});

test('handlePostCompact returns additionalContext with session id', () => {
  const output = qwen.handlePostCompact({ session_id: 'q-041' });
  assert.ok(output.hookSpecificOutput.additionalContext.includes('q-041'));
});

test('handlePostCompact uses "unknown" when session_id absent', () => {
  const output = qwen.handlePostCompact({});
  assert.ok(output.hookSpecificOutput.additionalContext.includes('unknown'));
});

// ── summary ────────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
