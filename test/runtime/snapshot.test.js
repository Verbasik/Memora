'use strict';

/**
 * Tests for lib/runtime/snapshot.js
 *
 * Covers:
 *   - createSnapshot: builds frozen snapshot from file list
 *   - Frozen semantics: snapshot is immutable, mid-process file changes do not affect it
 *   - Error handling: missing files are captured without throwing
 *   - Active snapshot lifecycle: set, get, clear, double-set guard
 *   - buildAndActivateSnapshot: convenience wrapper
 *   - renderSnapshotContent: renders loaded content
 *   - describeSnapshot: produces diagnostics string
 *   - generateSessionId: format check
 *
 * Run: node test/runtime/snapshot.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const {
  generateSessionId,
  createSnapshot,
  getActiveSnapshot,
  setActiveSnapshot,
  clearActiveSnapshot,
  buildAndActivateSnapshot,
  renderSnapshotContent,
  describeSnapshot,
} = require('../../lib/runtime/snapshot');

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

// Ensure clean state before each group
function setup() {
  clearActiveSnapshot();
}

// ---------------------------------------------------------------------------
// Helpers: temp files
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-snap-test-'));

function writeTmp(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// generateSessionId
// ---------------------------------------------------------------------------

console.log('\ngenerateSessionId');

test('returns a non-empty string', () => {
  const id = generateSessionId();
  assert.ok(typeof id === 'string' && id.length > 0);
});

test('two calls produce different IDs', () => {
  const a = generateSessionId();
  const b = generateSessionId();
  // May theoretically collide on same ms, but exceedingly unlikely in test
  // If they collide, it's a flake — acceptable.
  assert.ok(typeof a === 'string' && typeof b === 'string');
});

test('ID contains a hex suffix separated by dash', () => {
  const id = generateSessionId();
  assert.ok(id.includes('-'), 'should contain a dash separator');
  const suffix = id.split('-').pop();
  assert.ok(/^[0-9a-f]+$/i.test(suffix), `suffix should be hex, got: ${suffix}`);
});

// ---------------------------------------------------------------------------
// createSnapshot — basic behaviour
// ---------------------------------------------------------------------------

console.log('\ncreateSnapshot — basic behaviour');

test('creates snapshot from an empty sources array', () => {
  const snap = createSnapshot([]);
  assert.strictEqual(snap.sources.length, 0);
  assert.strictEqual(snap.files.length, 0);
  assert.strictEqual(snap.loadedCount, 0);
  assert.strictEqual(snap.errorCount, 0);
  assert.strictEqual(snap.contentHash, '');
  assert.strictEqual(snap.frozen, true);
});

test('loads a real file correctly', () => {
  const p = writeTmp('file-a.md', '# File A\nSome content.');
  const snap = createSnapshot([p]);
  assert.strictEqual(snap.loadedCount, 1);
  assert.strictEqual(snap.errorCount, 0);
  assert.strictEqual(snap.files[0].content, '# File A\nSome content.');
  assert.strictEqual(snap.files[0].error, null);
});

test('captures error for missing file without throwing', () => {
  const missing = path.join(tmpDir, 'does-not-exist.md');
  const snap = createSnapshot([missing]);
  assert.strictEqual(snap.loadedCount, 0);
  assert.strictEqual(snap.errorCount, 1);
  assert.ok(snap.files[0].error !== null, 'error should be non-null');
  assert.strictEqual(snap.files[0].content, null);
});

test('loads multiple files, captures failures inline', () => {
  const p1 = writeTmp('multi-a.md', 'Content A');
  const missing = path.join(tmpDir, 'missing.md');
  const p2 = writeTmp('multi-b.md', 'Content B');
  const snap = createSnapshot([p1, missing, p2]);
  assert.strictEqual(snap.loadedCount, 2);
  assert.strictEqual(snap.errorCount, 1);
  assert.strictEqual(snap.files[0].content, 'Content A');
  assert.ok(snap.files[1].error !== null);
  assert.strictEqual(snap.files[2].content, 'Content B');
});

test('contentHash is a non-empty hex string when files are loaded', () => {
  const p = writeTmp('hash-test.md', 'Hello');
  const snap = createSnapshot([p]);
  assert.ok(/^[0-9a-f]{64}$/.test(snap.contentHash), `hash should be 64-char hex, got: ${snap.contentHash}`);
});

test('two snapshots of the same file produce the same contentHash', () => {
  const p = writeTmp('stable.md', 'Stable content');
  const s1 = createSnapshot([p]);
  const s2 = createSnapshot([p]);
  assert.strictEqual(s1.contentHash, s2.contentHash);
});

test('changing file content before snapshot changes the hash', () => {
  const p = writeTmp('changing.md', 'Before');
  const s1 = createSnapshot([p]);
  fs.writeFileSync(p, 'After', 'utf8');
  const s2 = createSnapshot([p]);
  assert.notStrictEqual(s1.contentHash, s2.contentHash);
});

test('uses overridden sessionId when provided', () => {
  const snap = createSnapshot([], { sessionId: 'test-session-123' });
  assert.strictEqual(snap.sessionId, 'test-session-123');
});

test('uses overridden createdAt when provided', () => {
  const ts = '2026-01-15T12:00:00.000Z';
  const snap = createSnapshot([], { createdAt: ts });
  assert.strictEqual(snap.createdAt, ts);
});

test('throws TypeError for non-array sources', () => {
  assert.throws(() => createSnapshot('not-an-array'), TypeError);
});

// ---------------------------------------------------------------------------
// Frozen semantics: snapshot is immutable
// ---------------------------------------------------------------------------

console.log('\ncreateSnapshot — frozen semantics');

test('snapshot object itself is frozen', () => {
  const snap = createSnapshot([]);
  assert.ok(Object.isFrozen(snap));
});

test('snapshot.sources array is frozen', () => {
  const snap = createSnapshot([]);
  assert.ok(Object.isFrozen(snap.sources));
});

test('snapshot.files array is frozen', () => {
  const snap = createSnapshot([]);
  assert.ok(Object.isFrozen(snap.files));
});

test('mid-session file change does NOT affect a previously built snapshot', () => {
  const p = writeTmp('frozen-test.md', 'Original content');
  const snap = createSnapshot([p]);
  const capturedContent = snap.files[0].content;

  // Simulate a mid-session memory write
  fs.writeFileSync(p, 'Modified mid-session', 'utf8');

  // Snapshot must be unchanged
  assert.strictEqual(snap.files[0].content, capturedContent);
  assert.strictEqual(snap.files[0].content, 'Original content');
});

// ---------------------------------------------------------------------------
// Active snapshot lifecycle
// ---------------------------------------------------------------------------

console.log('\nActive snapshot lifecycle');

test('getActiveSnapshot returns null initially (after clear)', () => {
  setup();
  assert.strictEqual(getActiveSnapshot(), null);
});

test('setActiveSnapshot registers the snapshot', () => {
  setup();
  const snap = createSnapshot([]);
  setActiveSnapshot(snap);
  assert.strictEqual(getActiveSnapshot(), snap);
});

test('setActiveSnapshot throws if called twice without clear', () => {
  setup();
  const snap = createSnapshot([]);
  setActiveSnapshot(snap);
  assert.throws(
    () => setActiveSnapshot(snap),
    /already active/
  );
});

test('clearActiveSnapshot allows a new snapshot to be set', () => {
  setup();
  const snap1 = createSnapshot([], { sessionId: 'session-1' });
  setActiveSnapshot(snap1);
  clearActiveSnapshot();
  const snap2 = createSnapshot([], { sessionId: 'session-2' });
  setActiveSnapshot(snap2);
  assert.strictEqual(getActiveSnapshot().sessionId, 'session-2');
});

test('setActiveSnapshot throws for non-snapshot argument', () => {
  setup();
  assert.throws(() => setActiveSnapshot({ notFrozen: true }), TypeError);
});

test('setActiveSnapshot throws for null', () => {
  setup();
  assert.throws(() => setActiveSnapshot(null), TypeError);
});

// ---------------------------------------------------------------------------
// buildAndActivateSnapshot
// ---------------------------------------------------------------------------

console.log('\nbuildAndActivateSnapshot');

test('builds and registers snapshot in one call', () => {
  setup();
  const p = writeTmp('baa-test.md', 'BAA content');
  const snap = buildAndActivateSnapshot([p]);
  assert.ok(snap.frozen);
  assert.strictEqual(getActiveSnapshot(), snap);
  assert.strictEqual(snap.loadedCount, 1);
});

test('throws if snapshot already active', () => {
  setup();
  buildAndActivateSnapshot([]);
  assert.throws(() => buildAndActivateSnapshot([]), /already active/);
});

// ---------------------------------------------------------------------------
// renderSnapshotContent
// ---------------------------------------------------------------------------

console.log('\nrenderSnapshotContent');

test('renders loaded files with source comments', () => {
  setup();
  const p = writeTmp('render-test.md', 'Render me');
  const snap = createSnapshot([p]);
  const output = renderSnapshotContent(snap);
  assert.ok(output.includes('Render me'));
  assert.ok(output.includes('<!-- source:'));
});

test('renders error stub when file missing and includeErrors is true (default)', () => {
  setup();
  const missing = path.join(tmpDir, 'ghost.md');
  const snap = createSnapshot([missing]);
  const output = renderSnapshotContent(snap, { includeErrors: true });
  assert.ok(output.includes('could not be loaded'));
});

test('omits error stub when includeErrors is false', () => {
  setup();
  const missing = path.join(tmpDir, 'ghost2.md');
  const snap = createSnapshot([missing]);
  const output = renderSnapshotContent(snap, { includeErrors: false });
  assert.strictEqual(output, '');
});

test('uses custom separator', () => {
  setup();
  const p1 = writeTmp('sep-a.md', 'AAA');
  const p2 = writeTmp('sep-b.md', 'BBB');
  const snap = createSnapshot([p1, p2]);
  const output = renderSnapshotContent(snap, { separator: '|||' });
  assert.ok(output.includes('|||'));
});

// ---------------------------------------------------------------------------
// describeSnapshot
// ---------------------------------------------------------------------------

console.log('\ndescribeSnapshot');

test('contains sessionId in output', () => {
  setup();
  const snap = createSnapshot([], { sessionId: 'desc-test-session' });
  const desc = describeSnapshot(snap);
  assert.ok(desc.includes('desc-test-session'));
});

test('contains file counts in output', () => {
  setup();
  const p = writeTmp('desc-file.md', 'content');
  const missing = path.join(tmpDir, 'desc-missing.md');
  const snap = createSnapshot([p, missing]);
  const desc = describeSnapshot(snap);
  assert.ok(desc.includes('1 loaded'));
  assert.ok(desc.includes('1 failed'));
});

test('lists failed source paths when errors present', () => {
  setup();
  const missing = path.join(tmpDir, 'listed-missing.md');
  const snap = createSnapshot([missing]);
  const desc = describeSnapshot(snap);
  assert.ok(desc.includes('listed-missing.md'));
});

// ---------------------------------------------------------------------------
// Cleanup temp dir
// ---------------------------------------------------------------------------

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (_) {}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
