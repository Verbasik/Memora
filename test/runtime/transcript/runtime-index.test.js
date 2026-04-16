'use strict';

/**
 * Integration tests for Phase 2 Transcript API in lib/runtime/index.js
 *
 * Exercises the full runtime layer as a consumer would use it after Step 3:
 *
 *   Phase 2 exports:
 *     runtime.transcriptStore   — low-level re-export of transcript/store.js
 *     runtime.transcriptRecall  — low-level re-export of transcript/recall.js
 *
 *   Public API wrappers (singleton path):
 *     runtime.openTranscriptSession(sessionId, meta)
 *     runtime.appendTranscriptMessage(sessionId, message)
 *     runtime.recallTranscripts(query, options)
 *     runtime.resetTranscriptStore(store?)
 *
 * Isolation strategy:
 *   Each test group calls runtime.resetTranscriptStore(injectedStore) with a
 *   TranscriptStore backed by a dedicated tmpDir, so the real memory-bank/.local
 *   is never touched during test runs.
 *
 * Run: node test/runtime/transcript/runtime-index.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const runtime = require('../../../lib/runtime');
const { TranscriptStore } = runtime.transcriptStore;

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

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-rt-idx-'));

function tempDir(suffix) {
  const d = path.join(tmpBase, suffix);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Build an isolated TranscriptStore and inject it as the runtime singleton. */
function injectStore(suffix) {
  const store = new TranscriptStore({ dataDir: tempDir(suffix) });
  runtime.resetTranscriptStore(store);
  return store;
}

// ---------------------------------------------------------------------------
// Phase 2 exports
// ---------------------------------------------------------------------------

console.log('\nPhase 2 exports');

test('exports transcriptStore low-level module', () => {
  assert.ok(typeof runtime.transcriptStore === 'object');
  assert.ok(typeof runtime.transcriptStore.TranscriptStore === 'function');
  assert.ok(typeof runtime.transcriptStore.writeFileAtomic === 'function');
});

test('exports transcriptRecall low-level module', () => {
  assert.ok(typeof runtime.transcriptRecall === 'object');
  assert.ok(typeof runtime.transcriptRecall.recallTranscripts === 'function');
  assert.ok(typeof runtime.transcriptRecall.formatConversation === 'function');
  assert.ok(typeof runtime.transcriptRecall.truncateAroundMatches === 'function');
});

test('exports all Phase 2 public API functions', () => {
  assert.ok(typeof runtime.openTranscriptSession   === 'function');
  assert.ok(typeof runtime.appendTranscriptMessage === 'function');
  assert.ok(typeof runtime.recallTranscripts       === 'function');
  assert.ok(typeof runtime.resetTranscriptStore    === 'function');
});

// ---------------------------------------------------------------------------
// resetTranscriptStore injection
// ---------------------------------------------------------------------------

console.log('\nresetTranscriptStore');

test('called without args — clears singleton, next op initialises fresh store', () => {
  injectStore('rst-01');
  // confirm something was injected
  const r1 = runtime.recallTranscripts('anything');
  assert.strictEqual(typeof r1.found, 'boolean');

  // now clear
  runtime.resetTranscriptStore();
  // new recall on empty store is still safe (found:false, no throw)
  const r2 = runtime.recallTranscripts('anything');
  assert.strictEqual(r2.found, false);
});

test('called with a store instance — installs it as active singleton', () => {
  const store = new TranscriptStore({ dataDir: tempDir('rst-02') });
  store.openSession('inj-01', { source: 'test' });
  store.appendMessage('inj-01', { role: 'user', content: 'injected store works' });

  runtime.resetTranscriptStore(store);
  const r = runtime.recallTranscripts('injected store');
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.sessionCount, 1);
});

test('called with non-object arg — clears to null (treated as reset)', () => {
  injectStore('rst-03');
  runtime.resetTranscriptStore(null);
  const r = runtime.recallTranscripts('x');
  assert.strictEqual(r.found, false);   // empty store → not found, no throw
});

// ---------------------------------------------------------------------------
// openTranscriptSession
// ---------------------------------------------------------------------------

console.log('\nopenTranscriptSession');

