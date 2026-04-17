'use strict';

/**
 * test/runtime/opencode-bridge.test.js
 *
 * Unit tests for lib/runtime/bridge/opencode.js.
 * All runtime and bridge dependencies are injected as fakes.
 *
 * FR coverage: FR-401 (handleSessionCreated), FR-402 (handleChatMessage),
 *              FR-403 (handleSessionDeleted), FR-404 (handleToolExecuteBefore,
 *              handleToolExecuteAfter, handleSessionCompacting, handleSessionStatus).
 */

const assert = require('assert');

const opencode = require('../../lib/runtime/bridge/opencode');

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
        ok:                true,
        sessionId:         input.sessionId,
        toolchain:         input.toolchain,
        additionalContext: '',
        diagnostics:       [],
        warnings:          [],
      };
    },
    prepareTurn() {
      return { additionalContext, diagnostics: [] };
    },
  };
}

function makeFakeRt(opts = {}) {
  const recorded     = [];
  const written      = [];
  const closed       = [];
  const sessionEnded = [];
  const compressed   = [];
  const shutdown     = { called: false };

  return {
    _recorded:     recorded,
    _written:      written,
    _closed:       closed,
    _sessionEnded: sessionEnded,
    _compressed:   compressed,
    _shutdown:     shutdown,

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
    onPreCompress(items) {
      compressed.push(items);
    },
    getProviderRegistry() {
      return {
        shutdownAll() { shutdown.called = true; },
      };
    },
  };
}

// ── handleSessionCreated (FR-401) ──────────────────────────────────────────────

console.log('\nopencode.handleSessionCreated (FR-401)');

test('calls bootstrapSession with toolchain=opencode', () => {
  let capturedToolchain = null;
  const fakeBridge = {
    bootstrapSession(input) {
      capturedToolchain = input.toolchain;
      return { ok: true, additionalContext: '', diagnostics: [], warnings: [] };
    },
    prepareTurn() { return { additionalContext: '', diagnostics: [] }; },
  };

  opencode.handleSessionCreated(
    { type: 'session.created', properties: { sessionID: 'oc-001' } },
    { bridge: fakeBridge, runtime: makeFakeRt(), projectDir: '/tmp' }
  );

  assert.strictEqual(capturedToolchain, 'opencode');
});

test('returns null when sessionID is absent from event.properties', () => {
  const result = opencode.handleSessionCreated(
    { type: 'session.created', properties: {} },
    { bridge: makeFakeBridge(), runtime: makeFakeRt() }
  );
  assert.strictEqual(result, null);
});

test('returns null when event.properties is absent', () => {
  const result = opencode.handleSessionCreated(
    { type: 'session.created' },
    { bridge: makeFakeBridge(), runtime: makeFakeRt() }
  );
  assert.strictEqual(result, null);
});

test('returns null for empty event', () => {
  const result = opencode.handleSessionCreated(
    {},
    { bridge: makeFakeBridge(), runtime: makeFakeRt() }
  );
  assert.strictEqual(result, null);
});

test('passes sessionID from event.properties to bootstrapSession', () => {
  let capturedSessionId = null;
  const fakeBridge = {
    bootstrapSession(input) {
      capturedSessionId = input.sessionId;
      return { ok: true, additionalContext: '', diagnostics: [], warnings: [] };
    },
    prepareTurn() { return { additionalContext: '', diagnostics: [] }; },
  };

  opencode.handleSessionCreated(
    { type: 'session.created', properties: { sessionID: 'oc-abc-123' } },
    { bridge: fakeBridge, runtime: makeFakeRt(), projectDir: '/tmp' }
  );

  assert.strictEqual(capturedSessionId, 'oc-abc-123');
});

test('passes registerLocalProvider=true and initializeProviders=true', () => {
  let capturedInput = null;
  const fakeBridge = {
    bootstrapSession(input) {
      capturedInput = input;
      return { ok: true, additionalContext: '', diagnostics: [], warnings: [] };
    },
    prepareTurn() { return { additionalContext: '', diagnostics: [] }; },
  };

  opencode.handleSessionCreated(
    { type: 'session.created', properties: { sessionID: 'oc-002' } },
    { bridge: fakeBridge, runtime: makeFakeRt(), projectDir: '/tmp' }
  );

  assert.strictEqual(capturedInput.registerLocalProvider, true);
  assert.strictEqual(capturedInput.initializeProviders,   true);
  assert.strictEqual(capturedInput.openTranscriptSession, false);
});

