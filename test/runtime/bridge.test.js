'use strict';

const assert = require('assert');

const bridge = require('../../lib/runtime/bridge');

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
  const registry = {
    _hasLocal: false,
    hasProvider(name) {
      calls.push({ method: 'hasProvider', name });
      return name === 'local-transcript' ? this._hasLocal : false;
    },
    addProvider(provider) {
      calls.push({ method: 'addProvider', providerName: provider.name, provider });
      this._hasLocal = true;
      return true;
    },
    initializeAll(sessionId, opts) {
      calls.push({ method: 'initializeAll', sessionId, opts });
      return { initialized: ['local-transcript'], skipped: [], failed: [] };
    },
    prefetchAll(query, opts) {
      calls.push({ method: 'prefetchAll', query, opts });
      return registry._prefetchResult || '';
    },
  };

  class FakeLocalProvider {
    constructor(options = {}) {
      this.options = options;
    }

    get name() {
      return 'local-transcript';
    }
  }

  return {
    calls,
    registry,
    runtime: {
      loadContextFile(filePath) {
        calls.push({ method: 'loadContextFile', filePath });
        return {
          allowed: !filePath.includes('blocked'),
          content: filePath.includes('blocked')
            ? `[BLOCKED: ${filePath}]`
            : `content:${filePath}`,
          diagnostics: filePath.includes('blocked') ? `blocked:${filePath}` : null,
          patternId: filePath.includes('blocked') ? 'prompt_injection' : null,
        };
      },
      initSession(sources, opts) {
        calls.push({ method: 'initSession', sources, opts });
        if (opts && opts.forceThrow) {
          throw new Error('snapshot exploded');
        }
        return {
          snapshot: { sessionId: 'snap-1', frozen: true, loadedCount: sources.length, errorCount: 0 },
          diagnostics: `snapshot:${sources.length}`,
          hasErrors: false,
        };
      },
      getProviderRegistry() {
        calls.push({ method: 'getProviderRegistry' });
        return registry;
      },
      openTranscriptSession(sessionId, meta) {
        calls.push({ method: 'openTranscriptSession', sessionId, meta });
        return { opened: true, session: { sessionId }, diagnostics: 'transcript:opened' };
      },
      onTurnStart(turnNumber, message, opts) {
        calls.push({ method: 'onTurnStart', turnNumber, message, opts });
      },
      recallTranscripts(query, opts) {
        calls.push({ method: 'recallTranscripts', query, opts });
        return {
          found: true,
          block: `recall:${query}`,
          diagnostics: [],
        };
      },
      localProvider: {
        LocalMemoryProvider: FakeLocalProvider,
      },
    },
  };
}

console.log('\nbridge.bootstrapSession');

test('bootstrapSession initializes snapshot, provider, and safe context block', () => {
  const fake = makeFakeRuntime();

  const result = bridge.bootstrapSession({
    sessionId: 'sess-001',
    toolchain: 'claude',
    projectDir: '/repo',
    title: 'Bridge session',
    contextFiles: ['AGENTS.md', 'blocked.md'],
    snapshotSources: ['memory-bank/INDEX.md', 'memory-bank/.local/CURRENT.md'],
  }, { runtime: fake.runtime });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.toolchain, 'claude');
  assert.ok(result.additionalContext.includes('content:AGENTS.md'));
  assert.ok(result.additionalContext.includes('[BLOCKED: blocked.md]'));
  assert.deepStrictEqual(result.providerInit, {
    initialized: ['local-transcript'],
    skipped: [],
    failed: [],
  });
  assert.strictEqual(result.providerRegistration.registered, true);
  assert.ok(fake.calls.some((call) => call.method === 'initSession'));
  assert.ok(fake.calls.some((call) => call.method === 'addProvider' && call.providerName === 'local-transcript'));
});

test('bootstrapSession does not re-register local provider when already present', () => {
  const fake = makeFakeRuntime();
  fake.registry._hasLocal = true;

  const result = bridge.bootstrapSession({
    sessionId: 'sess-002',
    toolchain: 'qwen',
  }, { runtime: fake.runtime });

  assert.strictEqual(result.providerRegistration.registered, false);
  assert.ok(!fake.calls.some((call) => call.method === 'addProvider'));
});

test('bootstrapSession can optionally open direct transcript session and emits warning', () => {
  const fake = makeFakeRuntime();

  const result = bridge.bootstrapSession({
    sessionId: 'sess-003',
    toolchain: 'opencode',
    openTranscriptSession: true,
  }, { runtime: fake.runtime });

  assert.strictEqual(result.transcript.opened, true);
  assert.ok(result.warnings.some((msg) => msg.includes('openTranscriptSession=true')));
  assert.ok(fake.calls.some((call) => call.method === 'openTranscriptSession'));
});

test('bootstrapSession degrades gracefully when initSession throws', () => {
  const fake = makeFakeRuntime();

  const result = bridge.bootstrapSession({
    sessionId: 'sess-004',
    toolchain: 'codex',
    snapshotOptions: { forceThrow: true },
  }, { runtime: fake.runtime });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.snapshot.ok, false);
  assert.ok(result.diagnostics.some((msg) => msg.includes('initSession failed')));
});

console.log('\nbridge.prepareTurn');

test('prepareTurn calls onTurnStart and uses provider prefetch by default', () => {
  const fake = makeFakeRuntime();
  fake.registry._prefetchResult = 'provider:context';

  const result = bridge.prepareTurn({
    turnNumber: 7,
    userMessage: 'remember runtime bridge status',
    prefetchOptions: { source: 'claude' },
  }, { runtime: fake.runtime });

  assert.strictEqual(result.turnNumber, 7);
  assert.strictEqual(result.additionalContext, 'provider:context');
  assert.ok(fake.calls.some((call) => call.method === 'onTurnStart' && call.turnNumber === 7));
  assert.ok(fake.calls.some((call) => call.method === 'prefetchAll' && call.query === 'remember runtime bridge status'));
  assert.ok(!fake.calls.some((call) => call.method === 'recallTranscripts'));
});

test('prepareTurn falls back to direct transcript recall when provider prefetch is empty', () => {
  const fake = makeFakeRuntime();
  fake.registry._prefetchResult = '';

  const result = bridge.prepareTurn({
    turnNumber: 2,
    userMessage: 'find previous session',
    useDirectTranscriptRecall: true,
    recallOptions: { source: 'codex' },
  }, { runtime: fake.runtime });

  assert.strictEqual(result.additionalContext, 'recall:find previous session');
  assert.ok(fake.calls.some((call) => call.method === 'recallTranscripts' && call.query === 'find previous session'));
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
