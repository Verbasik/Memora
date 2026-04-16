'use strict';

/**
 * Tests for lib/runtime/transcript/store.js
 *
 * Covers:
 *   - writeFileAtomic: atomic write, cleanup on failure, creates parent dirs
 *   - readJsonl / appendJsonl: round-trip, empty file, ENOENT
 *   - TranscriptStore.openSession: creates record, validates sessionId
 *   - TranscriptStore.closeSession: sets endedAt, atomic rewrite, title update
 *   - TranscriptStore.getSession: finds by id, returns null for missing
 *   - TranscriptStore.listSessions: ordering, limit, source filter
 *   - TranscriptStore.appendMessage: creates record with id, increments messageCount
 *   - TranscriptStore.getMessages: returns ordered messages for session
 *   - TranscriptStore.search: substring match, grouping, maxSessions, empty query
 *
 * Run: node test/runtime/transcript/store.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { TranscriptStore, writeFileAtomic, readJsonl, appendJsonl } =
  require('../../../lib/runtime/transcript/store');

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

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-ts-test-'));

function tempDir(suffix) {
  const d = path.join(tmpBase, suffix);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function makeStore(suffix) {
  return new TranscriptStore({ dataDir: tempDir(suffix) });
}

// ---------------------------------------------------------------------------
// writeFileAtomic
// ---------------------------------------------------------------------------

console.log('\nwriteFileAtomic');

test('writes content to target file', () => {
  const dir  = tempDir('wfa-basic');
  const file = path.join(dir, 'out.txt');
  writeFileAtomic(file, 'hello atomic');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello atomic');
});

test('overwrites existing file atomically', () => {
  const dir  = tempDir('wfa-overwrite');
  const file = path.join(dir, 'out.txt');
  fs.writeFileSync(file, 'old content', 'utf8');
  writeFileAtomic(file, 'new content');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new content');
});

test('creates parent directory if missing', () => {
  const dir  = path.join(tmpBase, 'wfa-mkdir', 'nested', 'deep');
  const file = path.join(dir, 'out.txt');
  writeFileAtomic(file, 'deep write');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'deep write');
});

test('leaves no temp file on success', () => {
  const dir  = tempDir('wfa-no-tmp');
  const file = path.join(dir, 'out.txt');
  writeFileAtomic(file, 'content');
  const files = fs.readdirSync(dir);
  assert.ok(files.every(f => !f.includes('.tmp.')), `unexpected tmp file in ${files}`);
});

// ---------------------------------------------------------------------------
// readJsonl / appendJsonl
// ---------------------------------------------------------------------------

console.log('\nreadJsonl / appendJsonl');

test('returns empty array for missing file', () => {
  const file = path.join(tmpBase, 'nonexistent-' + Date.now() + '.jsonl');
  assert.deepStrictEqual(readJsonl(file), []);
});

test('round-trips a single object', () => {
  const file = path.join(tempDir('rj-single'), 'data.jsonl');
  appendJsonl(file, { key: 'value', num: 42 });
  const result = readJsonl(file);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].key, 'value');
  assert.strictEqual(result[0].num, 42);
});

test('round-trips multiple objects in order', () => {
  const file = path.join(tempDir('rj-multi'), 'data.jsonl');
  appendJsonl(file, { n: 1 });
  appendJsonl(file, { n: 2 });
  appendJsonl(file, { n: 3 });
  const result = readJsonl(file);
  assert.deepStrictEqual(result.map(r => r.n), [1, 2, 3]);
});

test('handles UTF-8 content including Cyrillic', () => {
  const file = path.join(tempDir('rj-utf8'), 'data.jsonl');
  appendJsonl(file, { text: 'Пользователь работает с Python и Node.js.' });
  const result = readJsonl(file);
  assert.ok(result[0].text.includes('Пользователь'));
});

// ---------------------------------------------------------------------------
// TranscriptStore.openSession
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.openSession');

test('creates a session record with required fields', () => {
  const store   = makeStore('open-basic');
  const session = store.openSession('sess-001');
  assert.strictEqual(session.sessionId, 'sess-001');
  assert.strictEqual(session.messageCount, 0);
  assert.strictEqual(session.endedAt, null);
  assert.ok(session.startedAt);
  assert.ok(session.projectDir);
  assert.ok(session.source);
});

test('accepts meta: source, projectDir, title', () => {
  const store   = makeStore('open-meta');
  const session = store.openSession('sess-002', {
    source:     'claude',
    projectDir: '/tmp/my-project',
    title:      'Sprint planning session',
  });
  assert.strictEqual(session.source, 'claude');
  assert.ok(session.projectDir.includes('my-project'));
  assert.strictEqual(session.title, 'Sprint planning session');
});

test('normalises unknown source to "unknown"', () => {
  const store   = makeStore('open-src');
  const session = store.openSession('sess-003', { source: 'unknown-tool' });
  assert.strictEqual(session.source, 'unknown');
});

test('throws TypeError for empty sessionId', () => {
  const store = makeStore('open-err');
  assert.throws(() => store.openSession(''), TypeError);
  assert.throws(() => store.openSession(null), TypeError);
  assert.throws(() => store.openSession(123), TypeError);
});

test('persists session to disk immediately', () => {
  const store = makeStore('open-persist');
  store.openSession('sess-004');
  const onDisk = readJsonl(store.sessionsFile);
  assert.strictEqual(onDisk.length, 1);
  assert.strictEqual(onDisk[0].sessionId, 'sess-004');
});

// ---------------------------------------------------------------------------
// TranscriptStore.closeSession
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.closeSession');

test('sets endedAt on close', () => {
  const store = makeStore('close-basic');
  store.openSession('sess-010');
  const closed = store.closeSession('sess-010');
  assert.ok(closed.endedAt !== null);
  assert.ok(typeof closed.endedAt === 'string');
});

test('updates title on close if provided', () => {
  const store = makeStore('close-title');
  store.openSession('sess-011', { title: 'old title' });
  const closed = store.closeSession('sess-011', { title: 'final title' });
  assert.strictEqual(closed.title, 'final title');
});

test('returns null when session not found', () => {
  const store = makeStore('close-missing');
  const result = store.closeSession('does-not-exist');
  assert.strictEqual(result, null);
});

test('close persists endedAt to disk atomically', () => {
  const store = makeStore('close-disk');
  store.openSession('sess-012');
  store.closeSession('sess-012');
  const onDisk = readJsonl(store.sessionsFile);
  assert.strictEqual(onDisk.length, 1);
  assert.ok(onDisk[0].endedAt !== null);
});

// ---------------------------------------------------------------------------
// TranscriptStore.getSession
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.getSession');

test('retrieves session by id', () => {
  const store = makeStore('get-basic');
  store.openSession('sess-020', { source: 'codex' });
  const found = store.getSession('sess-020');
  assert.strictEqual(found.sessionId, 'sess-020');
  assert.strictEqual(found.source, 'codex');
});

test('returns null for unknown session id', () => {
  const store = makeStore('get-missing');
  assert.strictEqual(store.getSession('nope'), null);
});

test('reflects closed state after closeSession', () => {
  const store = makeStore('get-after-close');
  store.openSession('sess-021');
  store.closeSession('sess-021');
  const found = store.getSession('sess-021');
  assert.ok(found.endedAt !== null);
});

// ---------------------------------------------------------------------------
// TranscriptStore.listSessions
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.listSessions');

test('returns sessions ordered by startedAt descending', () => {
  const store = makeStore('list-order');
  store.openSession('s-a');
  store.openSession('s-b');
  store.openSession('s-c');
  const list = store.listSessions();
  assert.strictEqual(list[0].sessionId, 's-c');
  assert.strictEqual(list[list.length - 1].sessionId, 's-a');
});

test('respects limit option', () => {
  const store = makeStore('list-limit');
  for (let i = 0; i < 10; i++) store.openSession(`lim-${i}`);
  const list = store.listSessions({ limit: 3 });
  assert.strictEqual(list.length, 3);
});

test('filters by source', () => {
  const store = makeStore('list-src');
  store.openSession('ls-claude', { source: 'claude' });
  store.openSession('ls-codex',  { source: 'codex' });
  store.openSession('ls-claude2', { source: 'claude' });
  const claudeOnly = store.listSessions({ source: 'claude' });
  assert.strictEqual(claudeOnly.length, 2);
  assert.ok(claudeOnly.every(s => s.source === 'claude'));
});

test('returns empty array when no sessions exist', () => {
  const store = makeStore('list-empty');
  assert.deepStrictEqual(store.listSessions(), []);
});

// ---------------------------------------------------------------------------
// TranscriptStore.appendMessage
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.appendMessage');

test('creates a message record with required fields', () => {
  const store = makeStore('msg-basic');
  store.openSession('msg-sess-001');
  const msg = store.appendMessage('msg-sess-001', {
    role:    'user',
    content: 'Hello from user',
  });
  assert.strictEqual(msg.sessionId, 'msg-sess-001');
  assert.strictEqual(msg.role, 'user');
  assert.strictEqual(msg.content, 'Hello from user');
  assert.strictEqual(msg.toolName, null);
  assert.strictEqual(msg.toolCalls, null);
  assert.ok(typeof msg.id === 'number');
  assert.ok(msg.timestamp);
});

test('assigns sequential message IDs', () => {
  const store = makeStore('msg-ids');
  store.openSession('msg-sess-002');
  const m1 = store.appendMessage('msg-sess-002', { role: 'user',      content: 'first' });
  const m2 = store.appendMessage('msg-sess-002', { role: 'assistant', content: 'second' });
  assert.strictEqual(m2.id, m1.id + 1);
});

test('increments session messageCount after append', () => {
  const store = makeStore('msg-count');
  store.openSession('msg-sess-003');
  store.appendMessage('msg-sess-003', { role: 'user',      content: 'one' });
  store.appendMessage('msg-sess-003', { role: 'assistant', content: 'two' });
  const session = store.getSession('msg-sess-003');
  assert.strictEqual(session.messageCount, 2);
});

test('stores tool-role message with toolName and toolCalls', () => {
  const store = makeStore('msg-tool');
  store.openSession('msg-sess-004');
  const msg = store.appendMessage('msg-sess-004', {
    role:      'tool',
    content:   'result: 42',
    toolName:  'calculate',
    toolCalls: [{ name: 'calculate', args: { x: 1 } }],
  });
  assert.strictEqual(msg.toolName, 'calculate');
  assert.ok(typeof msg.toolCalls === 'string');
  const tc = JSON.parse(msg.toolCalls);
  assert.strictEqual(tc[0].name, 'calculate');
});

test('accepts pre-serialized string toolCalls', () => {
  const store = makeStore('msg-tool-str');
  store.openSession('msg-sess-005');
  const raw = '[{"name":"search"}]';
  const msg = store.appendMessage('msg-sess-005', {
    role:      'assistant',
    toolCalls: raw,
  });
  assert.strictEqual(msg.toolCalls, raw);
});

test('throws TypeError for invalid role', () => {
  const store = makeStore('msg-role-err');
  store.openSession('msg-sess-006');
  assert.throws(
    () => store.appendMessage('msg-sess-006', { role: 'invalid', content: 'x' }),
    TypeError
  );
});

test('throws TypeError for empty sessionId', () => {
  const store = makeStore('msg-sid-err');
  assert.throws(
    () => store.appendMessage('', { role: 'user', content: 'x' }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// TranscriptStore.getMessages
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.getMessages');

test('returns messages for session in id order', () => {
  const store = makeStore('getmsg-basic');
  store.openSession('gm-sess');
  store.appendMessage('gm-sess', { role: 'user',      content: 'A' });
  store.appendMessage('gm-sess', { role: 'assistant', content: 'B' });
  store.appendMessage('gm-sess', { role: 'user',      content: 'C' });
  const msgs = store.getMessages('gm-sess');
  assert.strictEqual(msgs.length, 3);
  assert.strictEqual(msgs[0].content, 'A');
  assert.strictEqual(msgs[2].content, 'C');
});

test('returns empty array for session with no messages', () => {
  const store = makeStore('getmsg-empty');
  store.openSession('gm-empty');
  assert.deepStrictEqual(store.getMessages('gm-empty'), []);
});

test('isolates messages between sessions', () => {
  const store = makeStore('getmsg-iso');
  store.openSession('gm-a');
  store.openSession('gm-b');
  store.appendMessage('gm-a', { role: 'user', content: 'from A' });
  store.appendMessage('gm-b', { role: 'user', content: 'from B' });
  const msgsA = store.getMessages('gm-a');
  const msgsB = store.getMessages('gm-b');
  assert.strictEqual(msgsA.length, 1);
  assert.strictEqual(msgsA[0].content, 'from A');
  assert.strictEqual(msgsB.length, 1);
  assert.strictEqual(msgsB[0].content, 'from B');
});

// ---------------------------------------------------------------------------
// TranscriptStore.search
// ---------------------------------------------------------------------------

console.log('\nTranscriptStore.search');

test('returns empty array for empty query', () => {
  const store = makeStore('srch-empty');
  store.openSession('srch-s1');
  store.appendMessage('srch-s1', { role: 'user', content: 'something' });
  assert.deepStrictEqual(store.search(''), []);
  assert.deepStrictEqual(store.search('   '), []);
});

test('finds messages by substring (case-insensitive)', () => {
  const store = makeStore('srch-basic');
  store.openSession('srch-s2');
  store.appendMessage('srch-s2', { role: 'user',      content: 'We decided to use SQLite for the transcript store.' });
  store.appendMessage('srch-s2', { role: 'assistant', content: 'Got it, SQLite with WAL mode.' });
  const results = store.search('sqlite');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].session.sessionId, 'srch-s2');
  assert.strictEqual(results[0].messages.length, 2);
});

test('returns no results when query does not match', () => {
  const store = makeStore('srch-nomatch');
  store.openSession('srch-s3');
  store.appendMessage('srch-s3', { role: 'user', content: 'totally unrelated content' });
  const results = store.search('xyzzy-not-present');
  assert.strictEqual(results.length, 0);
});

test('groups matches by session', () => {
  const store = makeStore('srch-group');
  store.openSession('sg-1');
  store.openSession('sg-2');
  store.appendMessage('sg-1', { role: 'user', content: 'runtime layer design' });
  store.appendMessage('sg-2', { role: 'user', content: 'runtime layer tests' });
  const results = store.search('runtime');
  assert.strictEqual(results.length, 2);
});

test('respects maxSessions option', () => {
  const store = makeStore('srch-maxsess');
  for (let i = 0; i < 8; i++) {
    store.openSession(`ms-${i}`);
    store.appendMessage(`ms-${i}`, { role: 'user', content: `keyword occurrence ${i}` });
  }
  const results = store.search('keyword', { maxSessions: 3 });
  assert.strictEqual(results.length, 3);
});

test('filters by source when provided', () => {
  const store = makeStore('srch-src');
  store.openSession('ss-claude', { source: 'claude' });
  store.openSession('ss-codex',  { source: 'codex' });
  store.appendMessage('ss-claude', { role: 'user', content: 'runtime security layer' });
  store.appendMessage('ss-codex',  { role: 'user', content: 'runtime security scan' });
  const results = store.search('runtime', { source: 'claude' });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].session.sessionId, 'ss-claude');
});

test('skips messages with null content', () => {
  const store = makeStore('srch-null');
  store.openSession('sn-1');
  store.appendMessage('sn-1', { role: 'assistant', toolName: 'search' }); // content null
  const results = store.search('search');
  assert.strictEqual(results.length, 0);
});

test('search result messages are ordered by id', () => {
  const store = makeStore('srch-order');
  store.openSession('so-1');
  store.appendMessage('so-1', { role: 'user',      content: 'sprint planning discussion' });
  store.appendMessage('so-1', { role: 'assistant', content: 'noted sprint planning tasks' });
  const results = store.search('sprint');
  const msgs = results[0].messages;
  for (let i = 1; i < msgs.length; i++) {
    assert.ok(msgs[i].id > msgs[i - 1].id, 'messages should be in ascending id order');
  }
});

// ---------------------------------------------------------------------------
// Cross-store isolation (same dataDir, fresh instance — simulates restart)
// ---------------------------------------------------------------------------

console.log('\nCross-instance persistence');

test('data persists across store instances (simulates restart)', () => {
  const dir    = tempDir('persist');
  const store1 = new TranscriptStore({ dataDir: dir });
  store1.openSession('persist-sess', { source: 'claude', title: 'My session' });
  store1.appendMessage('persist-sess', { role: 'user', content: 'remember this' });
  store1.closeSession('persist-sess');

  // Simulate restart — create new store pointing to same dataDir
  const store2 = new TranscriptStore({ dataDir: dir });
  const found  = store2.getSession('persist-sess');
  assert.ok(found !== null, 'session should be found in store2');
  assert.strictEqual(found.source, 'claude');
  assert.ok(found.endedAt !== null, 'endedAt should persist');

  const msgs = store2.getMessages('persist-sess');
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].content, 'remember this');
});

test('search works on data written by a different store instance', () => {
  const dir    = tempDir('persist-search');
  const store1 = new TranscriptStore({ dataDir: dir });
  store1.openSession('ps-sess');
  store1.appendMessage('ps-sess', { role: 'user', content: 'frozen snapshot semantics' });

  const store2   = new TranscriptStore({ dataDir: dir });
  const results  = store2.search('frozen snapshot');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].messages[0].content, 'frozen snapshot semantics');
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

if (failed > 0) process.exit(1);
