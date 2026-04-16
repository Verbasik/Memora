'use strict';

/**
 * Unit tests for lib/runtime/provider-registry.js — ProviderRegistry
 *
 * Verifies:
 *   - Registration: addProvider, removeProvider, getProvider, hasProvider, providers
 *   - Lifecycle: initializeAll (available/skipped/failed), shutdownAll (reverse order)
 *   - Fan-out strings: buildSystemPrompt, prefetchAll, onPreCompress
 *   - Fan-out void: queuePrefetchAll, syncAll, onTurnStart, onSessionEnd,
 *                   onMemoryWrite, onDelegation
 *   - Failure isolation: one throwing provider never blocks others
 *   - Tool routing: getToolSchemas (dedup), getToolNames, hasTool, handleToolCall
 *   - Diagnostics: accumulated log, tool name conflicts
 *
 * Run: node test/runtime/provider-registry.test.js
 */

const assert = require('assert');
const { MemoryProvider }   = require('../../lib/runtime/provider');
const { ProviderRegistry } = require('../../lib/runtime/provider-registry');

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
// Mock provider factory
// ---------------------------------------------------------------------------

function makeProvider(name, opts = {}) {
  class MockProvider extends MemoryProvider {
    constructor() {
      super();
      this.calls        = [];
      this._available   = opts.available !== false;
      this._tools       = opts.tools || [];
      this._block       = opts.systemBlock || '';
      this._prefetch    = opts.prefetch    || '';
      this._preCompress = opts.preCompress || '';
      this._initFail    = opts.initFail    || false;
      this._shutFail    = opts.shutFail    || false;
      this._prefFail    = opts.prefFail    || false;
      this._schemaFail  = opts.schemaFail  || false;
    }

    get name()             { return name; }
    isAvailable()          { return this._available; }

    initialize(sid, opts_) {
      if (this._initFail) throw new Error(`${name} init failed`);
      this.calls.push({ method: 'initialize', sid });
    }

    shutdown() {
      if (this._shutFail) throw new Error(`${name} shutdown failed`);
      this.calls.push({ method: 'shutdown' });
    }

    systemPromptBlock()     { return this._block; }

    prefetch(q, opts_) {
      if (this._prefFail) throw new Error(`${name} prefetch failed`);
      this.calls.push({ method: 'prefetch', q });
      return this._prefetch;
    }

    queuePrefetch(q)        { this.calls.push({ method: 'queuePrefetch', q }); }

    syncTurn(u, a)          { this.calls.push({ method: 'syncTurn', u, a }); }

    onTurnStart(n, msg)     { this.calls.push({ method: 'onTurnStart', n }); }

    onSessionEnd(msgs)      { this.calls.push({ method: 'onSessionEnd', count: msgs.length }); }

    onPreCompress(msgs)     { return this._preCompress; }

    onMemoryWrite(act, tgt, cnt) { this.calls.push({ method: 'onMemoryWrite', act }); }

    onDelegation(task, res) { this.calls.push({ method: 'onDelegation', task }); }

    getToolSchemas() {
      if (this._schemaFail) throw new Error(`${name} getToolSchemas failed`);
      return this._tools;
    }

    handleToolCall(toolName, args) {
      this.calls.push({ method: 'handleToolCall', toolName });
      return JSON.stringify({ handled: toolName, by: name });
    }
  }
  return new MockProvider();
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

console.log('\nConstruction');

test('new ProviderRegistry() has empty providers list', () => {
  const r = new ProviderRegistry();
  assert.deepStrictEqual(r.providers, []);
});

test('new ProviderRegistry() has empty diagnostics', () => {
  assert.deepStrictEqual(new ProviderRegistry().diagnostics, []);
});

// ---------------------------------------------------------------------------
// addProvider
// ---------------------------------------------------------------------------

console.log('\naddProvider');

test('accepts a valid MemoryProvider', () => {
  const r = new ProviderRegistry();
  const ok = r.addProvider(makeProvider('p1'));
  assert.strictEqual(ok, true);
  assert.strictEqual(r.providers.length, 1);
});

test('rejects non-MemoryProvider (plain object)', () => {
  const r = new ProviderRegistry();
  const ok = r.addProvider({ name: 'x' });
  assert.strictEqual(ok, false);
  assert.strictEqual(r.providers.length, 0);
});

test('rejects non-MemoryProvider (null)', () => {
  const r = new ProviderRegistry();
  assert.strictEqual(r.addProvider(null), false);
});

test('rejects duplicate provider name', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('alpha'));
  const ok = r.addProvider(makeProvider('alpha'));
  assert.strictEqual(ok, false);
  assert.strictEqual(r.providers.length, 1);
  assert.ok(r.diagnostics.some(d => d.includes('alpha') && d.includes('already registered')));
});