test('success — returns { opened: true, session, diagnostics }', () => {
  injectStore('ots-01');
  const result = runtime.openTranscriptSession('sess-open-01', { source: 'test', title: 'My session' });
  assert.strictEqual(result.opened, true);
  assert.ok(result.session);
  assert.strictEqual(result.session.sessionId, 'sess-open-01');
  assert.strictEqual(typeof result.diagnostics, 'string');
  assert.ok(result.diagnostics.includes('sess-open-01'));
});

test('success — session record has expected fields', () => {
  injectStore('ots-02');
  const { session } = runtime.openTranscriptSession('sess-fields-01', {
    source: 'claude', title: 'Field test',
  });
  assert.strictEqual(session.sessionId, 'sess-fields-01');
  assert.strictEqual(session.source, 'claude');
  assert.strictEqual(session.title, 'Field test');
  assert.ok(session.startedAt);
  assert.strictEqual(session.messageCount, 0);
});

test('duplicate sessionId — store accepts it, wrapper returns { opened: true }', () => {
  // TranscriptStore does not enforce unique sessionIds (zero-dep simplicity).
  // openSession never throws for duplicates — both calls succeed.
  injectStore('ots-03');
  runtime.openTranscriptSession('sess-dup-01', {});
  const r2 = runtime.openTranscriptSession('sess-dup-01', {});
  assert.strictEqual(r2.opened, true);
  assert.ok(r2.session);
});

test('failure isolation — empty sessionId returns { opened: false }', () => {
  injectStore('ots-04');
  const r = runtime.openTranscriptSession('', {});
  assert.strictEqual(r.opened, false);
  assert.strictEqual(r.session, null);
});

// ---------------------------------------------------------------------------
// appendTranscriptMessage
// ---------------------------------------------------------------------------

console.log('\nappendTranscriptMessage');

test('success — returns { appended: true, message, diagnostics }', () => {
  injectStore('atm-01');
  runtime.openTranscriptSession('sess-atm-01', { source: 'test' });

  const result = runtime.appendTranscriptMessage('sess-atm-01', {
    role: 'user', content: 'hello world',
  });
  assert.strictEqual(result.appended, true);
  assert.ok(result.message);
  assert.strictEqual(result.message.role, 'user');
  assert.strictEqual(result.message.content, 'hello world');
  assert.ok(result.message.id);
  assert.ok(result.message.timestamp);
  assert.strictEqual(typeof result.diagnostics, 'string');
});

test('success — assistant message with toolCalls stored correctly', () => {
  injectStore('atm-02');
  runtime.openTranscriptSession('sess-atm-02', {});

  const result = runtime.appendTranscriptMessage('sess-atm-02', {
    role:      'assistant',
    content:   'Let me search for that.',
    toolCalls: [{ name: 'Grep', input: { pattern: 'foo' } }],
  });
  assert.strictEqual(result.appended, true);
  assert.strictEqual(result.message.role, 'assistant');
});

test('success — tool message with toolName stored correctly', () => {
  injectStore('atm-03');
  runtime.openTranscriptSession('sess-atm-03', {});

  const result = runtime.appendTranscriptMessage('sess-atm-03', {
    role:     'tool',
    toolName: 'Grep',
    content:  'Found 3 matches.',
  });
  assert.strictEqual(result.appended, true);
  assert.strictEqual(result.message.toolName, 'Grep');
});

test('unknown sessionId — store accepts orphan message, wrapper returns { appended: true }', () => {
  // TranscriptStore does not validate that a session record exists before
  // appending a message (zero-dep simplicity — no FK constraints in JSONL).
  injectStore('atm-04');
  const r = runtime.appendTranscriptMessage('no-such-session', { role: 'user', content: 'x' });
  assert.strictEqual(r.appended, true);
  assert.ok(r.message);
  assert.strictEqual(r.message.sessionId, 'no-such-session');
});

test('failure isolation — invalid role returns { appended: false }', () => {
  injectStore('atm-05');
  runtime.openTranscriptSession('sess-badrole', {});
  const r = runtime.appendTranscriptMessage('sess-badrole', {
    role: 'invalid_role', content: 'x',
  });
  assert.strictEqual(r.appended, false);
  assert.strictEqual(r.message, null);
});

