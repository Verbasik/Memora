'use strict';

/**
 * Integration tests for lib/runtime/providers/local.js — LocalMemoryProvider
 *
 * Uses a real TranscriptStore backed by a temp directory — no mocks.
 *
 * Verifies:
 *   - Construction options (no args, dataDir, injected store)
 *   - Identity: name, isAvailable, instanceof MemoryProvider
 *   - initialize(): opens session in the store
 *   - prefetch(): returns '' before init / empty query; returns fenced block after data
 *   - syncTurn(): no-ops when not initialized; appends user+assistant messages
 *   - onSessionEnd(): closes session (endedAt set), resets sessionId
 *   - shutdown(): safety fallback, idempotent
 *   - Full lifecycle: initialize → syncTurn × N → recall → onSessionEnd
 *   - Two providers backed by independent stores do not bleed into each other
 *
 * Run: node test/runtime/providers/local.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { MemoryProvider }      = require('../../../lib/runtime/provider');
const { LocalMemoryProvider } = require('../../../lib/runtime/providers/local');
const { TranscriptStore }     = require('../../../lib/runtime/transcript/store');

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

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-local-prov-'));

let _dirIdx = 0;
function tempDir() {
  const d = path.join(tmpBase, `d${_dirIdx++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function makeStore(dir) {
  return new TranscriptStore({ dataDir: dir || tempDir() });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

console.log('\nConstruction');

test('instantiates with no arguments', () => {
  const p = new LocalMemoryProvider();
  assert.ok(p instanceof LocalMemoryProvider);
});

test('is instanceof MemoryProvider', () => {
  assert.ok(new LocalMemoryProvider() instanceof MemoryProvider);
});

test('accepts injected store via opts.store', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  assert.strictEqual(p._store, store);
});

test('accepts opts.dataDir', () => {
  const dir = tempDir();
  const p = new LocalMemoryProvider({ dataDir: dir });
  assert.strictEqual(p._dataDir, dir);
  assert.strictEqual(p._store, null, 'store not yet created — lazy init');
});

test('_sessionId is null before initialize()', () => {
  assert.strictEqual(new LocalMemoryProvider()._sessionId, null);
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

console.log('\nIdentity');

test('name returns "local-transcript"', () => {
  assert.strictEqual(new LocalMemoryProvider().name, 'local-transcript');
});

test('isAvailable() always returns true', () => {
  assert.strictEqual(new LocalMemoryProvider().isAvailable(), true);
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

console.log('\ninitialize()');

test('initialize() creates a TranscriptStore if not injected', () => {
  const dir = tempDir();
  const p = new LocalMemoryProvider({ dataDir: dir });
  p.initialize('sess-lazy', { source: 'cli' });
  assert.ok(p._store instanceof TranscriptStore, 'store created lazily');
});

test('initialize() uses injected store directly', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-inject', { source: 'test' });
  const sessions = store.listSessions();
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].sessionId, 'sess-inject');
});

test('initialize() opens a session record in the store', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-001', { projectDir: '/tmp', source: 'cli' });
  const sessions = store.listSessions();
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].sessionId, 'sess-001');
  assert.ok(sessions[0].startedAt, 'session has startedAt');
  assert.strictEqual(sessions[0].endedAt, null, 'session still open');
});

test('initialize() sets _sessionId', () => {
  const p = new LocalMemoryProvider({ store: makeStore() });
  p.initialize('sess-setid');
  assert.strictEqual(p._sessionId, 'sess-setid');
});

test('initialize() forwards source option to session meta', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-src', { source: 'claude' });
  const session = store.getSession('sess-src');
  assert.strictEqual(session.source, 'claude');
});

// ---------------------------------------------------------------------------
// prefetch()
// ---------------------------------------------------------------------------

console.log('\nprefetch()');

test('prefetch() returns "" when not initialized', () => {
  const p = new LocalMemoryProvider({ store: makeStore() });
  assert.strictEqual(p.prefetch('query'), '');
});

test('prefetch() returns "" for empty query string', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-pf-empty');
  assert.strictEqual(p.prefetch(''), '');
  assert.strictEqual(p.prefetch('   '), '');
});

test('prefetch() returns "" when no matching sessions exist', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-pf-miss');
  const block = p.prefetch('zzz-no-match-xyz');
  assert.strictEqual(block, '');
});

test('prefetch() returns fenced block when matching content exists', () => {
  const store = makeStore();
  // Seed a PAST session (different provider instance) with known content
  const seeder = new LocalMemoryProvider({ store });
  seeder.initialize('sess-past');
  seeder.syncTurn('What is the deployment process?', 'You need to run npm deploy.');
  seeder.onSessionEnd([]);

  // Now a NEW session recalls past content
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-current');
  const block = p.prefetch('deployment process');
  assert.ok(typeof block === 'string');
  assert.ok(block.length > 0, 'block should be non-empty');
  assert.ok(block.includes('<memory_context'), 'block should be fenced');
  assert.ok(block.includes('deployment'), 'block should contain matched content');
});

// ---------------------------------------------------------------------------
// syncTurn()
// ---------------------------------------------------------------------------

console.log('\nsyncTurn()');

test('syncTurn() no-ops when not initialized (no sessionId)', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  // Should not throw and should not write to store
  p.syncTurn('user msg', 'assistant msg');
  const sessions = store.listSessions();
  assert.strictEqual(sessions.length, 0, 'no session created by syncTurn alone');
});

test('syncTurn() appends user message', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-sync');
  p.syncTurn('hello', '');
  const msgs = store.getMessages('sess-sync');
  assert.ok(msgs.some(m => m.role === 'user' && m.content === 'hello'));
});

test('syncTurn() appends assistant message', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-sync2');
  p.syncTurn('', 'hi back');
  const msgs = store.getMessages('sess-sync2');
  assert.ok(msgs.some(m => m.role === 'assistant' && m.content === 'hi back'));
});

test('syncTurn() appends both messages when both non-empty', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-both');
  p.syncTurn('user said this', 'assistant replied');
  const msgs = store.getMessages('sess-both');
  assert.strictEqual(msgs.length, 2);
});

test('syncTurn() skips empty user content', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-skip-u');
  p.syncTurn('', 'only assistant');
  const msgs = store.getMessages('sess-skip-u');
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].role, 'assistant');
});

test('syncTurn() updates session messageCount', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-count');
  p.syncTurn('msg1', 'reply1');
  p.syncTurn('msg2', 'reply2');
  const session = store.getSession('sess-count');
  assert.strictEqual(session.messageCount, 4);
});

// ---------------------------------------------------------------------------
// onSessionEnd()
// ---------------------------------------------------------------------------

console.log('\nonSessionEnd()');

test('onSessionEnd() closes the session (sets endedAt)', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-end');
  p.onSessionEnd([]);
  const session = store.getSession('sess-end');
  assert.ok(session.endedAt !== null, 'endedAt should be set after close');
});

test('onSessionEnd() resets _sessionId to null', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-null');
  p.onSessionEnd([]);
  assert.strictEqual(p._sessionId, null);
});

test('onSessionEnd() is idempotent (second call does not throw)', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-idem');
  p.onSessionEnd([]);
  assert.doesNotThrow(() => p.onSessionEnd([]));
});

// ---------------------------------------------------------------------------
// shutdown()
// ---------------------------------------------------------------------------

console.log('\nshutdown()');

test('shutdown() closes the session', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-shut');
  p.shutdown();
  const session = store.getSession('sess-shut');
  assert.ok(session.endedAt !== null, 'session closed by shutdown');
});

test('shutdown() resets _sessionId to null', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-shut2');
  p.shutdown();
  assert.strictEqual(p._sessionId, null);
});

test('shutdown() is idempotent (can be called after onSessionEnd)', () => {
  const store = makeStore();
  const p = new LocalMemoryProvider({ store });
  p.initialize('sess-idem2');
  p.onSessionEnd([]);
  assert.doesNotThrow(() => p.shutdown(), 'second close must not throw');
});

test('shutdown() is safe when never initialized', () => {
  const p = new LocalMemoryProvider({ store: makeStore() });
  assert.doesNotThrow(() => p.shutdown());
});

// ---------------------------------------------------------------------------
// Full lifecycle
// ---------------------------------------------------------------------------

console.log('\nFull lifecycle');

test('full lifecycle: initialize → syncTurn × 2 → recall → onSessionEnd', () => {
  const store = makeStore();

  // Session 1: seed data
  const p1 = new LocalMemoryProvider({ store });
  p1.initialize('sess-full-1');
  p1.syncTurn('How do I configure the runtime?', 'Read the RUNTIME.md docs.');
  p1.syncTurn('Any security considerations?', 'Yes, use checkMemoryWrite().');
  p1.onSessionEnd([]);

  // Session 2: recall from session 1
  const p2 = new LocalMemoryProvider({ store });
  p2.initialize('sess-full-2');
  const block = p2.prefetch('configure the runtime');  // exact substring of seeded content
  assert.ok(block.includes('<memory_context'), 'recall returned fenced block');
  assert.ok(block.includes('configure'), 'recalled content contains relevant term');

  // Write session 2 turns
  p2.syncTurn('Thanks, I found it.', 'Great!');
  p2.onSessionEnd([]);

  // Verify both sessions closed
  assert.ok(store.getSession('sess-full-1').endedAt !== null);
  assert.ok(store.getSession('sess-full-2').endedAt !== null);
  assert.strictEqual(store.listSessions().length, 2);
});

// ---------------------------------------------------------------------------
// Session isolation
// ---------------------------------------------------------------------------

console.log('\nSession isolation');

test('two providers backed by independent stores do not bleed data', () => {
  const store1 = makeStore();
  const store2 = makeStore();

  const p1 = new LocalMemoryProvider({ store: store1 });
  p1.initialize('sess-iso-1');
  p1.syncTurn('secret content alpha', 'acknowledged');
  p1.onSessionEnd([]);

  const p2 = new LocalMemoryProvider({ store: store2 });
  p2.initialize('sess-iso-2');
  const block = p2.prefetch('secret content alpha');
  assert.strictEqual(block, '', 'store2 should not see store1 data');
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

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
