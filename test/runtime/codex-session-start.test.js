'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
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

function makeProject(files = []) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-codex-hook-'));

  for (const [relativePath, content] of files) {
    const absolutePath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
  }

  return projectDir;
}

console.log('\ncodex.handleSessionStart');

test('maps Codex SessionStart payload to shared bootstrap input with toolchain=codex', () => {
  const projectDir = makeProject([
    ['memory-bank/.local/CURRENT.md', '# current'],
    ['memory-bank/.local/HANDOFF.md', '# handoff'],
  ]);

  const calls = [];
  const fakeBridge = {
    bootstrapSession(input, deps) {
      calls.push({ input, deps });
      return { additionalContext: 'screened startup context' };
    },
  };

  const { output } = codexBridge.handleSessionStart({
    session_id: 'codex-sess-001',
    model: 'o4-mini',
    cwd: projectDir,
  }, {
    bridge: fakeBridge,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.sessionId, 'codex-sess-001');
  assert.equal(calls[0].input.toolchain, 'codex');
  assert.equal(calls[0].input.projectDir, projectDir);
  assert.equal(calls[0].input.title, 'Codex CLI (o4-mini)');
  assert.deepStrictEqual(calls[0].input.contextFiles, [
    path.join(projectDir, 'memory-bank/.local/CURRENT.md'),
    path.join(projectDir, 'memory-bank/.local/HANDOFF.md'),
  ]);
  assert.equal(calls[0].input.registerLocalProvider, false);
  assert.equal(calls[0].input.initializeProviders, false);
  assert.equal(calls[0].input.openTranscriptSession, true);

  // Codex output format: { additional_context: "..." } — snake_case, not hookSpecificOutput
  assert.deepStrictEqual(output, { additional_context: 'screened startup context' });
});

test('uses unknown-model fallback when model field is absent', () => {
  const projectDir = makeProject([
    ['memory-bank/.local/CURRENT.md', '# current'],
  ]);

  const fakeBridge = {
    bootstrapSession(input) {
      return { additionalContext: 'ctx' };
    },
  };

  const { output } = codexBridge.handleSessionStart({
    session_id: 'codex-sess-002',
    cwd: projectDir,
  }, { bridge: fakeBridge });

  assert.deepStrictEqual(output, { additional_context: 'ctx' });
});

test('returns null output when additionalContext is empty', () => {
  const projectDir = makeProject();

  const fakeBridge = {
    bootstrapSession() {
      return { additionalContext: '' };
    },
  };

  const { output } = codexBridge.handleSessionStart({
    session_id: 'codex-sess-003',
    cwd: projectDir,
  }, { bridge: fakeBridge });

  assert.strictEqual(output, null);
});

test('filters missing startup files', () => {
  const projectDir = makeProject([
    ['memory-bank/.local/CURRENT.md', '# current only'],
    // HANDOFF.md intentionally absent
  ]);

  const calls = [];
  const fakeBridge = {
    bootstrapSession(input) {
      calls.push(input);
      return { additionalContext: '' };
    },
  };

  codexBridge.handleSessionStart({
    session_id: 'codex-sess-004',
    cwd: projectDir,
  }, { bridge: fakeBridge });

  assert.equal(calls.length, 1);
  assert.deepStrictEqual(calls[0].contextFiles, [
    path.join(projectDir, 'memory-bank/.local/CURRENT.md'),
  ]);
});

test('throws when session_id is missing', () => {
  assert.throws(
    () => codexBridge.handleSessionStart({ cwd: '/tmp' }, { bridge: { bootstrapSession() {} } }),
    /session_id/
  );
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
