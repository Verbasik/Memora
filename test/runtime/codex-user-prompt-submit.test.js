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

console.log('\ncodex.handleUserPromptSubmit');

test('calls bridge.prepareTurn with codex source and returns plain text', () => {
  const calls = [];
  const fakeBridge = {
    prepareTurn(input) {
      calls.push(input);
      return { additionalContext: '<memory_context>past sessions</memory_context>' };
    },
  };

  const text = codexBridge.handleUserPromptSubmit(
    { prompt: 'how does the bridge work?' },
    { bridge: fakeBridge }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userMessage, 'how does the bridge work?');
  assert.equal(calls[0].recallQuery, 'how does the bridge work?');
  assert.equal(calls[0].prefetchOptions.source, 'codex');
  assert.equal(calls[0].recallOptions.source, 'codex');
  assert.equal(calls[0].recallOptions.maxSessions, 3);
  assert.equal(calls[0].useProviderPrefetch, true);
  assert.equal(calls[0].useDirectTranscriptRecall, true);

  // Must return plain string, not an object — Codex does not accept JSON here
  assert.equal(typeof text, 'string');
  assert.equal(text, '<memory_context>past sessions</memory_context>');
});

test('returns null when prepareTurn yields no additionalContext', () => {
  const fakeBridge = {
    prepareTurn() { return { additionalContext: '' }; },
  };

  const text = codexBridge.handleUserPromptSubmit(
    { prompt: 'hello' },
    { bridge: fakeBridge }
  );

  assert.strictEqual(text, null);
});

test('handles empty payload gracefully', () => {
  const calls = [];
  const fakeBridge = {
    prepareTurn(input) {
      calls.push(input);
      return { additionalContext: '' };
    },
  };

  const text = codexBridge.handleUserPromptSubmit({}, { bridge: fakeBridge });

  assert.equal(calls[0].userMessage, '');
  assert.strictEqual(text, null);
});

test('handles missing payload gracefully', () => {
  const fakeBridge = {
    prepareTurn() { return { additionalContext: '' }; },
  };

  assert.doesNotThrow(() => {
    codexBridge.handleUserPromptSubmit(undefined, { bridge: fakeBridge });
  });
});

test('output is never a JSON object (Codex plain-stdout contract)', () => {
  const fakeBridge = {
    prepareTurn() {
      return { additionalContext: 'some context' };
    },
  };

  const result = codexBridge.handleUserPromptSubmit(
    { prompt: 'test' },
    { bridge: fakeBridge }
  );

  assert.notEqual(typeof result, 'object', 'result must not be an object — Codex UserPromptSubmit rejects JSON stdout');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