test('indexes tool schemas on registration', () => {
  const r = new ProviderRegistry();
  const tools = [{ name: 'my_search', description: 'search', parameters: {} }];
  r.addProvider(makeProvider('p1', { tools }));
  assert.ok(r.hasTool('my_search'));
});

test('first-registered wins on tool name collision', () => {
  const r = new ProviderRegistry();
  const t1 = [{ name: 'shared_tool', description: 'from p1', parameters: {} }];
  const t2 = [{ name: 'shared_tool', description: 'from p2', parameters: {} }];
  r.addProvider(makeProvider('p1', { tools: t1 }));
  r.addProvider(makeProvider('p2', { tools: t2 }));
  const result = r.handleToolCall('shared_tool', {});
  assert.ok(JSON.parse(result).by === 'p1', 'first provider wins tool dispatch');
  assert.ok(r.diagnostics.some(d => d.includes('conflict') || d.includes('shared_tool')));
});

test('handles provider where getToolSchemas() throws', () => {
  const r = new ProviderRegistry();
  const ok = r.addProvider(makeProvider('p-bad-schema', { schemaFail: true }));
  assert.strictEqual(ok, true, 'provider still registered despite schema failure');
  assert.ok(r.diagnostics.some(d => d.includes('p-bad-schema')));
});

// ---------------------------------------------------------------------------
// removeProvider
// ---------------------------------------------------------------------------

console.log('\nremoveProvider');

test('removes an existing provider', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1'));
  const ok = r.removeProvider('p1');
  assert.strictEqual(ok, true);
  assert.strictEqual(r.providers.length, 0);
});

test('returns false for unknown provider', () => {
  const r = new ProviderRegistry();
  assert.strictEqual(r.removeProvider('ghost'), false);
});

test('removes tool entries belonging to the removed provider', () => {
  const r = new ProviderRegistry();
  const tools = [{ name: 'owned_tool', description: '', parameters: {} }];
  r.addProvider(makeProvider('p1', { tools }));
  assert.ok(r.hasTool('owned_tool'));
  r.removeProvider('p1');
  assert.strictEqual(r.hasTool('owned_tool'), false);
});

// ---------------------------------------------------------------------------
// getProvider / hasProvider / providers
// ---------------------------------------------------------------------------

console.log('\ngetProvider / hasProvider / providers');

test('getProvider() returns the provider by name', () => {
  const r = new ProviderRegistry();
  const p = makeProvider('abc');
  r.addProvider(p);
  assert.strictEqual(r.getProvider('abc'), p);
});

test('getProvider() returns null for unknown name', () => {
  assert.strictEqual(new ProviderRegistry().getProvider('nope'), null);
});

test('hasProvider() returns true when registered', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('exists'));
  assert.strictEqual(r.hasProvider('exists'), true);
});

test('hasProvider() returns false when not registered', () => {
  assert.strictEqual(new ProviderRegistry().hasProvider('missing'), false);
});

test('providers getter returns a copy (mutation does not affect registry)', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1'));
  const snap = r.providers;
  snap.push('hack');
  assert.strictEqual(r.providers.length, 1);
});

// ---------------------------------------------------------------------------
// initializeAll
// ---------------------------------------------------------------------------

