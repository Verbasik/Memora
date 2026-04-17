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

function makeFakeRuntime() {
  const calls = [];
  return {
    calls,
    runtime: {
      onSessionEnd(messages) {
        calls.push({ method: 'onSessionEnd', messages });
      },
      getProviderRegistry() {
        return {
          shutdownAll() {
            calls.push({ method: 'shutdownAll' });
          },
        };
      },
    },
  };
}

console.log('\nclaude.handleSessionEnd');

test('calls onSessionEnd and shutdownAll, returns hookSpecificOutput', () => {
  const { calls, runtime } = makeFakeRuntime();

  const output = claudeBridge.handleSessionEnd(
    { session_id: 'claude-sess-finalize-001' },
    { runtime }
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'onSessionEnd');
  assert.deepStrictEqual(calls[0].messages, []);
  assert.equal(calls[1].method, 'shutdownAll');

  assert.deepStrictEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'SessionEnd',
      additionalContext: 'Memora runtime finalized for Claude session claude-sess-finalize-001',
    },
  });
});

test('calls shutdownAll even when onSessionEnd throws', () => {
  const calls = [];
  const fakeRuntime = {
    onSessionEnd() {
      calls.push('onSessionEnd-threw');
      throw new Error('finalize error');
    },
    getProviderRegistry() {
      return {
        shutdownAll() {
          calls.push('shutdownAll');
        },
      };
    },
  };

  assert.throws(
    () => claudeBridge.handleSessionEnd({ session_id: 'x' }, { runtime: fakeRuntime }),
    /finalize error/
  );

  assert.ok(calls.includes('shutdownAll'), 'shutdownAll must be called even after onSessionEnd throws');
});

test('handles missing session_id gracefully', () => {
  const { calls, runtime } = makeFakeRuntime();

  const output = claudeBridge.handleSessionEnd({}, { runtime });

  assert.equal(calls.length, 2);
  assert.ok(output.hookSpecificOutput.additionalContext.includes('unknown'));
});

test('handles empty payload gracefully', () => {
  const { calls, runtime } = makeFakeRuntime();

  assert.doesNotThrow(() => {
    claudeBridge.handleSessionEnd(undefined, { runtime });
  });

  assert.equal(calls.length, 2);
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
