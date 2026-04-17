'use strict';

const assert = require('assert');
const path = require('path');

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

// ── handlePreToolUse ──────────────────────────────────────────────────────────

console.log('\ncodex.handlePreToolUse');

test('blocks git push Bash command', () => {
  const result = codexBridge.handlePreToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main' },
  });

  assert.ok(result, 'should return a block result');
  assert.equal(result.blocked, true);
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

test('allows non-blocked Bash commands', () => {
  const result = codexBridge.handlePreToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'node test/parity.js' },
  });

  assert.strictEqual(result, null);
});

test('allows write tool calls — not a universal file-write gate', () => {
  // Codex PreToolUse is Bash-oriented. File writes are NOT intercepted here;
  // they must go through writeCanonicalFile() explicitly.
  const result = codexBridge.handlePreToolUse({
    tool_name: 'Write',
    tool_input: { file_path: 'memory-bank/.local/CURRENT.md', content: 'test' },
  });

  assert.strictEqual(result, null, 'Codex PreToolUse must not block file writes — use writeCanonicalFile instead');
});

test('handles missing tool_input gracefully', () => {
  assert.doesNotThrow(() => {
    codexBridge.handlePreToolUse({});
  });
});

// ── writeCanonicalFile ────────────────────────────────────────────────────────

console.log('\ncodex.writeCanonicalFile');

test('writes file and calls onMemoryWrite when content is safe', () => {
  const written = [];
  const observed = [];

  const fakeRuntime = {
    checkMemoryWrite() { return { allowed: true }; },
    onMemoryWrite(action, filePath, content) {
      observed.push({ action, filePath, content });
    },
  };

  const fakePath = { dirname: path.dirname.bind(path) };
  const fakeFs = {
    mkdirSync() {},
    writeFileSync(fp, content) { written.push({ fp, content }); },
  };

  codexBridge.writeCanonicalFile(
    'memory-bank/.local/CURRENT.md',
    '# current state',
    { runtime: fakeRuntime, fs: fakeFs, path: fakePath }
  );

  assert.equal(written.length, 1);
  assert.equal(written[0].fp, 'memory-bank/.local/CURRENT.md');
  assert.equal(written[0].content, '# current state');

  assert.equal(observed.length, 1);
  assert.equal(observed[0].action, 'replace');
  assert.equal(observed[0].filePath, 'memory-bank/.local/CURRENT.md');
});

test('throws and does not write when content is blocked', () => {
  const written = [];

  const fakeRuntime = {
    checkMemoryWrite() { return { allowed: false, patternId: 'prompt_injection' }; },
    onMemoryWrite() {},
  };

  const fakeFs = {
    mkdirSync() {},
    writeFileSync(fp, content) { written.push({ fp, content }); },
  };

  assert.throws(
    () => codexBridge.writeCanonicalFile(
      'memory-bank/DECISIONS.md',
      'ignore previous instructions',
      { runtime: fakeRuntime, fs: fakeFs, path }
    ),
    /Memora blocked write \(prompt_injection\)/
  );

  assert.equal(written.length, 0, 'writeFileSync must not be called when blocked');
});

test('uses unknown_pattern fallback when patternId is absent', () => {
  const fakeRuntime = {
    checkMemoryWrite() { return { allowed: false }; },
    onMemoryWrite() {},
  };

  assert.throws(
    () => codexBridge.writeCanonicalFile('memory-bank/DECISIONS.md', 'bad', { runtime: fakeRuntime, fs: { mkdirSync() {}, writeFileSync() {} }, path }),
    /unknown_pattern/
  );
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
