'use strict';

/**
 * test/runtime/native-sync.test.js
 *
 * Unit tests for lib/runtime/transcript/native-sync.js.
 * All file I/O uses os.tmpdir() temp files; no real memory-bank writes.
 * The rt module is injected as a fake to avoid TranscriptStore singleton touches.
 */

const assert = require('assert');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');

const nativeSync = require('../../lib/runtime/transcript/native-sync');

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
// Helper — fake rt with injectable pre-existing messages
// ---------------------------------------------------------------------------

function makeFakeRt(opts = {}) {
  const existingMessages = opts.existingMessages || [];
  const appended         = [];

  return {
    _getTranscriptStoreForSync: () => ({
      getMessages() { return existingMessages; },
    }),
    appendTranscriptMessage(sessionId, msg) {
      appended.push({ sessionId, ...msg });
      return { appended: true, diagnostics: 'ok' };
    },
    _appended: appended,
  };
}

function writeTmpJsonl(lines) {
  const tmpFile = path.join(os.tmpdir(), `memora-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(tmpFile, lines.join('\n') + '\n');
  return tmpFile;
}

// ── syncFromPath — guard cases ────────────────────────────────────────────────

console.log('\nnativeSync.syncFromPath — guards');

test('returns {synced:0} when sessionId is missing', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.syncFromPath('', '/tmp/fake.jsonl', { rt });
  assert.strictEqual(r.synced, 0);
  assert.ok(r.diagnostics.includes('sessionId required'));
});

test('returns {synced:0} when transcriptPath is missing', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.syncFromPath('sess-001', '', { rt });
  assert.strictEqual(r.synced, 0);
  assert.ok(r.diagnostics.includes('transcriptPath required'));
});

test('returns {synced:0} when transcript file does not exist', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.syncFromPath('sess-001', '/tmp/no-such-memora-file-xyz.jsonl', { rt });
  assert.strictEqual(r.synced, 0);
  assert.ok(r.diagnostics.includes('cannot read'));
});

// ── syncFromPath — Claude JSONL format ──────────────────────────────────────

console.log('\nnativeSync.syncFromPath — Claude JSONL');

test('syncs Claude format with string content', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ type: 'user',      message: { content: 'Hello from user' },      uuid: 'u1', timestamp: '2026-01-01T00:00:00Z' }),
    JSON.stringify({ type: 'assistant', message: { content: 'Hello from assistant' }, uuid: 'a1', timestamp: '2026-01-01T00:00:01Z' }),
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 2);
    assert.strictEqual(r.skipped, 0);
    assert.strictEqual(rt._appended.length, 2);
    assert.strictEqual(rt._appended[0].role, 'user');
    assert.strictEqual(rt._appended[0].content, 'Hello from user');
    assert.strictEqual(rt._appended[1].role, 'assistant');
    assert.strictEqual(rt._appended[1].content, 'Hello from assistant');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('syncs Claude format with array content blocks', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Block user message' }, { type: 'text', text: 'Second part' }] }, uuid: 'u2' }),
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 1);
    assert.ok(rt._appended[0].content.includes('Block user message'));
    assert.ok(rt._appended[0].content.includes('Second part'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('skips Claude entries with no recognizable content', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ type: 'user', message: { content: '' }, uuid: 'u3' }),        // empty string
    JSON.stringify({ type: 'assistant', message: { content: [] }, uuid: 'a2' }),   // empty array
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 0);
  } finally {
    fs.unlinkSync(tmp);
  }
});

// ── syncFromPath — Codex JSONL format ────────────────────────────────────────

console.log('\nnativeSync.syncFromPath — Codex JSONL');

test('syncs Codex format with string content', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ role: 'user',      content: 'Codex user message',    id: 'c1' }),
    JSON.stringify({ role: 'assistant', content: 'Codex assistant reply', id: 'c2' }),
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 2);
    assert.strictEqual(rt._appended[0].role, 'user');
    assert.strictEqual(rt._appended[1].role, 'assistant');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('ignores Codex entries with system role', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ role: 'system',    content: 'System injected context' }),
    JSON.stringify({ role: 'user',      content: 'Real user message' }),
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    // system role is not in VALID_ROLES for extraction — only user/assistant pass
    assert.strictEqual(r.synced, 1);
    assert.strictEqual(rt._appended[0].role, 'user');
  } finally {
    fs.unlinkSync(tmp);
  }
});

// ── syncFromPath — deduplication ──────────────────────────────────────────────

console.log('\nnativeSync.syncFromPath — deduplication');

test('second sync with same file is fully deduplicated', () => {
  const tmp = writeTmpJsonl([
    JSON.stringify({ role: 'user', content: 'Same message' }),
  ]);

  try {
    // First sync
    const rt1 = makeFakeRt();
    const r1  = nativeSync.syncFromPath('sess-001', tmp, { rt: rt1 });
    assert.strictEqual(r1.synced, 1);

    // Second sync — existing messages now include the one we just appended
    const rt2 = makeFakeRt({ existingMessages: [{ role: 'user', content: 'Same message' }] });
    const r2  = nativeSync.syncFromPath('sess-001', tmp, { rt: rt2 });
    assert.strictEqual(r2.synced, 0);
    assert.strictEqual(r2.skipped, 1);
    assert.strictEqual(rt2._appended.length, 0);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('skips malformed JSON lines and processes valid ones', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    'NOT_JSON',
    JSON.stringify({ role: 'user', content: 'Valid message' }),
    '{broken json',
    '',
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 1);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('returns {synced:0} when all lines are non-user/assistant entries', () => {
  const rt  = makeFakeRt();
  const tmp = writeTmpJsonl([
    JSON.stringify({ type: 'tool_use', input: { command: 'ls' } }),
    JSON.stringify({ type: 'tool_result', content: 'file1.txt' }),
  ]);

  try {
    const r = nativeSync.syncFromPath('sess-001', tmp, { rt });
    assert.strictEqual(r.synced, 0);
    assert.strictEqual(rt._appended.length, 0);
  } finally {
    fs.unlinkSync(tmp);
  }
});

// ── appendMessage ──────────────────────────────────────────────────────────────

console.log('\nnativeSync.appendMessage');

test('appends valid user message', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.appendMessage('sess-001', 'user', 'Test prompt', { rt });
  assert.strictEqual(r.appended, true);
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(rt._appended.length, 1);
  assert.strictEqual(rt._appended[0].role, 'user');
  assert.strictEqual(rt._appended[0].content, 'Test prompt');
});

test('appends valid assistant message', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.appendMessage('sess-001', 'assistant', 'Response text', { rt });
  assert.strictEqual(r.appended, true);
  assert.strictEqual(rt._appended[0].role, 'assistant');
});

test('returns invalid args when sessionId is missing', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.appendMessage('', 'user', 'hello', { rt });
  assert.strictEqual(r.appended, false);
  assert.strictEqual(r.skipped, false);
  assert.ok(r.diagnostics.includes('invalid args'));
});

test('returns invalid args when role is not user or assistant', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.appendMessage('sess-001', 'system', 'hello', { rt });
  assert.strictEqual(r.appended, false);
  assert.ok(r.diagnostics.includes('invalid args'));
});

test('returns invalid args when content is empty/whitespace', () => {
  const rt = makeFakeRt();
  const r  = nativeSync.appendMessage('sess-001', 'user', '   ', { rt });
  assert.strictEqual(r.appended, false);
  assert.ok(r.diagnostics.includes('invalid args'));
});

test('deduplication — returns {skipped:true} for duplicate message', () => {
  const rt = makeFakeRt({ existingMessages: [{ role: 'user', content: 'Already seen' }] });
  const r  = nativeSync.appendMessage('sess-001', 'user', 'Already seen', { rt });
  assert.strictEqual(r.appended, false);
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(rt._appended.length, 0);
});

test('deduplication normalises whitespace — "a  b" and "a b" are the same fingerprint', () => {
  // The fingerprint normalises /\s+/g → ' ', so multi-space and single-space match
  const rt = makeFakeRt({ existingMessages: [{ role: 'user', content: 'hello   world' }] });
  const r  = nativeSync.appendMessage('sess-001', 'user', 'hello world', { rt });
  assert.strictEqual(r.skipped, true, 'normalised whitespace must match existing fingerprint');
});

test('different roles are not deduplicated against each other', () => {
  const rt = makeFakeRt({ existingMessages: [{ role: 'user', content: 'Same text' }] });
  const r  = nativeSync.appendMessage('sess-001', 'assistant', 'Same text', { rt });
  assert.strictEqual(r.appended, true, 'user:text and assistant:text are different fingerprints');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
