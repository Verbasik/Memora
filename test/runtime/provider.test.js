'use strict';

/**
 * Unit tests for lib/runtime/provider.js — MemoryProvider base class
 *
 * Verifies:
 *   - All default method return values / no-op behaviour
 *   - handleToolCall() throws with provider name in the message
 *   - Subclass can override individual methods without breaking others
 *   - Subclass inherits all default implementations unchanged
 *
 * Run: node test/runtime/provider.test.js
 */

const assert = require('assert');
const { MemoryProvider } = require('../../lib/runtime/provider');

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
// Construction
// ---------------------------------------------------------------------------

console.log('\nConstruction');

test('MemoryProvider can be instantiated directly', () => {
  const p = new MemoryProvider();
  assert.ok(p instanceof MemoryProvider);
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

console.log('\nIdentity');

test('name returns "unnamed" by default', () => {
  assert.strictEqual(new MemoryProvider().name, 'unnamed');
});

// ---------------------------------------------------------------------------
// Core lifecycle — return values and no-throw guarantees
// ---------------------------------------------------------------------------

console.log('\nCore lifecycle defaults');

test('isAvailable() returns true', () => {
  assert.strictEqual(new MemoryProvider().isAvailable(), true);
});

test('initialize() returns undefined (no-op)', () => {
  const result = new MemoryProvider().initialize('sess-001', { projectDir: '/tmp' });
  assert.strictEqual(result, undefined);
});

test('shutdown() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().shutdown(), undefined);
});

// ---------------------------------------------------------------------------
// Context integration defaults
// ---------------------------------------------------------------------------

console.log('\nContext integration defaults');

test('systemPromptBlock() returns empty string', () => {
  assert.strictEqual(new MemoryProvider().systemPromptBlock(), '');
});

test('prefetch() returns empty string', () => {
  assert.strictEqual(new MemoryProvider().prefetch('query'), '');
});

test('prefetch() accepts opts object', () => {
  assert.strictEqual(new MemoryProvider().prefetch('q', { sessionId: 's1' }), '');
});

test('queuePrefetch() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().queuePrefetch('query'), undefined);
});

test('syncTurn() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().syncTurn('user msg', 'assistant msg'), undefined);
});

// ---------------------------------------------------------------------------
// Tool integration defaults
// ---------------------------------------------------------------------------

console.log('\nTool integration defaults');

test('getToolSchemas() returns empty array', () => {
  const schemas = new MemoryProvider().getToolSchemas();
  assert.ok(Array.isArray(schemas));
  assert.strictEqual(schemas.length, 0);
});

test('handleToolCall() throws Error', () => {
  assert.throws(
    () => new MemoryProvider().handleToolCall('some_tool', {}),
    /does not handle tool 'some_tool'/
  );
});

test('handleToolCall() error includes provider name', () => {
  const p = new MemoryProvider();
  let caught = null;
  try { p.handleToolCall('tool_x', {}); } catch (e) { caught = e; }
  assert.ok(caught, 'should throw');
  assert.ok(caught.message.includes('unnamed'), 'error mentions provider name');
});

// ---------------------------------------------------------------------------
// Lifecycle hooks defaults
// ---------------------------------------------------------------------------

console.log('\nLifecycle hook defaults');

test('onTurnStart() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().onTurnStart(1, 'hello'), undefined);
});

test('onSessionEnd() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().onSessionEnd([]), undefined);
});

test('onPreCompress() returns empty string', () => {
  assert.strictEqual(new MemoryProvider().onPreCompress([]), '');
});

test('onMemoryWrite() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().onMemoryWrite('add', 'memory', 'content'), undefined);
});

test('onDelegation() returns undefined (no-op)', () => {
  assert.strictEqual(new MemoryProvider().onDelegation('task', 'result', {}), undefined);
});

// ---------------------------------------------------------------------------
// Subclass override — only name
// ---------------------------------------------------------------------------

console.log('\nSubclass: override name only');

class NamedProvider extends MemoryProvider {
  get name() { return 'test-provider'; }
}

test('subclass overrides name', () => {
  assert.strictEqual(new NamedProvider().name, 'test-provider');
});

test('subclass inherits isAvailable() default', () => {
  assert.strictEqual(new NamedProvider().isAvailable(), true);
});

test('subclass inherits getToolSchemas() default', () => {
  assert.deepStrictEqual(new NamedProvider().getToolSchemas(), []);
});

test('subclass handleToolCall() error mentions subclass name', () => {
  const p = new NamedProvider();
  let caught = null;
  try { p.handleToolCall('my_tool', {}); } catch (e) { caught = e; }
  assert.ok(caught);
  assert.ok(caught.message.includes('test-provider'), 'error includes subclass name');
});

// ---------------------------------------------------------------------------
// Subclass override — selective overrides
// ---------------------------------------------------------------------------

console.log('\nSubclass: selective overrides');

class SelectiveProvider extends MemoryProvider {
  get name()                    { return 'selective'; }
  isAvailable()                 { return false; }
  prefetch(query)               { return `result for: ${query}`; }
  onPreCompress(messages)       { return `${messages.length} messages seen`; }
  getToolSchemas()              { return [{ name: 'my_tool', description: 'test', parameters: {} }]; }
  handleToolCall(name, args)    { return JSON.stringify({ tool: name, args }); }
}

test('overridden isAvailable() returns false', () => {
  assert.strictEqual(new SelectiveProvider().isAvailable(), false);
});

test('overridden prefetch() returns custom string', () => {
  assert.strictEqual(new SelectiveProvider().prefetch('hello'), 'result for: hello');
});

test('overridden onPreCompress() returns contribution', () => {
  const msgs = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }];
  assert.strictEqual(new SelectiveProvider().onPreCompress(msgs), '2 messages seen');
});

test('overridden getToolSchemas() returns non-empty array', () => {
  const schemas = new SelectiveProvider().getToolSchemas();
  assert.strictEqual(schemas.length, 1);
  assert.strictEqual(schemas[0].name, 'my_tool');
});

test('overridden handleToolCall() returns JSON result', () => {
  const result = new SelectiveProvider().handleToolCall('my_tool', { arg: 1 });
  const parsed = JSON.parse(result);
  assert.strictEqual(parsed.tool, 'my_tool');
  assert.deepStrictEqual(parsed.args, { arg: 1 });
});

test('non-overridden shutdown() still no-ops', () => {
  assert.strictEqual(new SelectiveProvider().shutdown(), undefined);
});

test('non-overridden syncTurn() still no-ops', () => {
  assert.strictEqual(new SelectiveProvider().syncTurn('u', 'a'), undefined);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