console.log('\ninitializeAll');

test('initializes available providers and returns their names', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  const p2 = makeProvider('p2');
  r.addProvider(p1);
  r.addProvider(p2);
  const result = r.initializeAll('sess-001');
  assert.deepStrictEqual(result.initialized, ['p1', 'p2']);
  assert.deepStrictEqual(result.skipped, []);
  assert.deepStrictEqual(result.failed, []);
});

test('skips providers where isAvailable() returns false', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('available', { available: true }));
  r.addProvider(makeProvider('unavailable', { available: false }));
  const result = r.initializeAll('sess-x');
  assert.ok(result.initialized.includes('available'));
  assert.ok(result.skipped.includes('unavailable'));
});

test('isolates initialize() failures — other providers still initialize', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('good',  { initFail: false }));
  r.addProvider(makeProvider('bad',   { initFail: true  }));
  r.addProvider(makeProvider('also-good', { initFail: false }));
  const result = r.initializeAll('sess-y');
  assert.ok(result.initialized.includes('good'));
  assert.ok(result.initialized.includes('also-good'));
  assert.ok(result.failed.includes('bad'));
  assert.ok(r.diagnostics.some(d => d.includes('bad') && d.includes('failed')));
});

test('isAvailable() throwing is treated as unavailable', () => {
  class BrokenAvail extends MemoryProvider {
    get name()      { return 'broken-avail'; }
    isAvailable()   { throw new Error('avail exploded'); }
  }
  const r = new ProviderRegistry();
  r.addProvider(new BrokenAvail());
  const result = r.initializeAll('sess-z');
  assert.ok(result.skipped.includes('broken-avail'));
});

// ---------------------------------------------------------------------------
// shutdownAll
// ---------------------------------------------------------------------------

console.log('\nshutdownAll');

test('shuts down all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  const p2 = makeProvider('p2');
  r.addProvider(p1);
  r.addProvider(p2);
  r.initializeAll('s1');
  const result = r.shutdownAll();
  assert.ok(result.shutdown.includes('p1'));
  assert.ok(result.shutdown.includes('p2'));
  assert.deepStrictEqual(result.failed, []);
});

test('shutdownAll() iterates in reverse registration order', () => {
  const order = [];
  class OrderedProvider extends MemoryProvider {
    constructor(n) { super(); this._n = n; }
    get name()    { return this._n; }
    shutdown()    { order.push(this._n); }
  }
  const r = new ProviderRegistry();
  r.addProvider(new OrderedProvider('first'));
  r.addProvider(new OrderedProvider('second'));
  r.addProvider(new OrderedProvider('third'));
  r.shutdownAll();
  assert.deepStrictEqual(order, ['third', 'second', 'first']);
});

test('isolates shutdown() failures — other providers still shut down', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('good',      { shutFail: false }));
  r.addProvider(makeProvider('bad-shut',  { shutFail: true  }));
  r.addProvider(makeProvider('also-good', { shutFail: false }));
  const result = r.shutdownAll();
  assert.ok(result.shutdown.includes('good'));
  assert.ok(result.shutdown.includes('also-good'));
  assert.ok(result.failed.includes('bad-shut'));
});

// ---------------------------------------------------------------------------
// buildSystemPrompt / prefetchAll / onPreCompress  (string fan-out)
// ---------------------------------------------------------------------------

console.log('\nString fan-out');

test('buildSystemPrompt() joins non-empty blocks with "\\n\\n"', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { systemBlock: 'Block A' }));
  r.addProvider(makeProvider('p2', { systemBlock: '' }));
  r.addProvider(makeProvider('p3', { systemBlock: 'Block C' }));
  const result = r.buildSystemPrompt();
  assert.strictEqual(result, 'Block A\n\nBlock C');
});

test('buildSystemPrompt() returns empty string when all blocks are empty', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { systemBlock: '' }));
  assert.strictEqual(r.buildSystemPrompt(), '');
});