// ── handleChatMessage (FR-402) ─────────────────────────────────────────────────

console.log('\nopencode.handleChatMessage (FR-402)');

test('returns additionalContext string when recall produces context', () => {
  const fakeBridge = makeFakeBridge('recall context here');
  const rt = makeFakeRt();

  const ctx = opencode.handleChatMessage(
    { sessionID: 'oc-010' },
    { message: { content: 'hello world' }, parts: [] },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(ctx, 'recall context here');
});

test('returns null when recall is empty', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  const ctx = opencode.handleChatMessage(
    { sessionID: 'oc-011' },
    { message: { content: 'hello' }, parts: [] },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(ctx, null);
});

test('returns null when message content is empty', () => {
  const fakeBridge = makeFakeBridge('recall');
  const rt = makeFakeRt();

  const ctx = opencode.handleChatMessage(
    { sessionID: 'oc-012' },
    { message: { content: '' }, parts: [] },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(ctx, null);
});

test('records user message via rt.recordTurnUserMessage', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  opencode.handleChatMessage(
    { sessionID: 'oc-013' },
    { message: { content: 'test prompt' }, parts: [] },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(rt._recorded.length, 1);
  assert.strictEqual(rt._recorded[0].type,      'user');
  assert.strictEqual(rt._recorded[0].sessionId, 'oc-013');
  assert.strictEqual(rt._recorded[0].content,   'test prompt');
  assert.strictEqual(rt._recorded[0].source,    'opencode');
});

test('does not record when sessionID absent', () => {
  const fakeBridge = makeFakeBridge('');
  const rt = makeFakeRt();

  opencode.handleChatMessage(
    {},
    { message: { content: 'hello' }, parts: [] },
    { bridge: fakeBridge, runtime: rt }
  );

  assert.strictEqual(rt._recorded.length, 0);
});

test('extracts text from array content parts', () => {
  let capturedUserMessage = null;
  const fakeBridge = {
    bootstrapSession() { return { ok: true, additionalContext: '', diagnostics: [], warnings: [] }; },
    prepareTurn(input) {
      capturedUserMessage = input.userMessage;
      return { additionalContext: '', diagnostics: [] };
    },
  };

  opencode.handleChatMessage(
    { sessionID: 'oc-014' },
    {
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'world' },
        ],
      },
      parts: [],
    },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.strictEqual(capturedUserMessage, 'Hello world');
});

test('ignores non-text content array parts', () => {
  let capturedUserMessage = null;
  const fakeBridge = {
    bootstrapSession() { return { ok: true, additionalContext: '', diagnostics: [], warnings: [] }; },
    prepareTurn(input) {
      capturedUserMessage = input.userMessage;
      return { additionalContext: '', diagnostics: [] };
    },
  };

  opencode.handleChatMessage(
    { sessionID: 'oc-015' },
    {
      message: {
        content: [
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'just text' },
        ],
      },
      parts: [],
    },
    { bridge: fakeBridge, runtime: makeFakeRt() }
  );

  assert.strictEqual(capturedUserMessage, 'just text');
});

// ── handleToolExecuteBefore (FR-404) ──────────────────────────────────────────

console.log('\nopencode.handleToolExecuteBefore (FR-404)');

test('returns null for non-canonical path', () => {
  const rt = makeFakeRt();
  const result = opencode.handleToolExecuteBefore(
    { tool: 'write', sessionID: 'oc-020', callID: 'c1' },
    { args: { filePath: 'src/app.js', content: 'code' } },
    { runtime: rt }
  );
  assert.strictEqual(result, null);
});

test('returns null for canonical path when screening passes', () => {
  const rt = makeFakeRt();
  const result = opencode.handleToolExecuteBefore(
    { tool: 'write', sessionID: 'oc-021', callID: 'c1' },
    { args: { filePath: 'memory-bank/.local/CURRENT.md', content: 'valid' } },
    { runtime: rt }
  );
  assert.strictEqual(result, null);
});

