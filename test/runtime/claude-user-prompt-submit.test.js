'use strict';

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

console.log('\nclaude.handleUserPromptSubmit');

test('calls bridge.prepareTurn with claude source and prompt text', () => {
  const calls = [];
  const fakeBridge = {
    prepareTurn(input) {
      calls.push(input);
      return { additionalContext: '<memory_context>past sessions</memory_context>' };
    },
  };

  const output = claudeBridge.handleUserPromptSubmit(
    { prompt: 'how does the bridge work?' },
    { bridge: fakeBridge }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userMessage, 'how does the bridge work?');
  assert.equal(calls[0].recallQuery, 'how does the bridge work?');
  assert.equal(calls[0].prefetchOptions.source, 'claude');
  assert.equal(calls[0].recallOptions.source, 'claude');
  assert.equal(calls[0].recallOptions.maxSessions, 3);
  assert.equal(calls[0].useProviderPrefetch, true);
  assert.equal(calls[0].useDirectTranscriptRecall, true);

  assert.deepStrictEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: '<memory_context>past sessions</memory_context>',
    },
  });
});

test('returns null when prepareTurn yields no additionalContext', () => {
  const fakeBridge = {
    prepareTurn() {
      return { additionalContext: '' };
    },
  };

  const output = claudeBridge.handleUserPromptSubmit(
    { prompt: 'hello' },
    { bridge: fakeBridge }
  );

  assert.strictEqual(output, null);
});

test('handles empty payload gracefully (empty prompt)', () => {
  const calls = [];
  const fakeBridge = {
    prepareTurn(input) {
      calls.push(input);
      return { additionalContext: '' };
    },
  };

  const output = claudeBridge.handleUserPromptSubmit({}, { bridge: fakeBridge });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userMessage, '');
  assert.equal(calls[0].recallQuery, '');
  assert.strictEqual(output, null);
});

test('handles missing payload gracefully', () => {
  const fakeBridge = {
    prepareTurn() {
      return { additionalContext: '' };
    },
  };

  assert.doesNotThrow(() => {
    claudeBridge.handleUserPromptSubmit(undefined, { bridge: fakeBridge });
  });
});

test('returns null when prepareTurn yields null additionalContext', () => {
  const fakeBridge = {
    prepareTurn() {
      return { additionalContext: null };
    },
  };

  const output = claudeBridge.handleUserPromptSubmit(
    { prompt: 'test' },
    { bridge: fakeBridge }
  );

  assert.strictEqual(output, null);
});

// ── transcript recording ──────────────────────────────────────────────────────

test('records user prompt via rt.recordTurnUserMessage when session_id and prompt present', () => {
  const recorded = [];
  const fakeRt = {
    recordTurnUserMessage(sessionId, meta) {
      recorded.push({ sessionId, ...meta });
    },
  };
  const fakeBridge = {
    prepareTurn() { return { additionalContext: '' }; },
  };

  claudeBridge.handleUserPromptSubmit(
    { session_id: 'sess-123', prompt: 'What is memory-bank?' },
    { bridge: fakeBridge, runtime: fakeRt }
  );

  assert.strictEqual(recorded.length, 1);
  assert.strictEqual(recorded[0].sessionId, 'sess-123');
  assert.strictEqual(recorded[0].content, 'What is memory-bank?');
  assert.strictEqual(recorded[0].source, 'claude');
});

test('does not call recordTurnUserMessage when session_id is absent', () => {
  const recorded = [];
  const fakeRt = {
    recordTurnUserMessage(sessionId, meta) { recorded.push({ sessionId, ...meta }); },
  };
  const fakeBridge = {
    prepareTurn() { return { additionalContext: '' }; },
  };

  claudeBridge.handleUserPromptSubmit(
    { prompt: 'no session id here' },
    { bridge: fakeBridge, runtime: fakeRt }
  );

  assert.strictEqual(recorded.length, 0, 'must not record without session_id');
});

test('does not call recordTurnUserMessage when prompt is empty', () => {
  const recorded = [];
  const fakeRt = {
    recordTurnUserMessage(sessionId, meta) { recorded.push({ sessionId, ...meta }); },
  };
  const fakeBridge = {
    prepareTurn() { return { additionalContext: '' }; },
  };

  claudeBridge.handleUserPromptSubmit(
    { session_id: 'sess-123', prompt: '' },
    { bridge: fakeBridge, runtime: fakeRt }
  );

  assert.strictEqual(recorded.length, 0, 'must not record empty prompt');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