test('buildSystemPrompt() returns empty string with no providers', () => {
  assert.strictEqual(new ProviderRegistry().buildSystemPrompt(), '');
});

test('prefetchAll() joins non-empty results', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { prefetch: 'Context A' }));
  r.addProvider(makeProvider('p2', { prefetch: '' }));
  r.addProvider(makeProvider('p3', { prefetch: 'Context C' }));
  const result = r.prefetchAll('query');
  assert.strictEqual(result, 'Context A\n\nContext C');
});

test('prefetchAll() isolates failing providers', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('good', { prefetch: 'good result' }));
  r.addProvider(makeProvider('bad',  { prefFail: true }));
  const result = r.prefetchAll('q');
  assert.strictEqual(result, 'good result');
  assert.ok(r.diagnostics.some(d => d.includes('bad') && d.includes('non-fatal')));
});

test('onPreCompress() joins contributions', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { preCompress: 'note1' }));
  r.addProvider(makeProvider('p2', { preCompress: '' }));
  r.addProvider(makeProvider('p3', { preCompress: 'note3' }));
  assert.strictEqual(r.onPreCompress([]), 'note1\n\nnote3');
});

// ---------------------------------------------------------------------------
// Void fan-out hooks
// ---------------------------------------------------------------------------

console.log('\nVoid fan-out hooks');

test('queuePrefetchAll() calls queuePrefetch on all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  const p2 = makeProvider('p2');
  r.addProvider(p1);
  r.addProvider(p2);
  r.queuePrefetchAll('bg-query');
  assert.ok(p1.calls.some(c => c.method === 'queuePrefetch' && c.q === 'bg-query'));
  assert.ok(p2.calls.some(c => c.method === 'queuePrefetch' && c.q === 'bg-query'));
});

test('syncAll() calls syncTurn on all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  r.addProvider(p1);
  r.syncAll('user', 'assistant');
  assert.ok(p1.calls.some(c => c.method === 'syncTurn' && c.u === 'user'));
});

test('onTurnStart() calls all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  const p2 = makeProvider('p2');
  r.addProvider(p1);
  r.addProvider(p2);
  r.onTurnStart(3, 'msg');
  assert.ok(p1.calls.some(c => c.method === 'onTurnStart' && c.n === 3));
  assert.ok(p2.calls.some(c => c.method === 'onTurnStart' && c.n === 3));
});

test('onSessionEnd() calls all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  r.addProvider(p1);
  r.onSessionEnd([{ role: 'user', content: 'x' }]);
  assert.ok(p1.calls.some(c => c.method === 'onSessionEnd' && c.count === 1));
});

test('onMemoryWrite() calls all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  r.addProvider(p1);
  r.onMemoryWrite('add', 'memory', 'content');
  assert.ok(p1.calls.some(c => c.method === 'onMemoryWrite' && c.act === 'add'));
});

test('onDelegation() calls all providers', () => {
  const r = new ProviderRegistry();
  const p1 = makeProvider('p1');
  r.addProvider(p1);
  r.onDelegation('my task', 'result');
  assert.ok(p1.calls.some(c => c.method === 'onDelegation' && c.task === 'my task'));
});

// ---------------------------------------------------------------------------
// Failure isolation (void fan-out)
// ---------------------------------------------------------------------------

console.log('\nFailure isolation — void fan-out');

test('one failing provider does not block others in _fireAll', () => {
  const called = [];
  class ThrowingProvider extends MemoryProvider {
    get name()          { return 'thrower'; }
    onTurnStart()       { throw new Error('boom'); }
  }
  class GoodProvider extends MemoryProvider {
    get name()          { return 'good'; }
    onTurnStart(n)      { called.push(n); }
  }
  const r = new ProviderRegistry();
  r.addProvider(new ThrowingProvider());
  r.addProvider(new GoodProvider());
  r.onTurnStart(7, 'msg');  // must not throw
  assert.ok(called.includes(7), 'good provider still received hook');
  assert.ok(r.diagnostics.some(d => d.includes('thrower') && d.includes('non-fatal')));
});