// ---------------------------------------------------------------------------
// recallTranscripts
// ---------------------------------------------------------------------------

console.log('\nrecallTranscripts');

test('empty query — returns { found: false, sessionCount: 0 }', () => {
  injectStore('rt-01');
  const r = runtime.recallTranscripts('');
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.sessionCount, 0);
  assert.strictEqual(r.block, '');
  assert.ok(r.diagnostics.includes('Empty query'));
});

test('blank query — returns { found: false }', () => {
  injectStore('rt-02');
  const r = runtime.recallTranscripts('   ');
  assert.strictEqual(r.found, false);
});

test('no matching session — returns { found: false }', () => {
  injectStore('rt-03');
  runtime.openTranscriptSession('sess-rt-03', { source: 'test' });
  runtime.appendTranscriptMessage('sess-rt-03', { role: 'user', content: 'completely unrelated text' });

  const r = runtime.recallTranscripts('xyzzy_no_match');
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.sessionCount, 0);
  assert.ok(r.diagnostics.includes('No sessions found'));
});

test('match found — returns { found: true, block, sessionCount >= 1 }', () => {
  injectStore('rt-04');
  runtime.openTranscriptSession('sess-rt-04', { source: 'claude' });
  runtime.appendTranscriptMessage('sess-rt-04', { role: 'user', content: 'we decided to use JSONL format' });
  runtime.appendTranscriptMessage('sess-rt-04', { role: 'assistant', content: 'Correct, JSONL is the zero-dep choice.' });

  const r = runtime.recallTranscripts('JSONL format');
  assert.strictEqual(r.found, true);
  assert.ok(r.sessionCount >= 1);
  assert.ok(r.block.length > 0);
  assert.strictEqual(r.query, 'JSONL format');
});

test('block is fenced with <memory_context> tags', () => {
  injectStore('rt-05');
  runtime.openTranscriptSession('sess-rt-05', {});
  runtime.appendTranscriptMessage('sess-rt-05', { role: 'user', content: 'transcript recall test content' });

  const r = runtime.recallTranscripts('recall test content');
  assert.strictEqual(r.found, true);
  assert.ok(r.block.includes('<memory_context'), 'block must start with fenced tag');
  assert.ok(r.block.includes('</memory_context>'), 'block must end with fenced tag');
  assert.ok(r.block.includes('transcript-store'), 'block must include source provenance');
});

test('block contains matched content', () => {
  injectStore('rt-06');
  runtime.openTranscriptSession('sess-rt-06', {});
  runtime.appendTranscriptMessage('sess-rt-06', { role: 'user', content: 'atomic write via tempfile rename' });

  const r = runtime.recallTranscripts('tempfile rename');
  assert.strictEqual(r.found, true);
  assert.ok(r.block.includes('atomic write'), 'matched content should appear in block');
});

test('options.maxSessions limits results', () => {
  injectStore('rt-07');
  for (let i = 1; i <= 4; i++) {
    const sid = `sess-rt-07-${i}`;
    runtime.openTranscriptSession(sid, {});
    runtime.appendTranscriptMessage(sid, { role: 'user', content: `shared keyword for maxSessions test ${i}` });
  }

  const r = runtime.recallTranscripts('shared keyword for maxSessions', { maxSessions: 2 });
  assert.strictEqual(r.found, true);
  assert.ok(r.sessionCount <= 2, `expected <= 2 sessions, got ${r.sessionCount}`);
});

test('options.source filters by toolchain', () => {
  injectStore('rt-08');
  runtime.openTranscriptSession('sess-rt-08a', { source: 'claude' });
  runtime.appendTranscriptMessage('sess-rt-08a', { role: 'user', content: 'source filter keyword alpha' });
  runtime.openTranscriptSession('sess-rt-08b', { source: 'codex' });
  runtime.appendTranscriptMessage('sess-rt-08b', { role: 'user', content: 'source filter keyword alpha' });

  const r = runtime.recallTranscripts('source filter keyword alpha', { source: 'claude' });
  assert.strictEqual(r.found, true);
  // Only the claude session should match
  assert.strictEqual(r.sessionCount, 1);
});