test('throws when canonical path content is blocked', () => {
  const rt = makeFakeRt({ blockWrite: true, blockPatternId: 'sensitive' });
  let threw = false;
  let message = '';

  try {
    opencode.handleToolExecuteBefore(
      { tool: 'write', sessionID: 'oc-022', callID: 'c1' },
      { args: { filePath: 'memory-bank/.local/HANDOFF.md', content: 'bad' } },
      { runtime: rt }
    );
  } catch (err) {
    threw = true;
    message = err.message;
  }

  assert.ok(threw, 'must throw for blocked write');
  assert.ok(message.includes('Memora blocked'));
  assert.ok(message.includes('sensitive'));
});

test('throws with unknown_pattern when patternId is null', () => {
  const rt = makeFakeRt({ blockWrite: true, blockPatternId: null });
  let threw = false;
  let message = '';

  try {
    opencode.handleToolExecuteBefore(
      { tool: 'write', sessionID: 'oc-023', callID: 'c1' },
      { args: { filePath: 'memory-bank/DECISIONS.md', content: 'bad' } },
      { runtime: rt }
    );
  } catch (err) {
    threw = true;
    message = err.message;
  }

  assert.ok(threw);
  assert.ok(message.includes('unknown_pattern'));
});

test('uses args.path as fallback when filePath absent', () => {
  const rt = makeFakeRt();
  const result = opencode.handleToolExecuteBefore(
    { tool: 'write', sessionID: 'oc-024', callID: 'c1' },
    { args: { path: 'src/other.js', content: 'x' } },
    { runtime: rt }
  );
  assert.strictEqual(result, null); // non-canonical path → allowed
});

test('canonical check works with args.path for memory-bank paths', () => {
  const rt = makeFakeRt({ blockWrite: true });
  let threw = false;

  try {
    opencode.handleToolExecuteBefore(
      { tool: 'write', sessionID: 'oc-025', callID: 'c1' },
      { args: { path: 'memory-bank/.local/CURRENT.md', content: 'bad' } },
      { runtime: rt }
    );
  } catch (_) {
    threw = true;
  }

  assert.ok(threw, 'must throw for canonical path via args.path');
});

// ── handleToolExecuteAfter (FR-404) ───────────────────────────────────────────

console.log('\nopencode.handleToolExecuteAfter (FR-404)');

test('returns null for non-apply_patch tools', () => {
  const rt = makeFakeRt();
  const result = opencode.handleToolExecuteAfter(
    { tool: 'write', sessionID: 'oc-030', callID: 'c1', args: { filePath: 'memory-bank/X.md' } },
    { title: 'Write', output: '', metadata: {} },
    { runtime: rt }
  );
  assert.strictEqual(result, null);
  assert.strictEqual(rt._written.length, 0);
});

test('returns null for apply_patch without memory-bank in patchText', () => {
  const rt = makeFakeRt();
  const result = opencode.handleToolExecuteAfter(
    { tool: 'apply_patch', sessionID: 'oc-031', callID: 'c1', args: { patchText: '--- a/src/app.js\n+++ content' } },
    { title: 'ApplyPatch', output: '', metadata: {} },
    { runtime: rt }
  );
  assert.strictEqual(result, null);
  assert.strictEqual(rt._written.length, 0);
});

test('calls onMemoryWrite for apply_patch with memory-bank patchText', () => {
  const rt = makeFakeRt();
  opencode.handleToolExecuteAfter(
    { tool: 'apply_patch', sessionID: 'oc-032', callID: 'c1', args: { patchText: 'memory-bank/.local/CURRENT.md patched content' } },
    { title: 'ApplyPatch', output: '', metadata: {} },
    { runtime: rt }
  );

  assert.strictEqual(rt._written.length, 1);
  assert.strictEqual(rt._written[0].op, 'apply_patch');
  assert.strictEqual(rt._written[0].filePath, 'memory-bank');
});

test('reads patchText from input.args — NOT from output.args', () => {
  const rt = makeFakeRt();
  // put patchText only in output.args (wrong location) — should NOT trigger
  opencode.handleToolExecuteAfter(
    { tool: 'apply_patch', sessionID: 'oc-033', callID: 'c1', args: {} },
    { title: 'ApplyPatch', output: '', metadata: {}, args: { patchText: 'memory-bank/.local/CURRENT.md content' } },
    { runtime: rt }
  );
  assert.strictEqual(rt._written.length, 0, 'must read from input.args, not output.args');
});

// ── handleSessionCompacting (FR-404) ──────────────────────────────────────────