// ---------------------------------------------------------------------------
// Tool routing
// ---------------------------------------------------------------------------

console.log('\nTool routing');

test('getToolSchemas() aggregates schemas from all providers', () => {
  const r = new ProviderRegistry();
  const t1 = [{ name: 'tool_a', description: '', parameters: {} }];
  const t2 = [{ name: 'tool_b', description: '', parameters: {} }];
  r.addProvider(makeProvider('p1', { tools: t1 }));
  r.addProvider(makeProvider('p2', { tools: t2 }));
  const schemas = r.getToolSchemas();
  const names = schemas.map(s => s.name);
  assert.ok(names.includes('tool_a'));
  assert.ok(names.includes('tool_b'));
});

test('getToolSchemas() deduplicates by name (first wins)', () => {
  const r = new ProviderRegistry();
  const t1 = [{ name: 'shared', description: 'from p1', parameters: {} }];
  const t2 = [{ name: 'shared', description: 'from p2', parameters: {} }];
  r.addProvider(makeProvider('p1', { tools: t1 }));
  r.addProvider(makeProvider('p2', { tools: t2 }));
  const schemas = r.getToolSchemas().filter(s => s.name === 'shared');
  assert.strictEqual(schemas.length, 1);
  assert.strictEqual(schemas[0].description, 'from p1');
});

test('getToolNames() returns Set of registered tool names', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { tools: [{ name: 'alpha', description: '', parameters: {} }] }));
  r.addProvider(makeProvider('p2', { tools: [{ name: 'beta',  description: '', parameters: {} }] }));
  const names = r.getToolNames();
  assert.ok(names instanceof Set);
  assert.ok(names.has('alpha'));
  assert.ok(names.has('beta'));
});

test('hasTool() returns true for registered tool', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1', { tools: [{ name: 'my_tool', description: '', parameters: {} }] }));
  assert.strictEqual(r.hasTool('my_tool'), true);
});

test('hasTool() returns false for unregistered tool', () => {
  assert.strictEqual(new ProviderRegistry().hasTool('ghost'), false);
});

test('handleToolCall() routes to owning provider and returns JSON', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('owner', { tools: [{ name: 'do_work', description: '', parameters: {} }] }));
  const result = r.handleToolCall('do_work', { x: 1 });
  const parsed = JSON.parse(result);
  assert.strictEqual(parsed.handled, 'do_work');
  assert.strictEqual(parsed.by, 'owner');
});

test('handleToolCall() returns JSON error for unknown tool', () => {
  const r = new ProviderRegistry();
  const result = r.handleToolCall('no_such_tool', {});
  const parsed = JSON.parse(result);
  assert.ok(parsed.error, 'should have error field');
  assert.ok(parsed.error.includes('no_such_tool'));
});

test('handleToolCall() returns JSON error when provider handleToolCall throws', () => {
  class ThrowingToolProvider extends MemoryProvider {
    get name()          { return 'throw-tool'; }
    getToolSchemas()    { return [{ name: 'explode', description: '', parameters: {} }]; }
    handleToolCall()    { throw new Error('tool exploded'); }
  }
  const r = new ProviderRegistry();
  r.addProvider(new ThrowingToolProvider());
  const result = r.handleToolCall('explode', {});
  const parsed = JSON.parse(result);
  assert.ok(parsed.error, 'should have error field');
  assert.ok(parsed.error.includes('explode'));
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

console.log('\nDiagnostics');

test('diagnostics array is populated on operations', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1'));
  assert.ok(r.diagnostics.length > 0, 'registration should log to diagnostics');
});

test('diagnostics is append-only (no dedup)', () => {
  const r = new ProviderRegistry();
  r.addProvider(makeProvider('p1'));
  r.addProvider(makeProvider('p1'));  // duplicate — adds log entry
  const before = r.diagnostics.length;
  r.addProvider(makeProvider('p2'));
  assert.ok(r.diagnostics.length > before);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
