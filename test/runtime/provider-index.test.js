'use strict';

/**
 * Integration tests for Phase 3 Provider Registry API in lib/runtime/index.js
 *
 * Exercises the public API surface added in Phase 3 Step 4:
 *
 *   Low-level re-exports:
 *     runtime.provider         — { MemoryProvider }
 *     runtime.providerRegistry — { ProviderRegistry }
 *     runtime.localProvider    — { LocalMemoryProvider }
 *
 *   Singleton management:
 *     runtime.getProviderRegistry()
 *     runtime.resetProviderRegistry(registry?)
 *
 *   Lifecycle hook wrappers (fan-out to all registered providers):
 *     runtime.onTurnStart(n, msg, opts)
 *     runtime.onSessionEnd(messages)
 *     runtime.onPreCompress(messages)
 *     runtime.onMemoryWrite(action, target, content)
 *     runtime.onDelegation(task, result, opts)
 *
 * Isolation strategy:
 *   Each test group calls runtime.resetProviderRegistry() to start with a
 *   fresh singleton.  Module-level state from previous tests is never
 *   carried over.
 *
 * Run: node test/runtime/provider-index.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const runtime = require('../../lib/runtime');
const { MemoryProvider }   = runtime.provider;
const { ProviderRegistry } = runtime.providerRegistry;
const { LocalMemoryProvider } = runtime.localProvider;
const { TranscriptStore }  = runtime.transcriptStore;

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

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-prov-idx-'));

let _dirIdx = 0;
function tempDir() {
  const d = path.join(tmpBase, `d${_dirIdx++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ---------------------------------------------------------------------------
// Minimal spy provider for hook assertions
// ---------------------------------------------------------------------------

function makeSpyProvider(name) {
  class SpyProvider extends MemoryProvider {
    constructor() {
      super();
      this.calls = [];
    }
    get name()                    { return name; }
    onTurnStart(n, msg)           { this.calls.push({ hook: 'onTurnStart', n }); }
    onSessionEnd(msgs)            { this.calls.push({ hook: 'onSessionEnd', len: msgs.length }); }
    onPreCompress(msgs)           { this.calls.push({ hook: 'onPreCompress' }); return `note-from-${name}`; }
    onMemoryWrite(act, tgt, cnt)  { this.calls.push({ hook: 'onMemoryWrite', act }); }
    onDelegation(task, res)       { this.calls.push({ hook: 'onDelegation', task }); }
  }
  return new SpyProvider();
}

// ---------------------------------------------------------------------------
// Phase 3 re-exports
// ---------------------------------------------------------------------------

console.log('\nPhase 3 re-exports');

test('exports runtime.provider module', () => {
  assert.ok(typeof runtime.provider === 'object');
  assert.ok(typeof runtime.provider.MemoryProvider === 'function');
});

test('runtime.provider.MemoryProvider is the base class', () => {
  const p = new runtime.provider.MemoryProvider();
  assert.strictEqual(p.name, 'unnamed');
});

test('exports runtime.providerRegistry module', () => {
  assert.ok(typeof runtime.providerRegistry === 'object');
  assert.ok(typeof runtime.providerRegistry.ProviderRegistry === 'function');
});

test('exports runtime.localProvider module', () => {
  assert.ok(typeof runtime.localProvider === 'object');
  assert.ok(typeof runtime.localProvider.LocalMemoryProvider === 'function');
});

test('LocalMemoryProvider is instanceof MemoryProvider', () => {
  assert.ok(new LocalMemoryProvider() instanceof MemoryProvider);
});

// ---------------------------------------------------------------------------
// getProviderRegistry — singleton behaviour
// ---------------------------------------------------------------------------

console.log('\ngetProviderRegistry()');

test('getProviderRegistry() returns a ProviderRegistry instance', () => {
  runtime.resetProviderRegistry();
  const reg = runtime.getProviderRegistry();
  assert.ok(reg instanceof ProviderRegistry);
});

test('getProviderRegistry() returns the same singleton on repeated calls', () => {
  runtime.resetProviderRegistry();
  const r1 = runtime.getProviderRegistry();
  const r2 = runtime.getProviderRegistry();
  assert.strictEqual(r1, r2);
});

test('after resetProviderRegistry() a fresh registry is returned', () => {
  runtime.resetProviderRegistry();
  const before = runtime.getProviderRegistry();
  runtime.resetProviderRegistry();
  const after = runtime.getProviderRegistry();
  assert.notStrictEqual(before, after);
});

// ---------------------------------------------------------------------------
// resetProviderRegistry — injection
// ---------------------------------------------------------------------------

console.log('\nresetProviderRegistry()');

test('resetProviderRegistry(registry) installs the provided registry', () => {
  const custom = new ProviderRegistry();
  runtime.resetProviderRegistry(custom);
  assert.strictEqual(runtime.getProviderRegistry(), custom);
});

test('resetProviderRegistry() without arg clears to null (lazy reinit)', () => {
  runtime.resetProviderRegistry();
  const reg = runtime.getProviderRegistry();
  assert.ok(reg instanceof ProviderRegistry);
});

test('resetProviderRegistry(non-object) falls back to null', () => {
  runtime.resetProviderRegistry('not a registry');
  const reg = runtime.getProviderRegistry();
  assert.ok(reg instanceof ProviderRegistry, 'should create fresh instance');
});

// ---------------------------------------------------------------------------
// onTurnStart
// ---------------------------------------------------------------------------

console.log('\nonTurnStart()');

test('onTurnStart() fan-outs to all registered providers', () => {
  runtime.resetProviderRegistry();
  const spy1 = makeSpyProvider('spy1');
  const spy2 = makeSpyProvider('spy2');
  runtime.getProviderRegistry().addProvider(spy1);
  runtime.getProviderRegistry().addProvider(spy2);

  runtime.onTurnStart(5, 'hello');

  assert.ok(spy1.calls.some(c => c.hook === 'onTurnStart' && c.n === 5));
  assert.ok(spy2.calls.some(c => c.hook === 'onTurnStart' && c.n === 5));
});

test('onTurnStart() does not throw with empty registry', () => {
  runtime.resetProviderRegistry();
  assert.doesNotThrow(() => runtime.onTurnStart(1, 'msg'));
});

// ---------------------------------------------------------------------------
// onSessionEnd
// ---------------------------------------------------------------------------

console.log('\nonSessionEnd()');

test('onSessionEnd() fan-outs to all providers', () => {
  runtime.resetProviderRegistry();
  const spy = makeSpyProvider('spy-end');
  runtime.getProviderRegistry().addProvider(spy);

  runtime.onSessionEnd([{ role: 'user', content: 'bye' }]);
  assert.ok(spy.calls.some(c => c.hook === 'onSessionEnd' && c.len === 1));
});

test('onSessionEnd() does not throw with empty registry', () => {
  runtime.resetProviderRegistry();
  assert.doesNotThrow(() => runtime.onSessionEnd([]));
});

// ---------------------------------------------------------------------------
// onPreCompress
// ---------------------------------------------------------------------------

console.log('\nonPreCompress()');

test('onPreCompress() returns string', () => {
  runtime.resetProviderRegistry();
  const result = runtime.onPreCompress([]);
  assert.strictEqual(typeof result, 'string');
});

test('onPreCompress() returns empty string with no providers', () => {
  runtime.resetProviderRegistry();
  assert.strictEqual(runtime.onPreCompress([]), '');
});

test('onPreCompress() joins contributions from multiple providers', () => {
  runtime.resetProviderRegistry();
  runtime.getProviderRegistry().addProvider(makeSpyProvider('c1'));
  runtime.getProviderRegistry().addProvider(makeSpyProvider('c2'));

  const result = runtime.onPreCompress([]);
  assert.ok(result.includes('note-from-c1'));
  assert.ok(result.includes('note-from-c2'));
});

// ---------------------------------------------------------------------------
// onMemoryWrite
// ---------------------------------------------------------------------------

console.log('\nonMemoryWrite()');

test('onMemoryWrite() fan-outs to all providers', () => {
  runtime.resetProviderRegistry();
  const spy = makeSpyProvider('spy-mw');
  runtime.getProviderRegistry().addProvider(spy);

  runtime.onMemoryWrite('add', 'memory', 'test content');
  assert.ok(spy.calls.some(c => c.hook === 'onMemoryWrite' && c.act === 'add'));
});

test('onMemoryWrite() does not throw with empty registry', () => {
  runtime.resetProviderRegistry();
  assert.doesNotThrow(() => runtime.onMemoryWrite('replace', 'user', 'val'));
});

// ---------------------------------------------------------------------------
// onDelegation
// ---------------------------------------------------------------------------

console.log('\nonDelegation()');

test('onDelegation() fan-outs to all providers', () => {
  runtime.resetProviderRegistry();
  const spy = makeSpyProvider('spy-del');
  runtime.getProviderRegistry().addProvider(spy);

  runtime.onDelegation('write tests', 'done', { childSessionId: 'child-001' });
  assert.ok(spy.calls.some(c => c.hook === 'onDelegation' && c.task === 'write tests'));
});

test('onDelegation() does not throw with empty registry', () => {
  runtime.resetProviderRegistry();
  assert.doesNotThrow(() => runtime.onDelegation('task', 'result'));
});

// ---------------------------------------------------------------------------
// Failure isolation
// ---------------------------------------------------------------------------

console.log('\nFailure isolation');

test('one failing provider does not block hook fan-out to others', () => {
  runtime.resetProviderRegistry();
  const good = makeSpyProvider('good');
  class BoomProvider extends MemoryProvider {
    get name()      { return 'boom'; }
    onTurnStart()   { throw new Error('boom!'); }
  }
  runtime.getProviderRegistry().addProvider(new BoomProvider());
  runtime.getProviderRegistry().addProvider(good);

  assert.doesNotThrow(() => runtime.onTurnStart(1, 'msg'));
  assert.ok(good.calls.some(c => c.hook === 'onTurnStart'), 'good provider still called');
});

test('failure is logged in registry diagnostics, not thrown', () => {
  runtime.resetProviderRegistry();
  class NoisyProvider extends MemoryProvider {
    get name()      { return 'noisy'; }
    onMemoryWrite() { throw new Error('write exploded'); }
  }
  runtime.getProviderRegistry().addProvider(new NoisyProvider());
  runtime.onMemoryWrite('add', 'target', 'content');
  const diag = runtime.getProviderRegistry().diagnostics;
  assert.ok(diag.some(d => d.includes('noisy') || d.includes('non-fatal')));
});

// ---------------------------------------------------------------------------
// End-to-end Phase 3 with LocalMemoryProvider
// ---------------------------------------------------------------------------

console.log('\nEnd-to-end with LocalMemoryProvider');

test('full Phase 3 lifecycle via index.js with LocalMemoryProvider', () => {
  runtime.resetProviderRegistry();

  const dir = tempDir();
  const store = new TranscriptStore({ dataDir: dir });
  const provider = new LocalMemoryProvider({ store });

  const reg = runtime.getProviderRegistry();
  reg.addProvider(provider);
  reg.initializeAll('sess-e2e', { projectDir: dir, source: 'test' });

  // Per-turn hooks
  runtime.onTurnStart(1, 'test message');
  reg.syncAll('user query', 'assistant response');

  // Pre-compress hook
  const compressNote = runtime.onPreCompress([]);
  assert.strictEqual(typeof compressNote, 'string');

  // Memory write hook
  runtime.onMemoryWrite('add', 'memory', 'fact about Phase 3');

  // Delegation hook
  runtime.onDelegation('run subtask', 'subtask done');

  // Session end
  runtime.onSessionEnd([]);

  // Verify session was written and closed via the store
  const sessions = store.listSessions();
  assert.strictEqual(sessions.length, 1);
  assert.ok(sessions[0].endedAt !== null, 'session should be closed');

  const msgs = store.getMessages('sess-e2e');
  assert.strictEqual(msgs.length, 2, 'user + assistant messages should be stored');
});

// ---------------------------------------------------------------------------
// Coexistence with Phase 1 and Phase 2 APIs
// ---------------------------------------------------------------------------

console.log('\nCoexistence with Phase 1 / Phase 2 APIs');

test('Phase 1 exports still accessible after Phase 3 setup', () => {
  assert.ok(typeof runtime.security === 'object');
  assert.ok(typeof runtime.checkMemoryWrite === 'function');
  assert.ok(typeof runtime.loadContextFile === 'function');
});

test('Phase 2 exports still accessible after Phase 3 setup', () => {
  assert.ok(typeof runtime.transcriptStore === 'object');
  assert.ok(typeof runtime.openTranscriptSession === 'function');
  assert.ok(typeof runtime.recallTranscripts === 'function');
});

test('Phase 3 registry singleton is independent of Phase 2 transcript singleton', () => {
  runtime.resetProviderRegistry();
  runtime.resetTranscriptStore();
  const reg = runtime.getProviderRegistry();
  assert.ok(reg instanceof ProviderRegistry);
  // Transcript store reset should not affect registry
  assert.strictEqual(runtime.getProviderRegistry(), reg);
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

runtime.resetProviderRegistry();
runtime.resetTranscriptStore();

try {
  fs.rmSync(tmpBase, { recursive: true, force: true });
} catch (_) {}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