test('diagnostics string describes the result', () => {
  injectStore('rt-09');
  runtime.openTranscriptSession('sess-rt-09', {});
  runtime.appendTranscriptMessage('sess-rt-09', { role: 'user', content: 'diagnostics check content' });

  const r = runtime.recallTranscripts('diagnostics check');
  assert.strictEqual(r.found, true);
  assert.ok(typeof r.diagnostics === 'string');
  assert.ok(r.diagnostics.length > 0);
});

// ---------------------------------------------------------------------------
// End-to-end pipeline
// ---------------------------------------------------------------------------

console.log('\nEnd-to-end pipeline');

test('open → append multiple messages → recall → fenced block contains session header', () => {
  injectStore('e2e-01');

  // 1. Open session
  const openResult = runtime.openTranscriptSession('e2e-sess-01', {
    source: 'claude', title: 'E2E test session',
  });
  assert.strictEqual(openResult.opened, true);

  // 2. Append a conversation
  runtime.appendTranscriptMessage('e2e-sess-01', { role: 'user',      content: 'How should we implement the runtime snapshot?' });
  runtime.appendTranscriptMessage('e2e-sess-01', { role: 'assistant', content: 'Use Object.freeze() to ensure mid-session immutability.' });
  runtime.appendTranscriptMessage('e2e-sess-01', { role: 'user',      content: 'What about transcript storage format?' });
  runtime.appendTranscriptMessage('e2e-sess-01', { role: 'assistant', content: 'JSONL for zero-dep compliance.' });

  // 3. Recall
  const r = runtime.recallTranscripts('runtime snapshot');
  assert.strictEqual(r.found, true);
  assert.ok(r.block.includes('<memory_context'));
  assert.ok(r.block.includes('</memory_context>'));
  assert.ok(r.block.includes('e2e-sess-01'), 'block must contain sessionId');
  assert.ok(r.block.includes('runtime snapshot') || r.block.includes('Object.freeze'), 'matched content present');
});

test('open → append → recall → block contains [USER] and [ASSISTANT] labels', () => {
  // search() returns only messages whose content contains the query.
  // To get both labels, the query must appear in both messages.
  injectStore('e2e-02');

  runtime.openTranscriptSession('e2e-sess-02', { source: 'test' });
  runtime.appendTranscriptMessage('e2e-sess-02', { role: 'user',      content: 'question about formatConversation labels' });
  runtime.appendTranscriptMessage('e2e-sess-02', { role: 'assistant', content: 'formatConversation labels map role to [USER]/[ASSISTANT] strings' });

  const r = runtime.recallTranscripts('formatConversation labels');
  assert.strictEqual(r.found, true);
  assert.ok(r.block.includes('[USER]'),      'USER label must appear in block');
  assert.ok(r.block.includes('[ASSISTANT]'), 'ASSISTANT label must appear in block');
});

test('failure mid-pipeline does not corrupt store or throw', () => {
  injectStore('e2e-03');

  runtime.openTranscriptSession('e2e-sess-03', {});
  runtime.appendTranscriptMessage('e2e-sess-03', { role: 'user', content: 'good message first' });

  // Attempt bad append (invalid role) — must not throw
  const bad = runtime.appendTranscriptMessage('e2e-sess-03', { role: 'BADTYPE', content: 'bad' });
  assert.strictEqual(bad.appended, false);

  // Store still works after failure
  const good = runtime.appendTranscriptMessage('e2e-sess-03', { role: 'assistant', content: 'recovery after bad append' });
  assert.strictEqual(good.appended, true);

  const r = runtime.recallTranscripts('recovery after bad append');
  assert.strictEqual(r.found, true);
});

test('reset between test groups does not bleed sessions across groups', () => {
  injectStore('e2e-04a');
  runtime.openTranscriptSession('bleed-01', {});
  runtime.appendTranscriptMessage('bleed-01', { role: 'user', content: 'session from group A should not bleed' });

  // Switch to fresh store for group B
  injectStore('e2e-04b');
  const r = runtime.recallTranscripts('session from group A');
  assert.strictEqual(r.found, false, 'sessions from previous store must not bleed into new store');
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

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