console.log('\nopencode.handleSessionCompacting (FR-404)');

test('calls onPreCompress and appends to output.context', () => {
  const rt = makeFakeRt();
  const output = { context: [] };

  opencode.handleSessionCompacting(
    { sessionID: 'oc-040' },
    output,
    { runtime: rt }
  );

  assert.strictEqual(rt._compressed.length, 1, 'onPreCompress must be called');
  assert.ok(output.context.length > 0, 'context must have entries');
  assert.ok(output.context[0].includes('Memora Runtime'));
});

test('initializes output.context if absent', () => {
  const rt = makeFakeRt();
  const output = {};

  opencode.handleSessionCompacting({ sessionID: 'oc-041' }, output, { runtime: rt });

  assert.ok(Array.isArray(output.context));
  assert.ok(output.context.length > 0);
});

test('appends to existing context without losing prior entries', () => {
  const rt = makeFakeRt();
  const output = { context: ['existing context'] };

  opencode.handleSessionCompacting({ sessionID: 'oc-042' }, output, { runtime: rt });

  assert.ok(output.context.length >= 2);
  assert.strictEqual(output.context[0], 'existing context');
});

// ── handleSessionDeleted (FR-403) ─────────────────────────────────────────────

console.log('\nopencode.handleSessionDeleted (FR-403)');

test('calls onSessionEnd and shutdownAll', () => {
  const rt = makeFakeRt();
  opencode.handleSessionDeleted(
    { type: 'session.deleted', properties: { sessionID: 'oc-050' } },
    { runtime: rt }
  );

  assert.strictEqual(rt._sessionEnded.length, 1);
  assert.strictEqual(rt._shutdown.called, true);
});

test('calls closeTranscriptSession with sessionID', () => {
  const rt = makeFakeRt();
  opencode.handleSessionDeleted(
    { type: 'session.deleted', properties: { sessionID: 'oc-051' } },
    { runtime: rt }
  );

  assert.strictEqual(rt._closed.length, 1);
  assert.strictEqual(rt._closed[0], 'oc-051');
});

test('shutdownAll called even if onSessionEnd throws (try/finally)', () => {
  const rt = makeFakeRt();
  rt.onSessionEnd = () => { throw new Error('session error'); };

  try {
    opencode.handleSessionDeleted(
      { type: 'session.deleted', properties: { sessionID: 'oc-052' } },
      { runtime: rt }
    );
  } catch (_) {
    // expected
  }

  assert.strictEqual(rt._shutdown.called, true);
});

test('does not call closeTranscriptSession when sessionID absent', () => {
  const rt = makeFakeRt();
  opencode.handleSessionDeleted(
    { type: 'session.deleted', properties: {} },
    { runtime: rt }
  );

  assert.strictEqual(rt._closed.length, 0);
  assert.strictEqual(rt._shutdown.called, true);
});

test('returns null', () => {
  const rt = makeFakeRt();
  const result = opencode.handleSessionDeleted(
    { type: 'session.deleted', properties: { sessionID: 'oc-053' } },
    { runtime: rt }
  );
  assert.strictEqual(result, null);
});

// ── handleSessionStatus (FR-404) ──────────────────────────────────────────────

console.log('\nopencode.handleSessionStatus (FR-404)');

test('returns null for idle status (observability only)', () => {
  const result = opencode.handleSessionStatus({
    type: 'session.status',
    properties: { status: { type: 'idle' } },
  });
  assert.strictEqual(result, null);
});

test('returns null for non-idle status', () => {
  const result = opencode.handleSessionStatus({
    type: 'session.status',
    properties: { status: { type: 'busy' } },
  });
  assert.strictEqual(result, null);
});

test('returns null for session.idle legacy event (backward compat)', () => {
  const result = opencode.handleSessionStatus({
    type: 'session.idle',
    properties: {},
  });
  assert.strictEqual(result, null);
});

test('does not call onSessionEnd or shutdownAll (observability only)', () => {
  const rt = makeFakeRt();
  opencode.handleSessionStatus(
    { type: 'session.status', properties: { status: { type: 'idle' } } },
    { runtime: rt }
  );
  assert.strictEqual(rt._sessionEnded.length, 0);
  assert.strictEqual(rt._shutdown.called, false);
});

// ── summary ────────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
