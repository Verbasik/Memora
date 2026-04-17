'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function makeProject(files = []) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memora-claude-hook-'));

  for (const [relativePath, content] of files) {
    const absolutePath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
  }

  return projectDir;
}

console.log('\nclaude.handleSessionStart');

test('maps Claude SessionStart payload to shared bootstrap input', () => {
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

  const { output } = claudeBridge.handleSessionStart({
    session_id: 'claude-sess-001',
    source: 'startup',
    cwd: projectDir,
  }, {
    bridge: fakeBridge,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.sessionId, 'claude-sess-001');
  assert.equal(calls[0].input.toolchain, 'claude');
  assert.equal(calls[0].input.projectDir, projectDir);
  assert.equal(calls[0].input.title, 'Claude Code (startup)');
  assert.deepStrictEqual(calls[0].input.contextFiles, [
    path.join(projectDir, 'memory-bank/.local/CURRENT.md'),
    path.join(projectDir, 'memory-bank/.local/HANDOFF.md'),
  ]);
  assert.deepStrictEqual(calls[0].input.snapshotSources, calls[0].input.contextFiles);
  assert.equal(calls[0].input.registerLocalProvider, false);
  assert.equal(calls[0].input.initializeProviders, false);
  assert.equal(calls[0].input.openTranscriptSession, true);
  assert.deepStrictEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'screened startup context',
    },
  });
});

test('uses CLAUDE_PROJECT_DIR fallback and filters missing startup files', () => {
  const projectDir = makeProject([
    ['memory-bank/.local/CURRENT.md', '# current only'],
  ]);

  const calls = [];
  const fakeBridge = {
    bootstrapSession(input) {
      calls.push(input);
      return { additionalContext: '' };
    },
  };

  const previousProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = projectDir;

  try {
    const { output } = claudeBridge.handleSessionStart({
      session_id: 'claude-sess-002',
      source: 'resume',
    }, {
      bridge: fakeBridge,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].projectDir, projectDir);
    assert.deepStrictEqual(calls[0].contextFiles, [
      path.join(projectDir, 'memory-bank/.local/CURRENT.md'),
    ]);
    assert.strictEqual(output, null);
  } finally {
    if (previousProjectDir === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = previousProjectDir;
    }
  }
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
