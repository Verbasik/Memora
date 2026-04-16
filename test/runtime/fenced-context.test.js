'use strict';

/**
 * Tests for lib/runtime/fenced-context.js
 *
 * Covers:
 *   - sanitizeRecalledContent: nested blocks, source comments, blocked stubs, blank lines
 *   - buildFencedBlock: attribute serialisation, escaping, empty content
 *   - buildRecallBlock: full pipeline (sanitize + fence), empty result on empty content
 *   - extractFencedBlocks: parsing attributes and bodies
 *   - stripFencedBlocks: removes all blocks, leaves surrounding text
 *
 * Run: node test/runtime/fenced-context.test.js
 */

const assert = require('assert');
const {
  sanitizeRecalledContent,
  buildFencedBlock,
  buildRecallBlock,
  extractFencedBlocks,
  stripFencedBlocks,
} = require('../../lib/runtime/fenced-context');

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
// sanitizeRecalledContent
// ---------------------------------------------------------------------------

console.log('\nsanitizeRecalledContent — passthrough for clean content');

test('returns clean content unchanged', () => {
  const c = 'This is a clean recalled summary.';
  assert.strictEqual(sanitizeRecalledContent(c), c);
});

test('trims surrounding whitespace', () => {
  assert.strictEqual(sanitizeRecalledContent('  hello  '), 'hello');
});

test('handles empty string', () => {
  assert.strictEqual(sanitizeRecalledContent(''), '');
});

test('handles null gracefully', () => {
  assert.strictEqual(sanitizeRecalledContent(null), '');
});

console.log('\nsanitizeRecalledContent — nested block removal');

test('removes a nested <memory_context> block', () => {
  const inner = '<memory_context type="recall">\nold recalled data\n</memory_context>';
  const content = `Some text\n${inner}\nMore text`;
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('<memory_context'), 'should not contain opening tag');
  assert.ok(!result.includes('</memory_context'), 'should not contain closing tag');
  assert.ok(!result.includes('old recalled data'), 'should not contain nested body');
  assert.ok(result.includes('Some text'));
  assert.ok(result.includes('More text'));
});

test('removes multiple nested <memory_context> blocks', () => {
  const block1 = '<memory_context type="recall">\nfirst block\n</memory_context>';
  const block2 = '<memory_context type="snapshot">\nsecond block\n</memory_context>';
  const content = `Intro\n${block1}\nMiddle\n${block2}\nOutro`;
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('<memory_context'));
  assert.ok(!result.includes('first block'));
  assert.ok(!result.includes('second block'));
  assert.ok(result.includes('Intro'));
  assert.ok(result.includes('Middle'));
  assert.ok(result.includes('Outro'));
});

test('removes orphan opening tag without closing tag', () => {
  const content = 'Text before\n<memory_context type="recall">\nText after';
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('<memory_context'));
});

test('removes orphan closing tag without opening tag', () => {
  const content = 'Text before\n</memory_context>\nText after';
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('</memory_context'));
});

test('removes <memory_context> tag with no attributes', () => {
  const content = '<memory_context>\nbody\n</memory_context>';
  assert.strictEqual(sanitizeRecalledContent(content), '');
});

console.log('\nsanitizeRecalledContent — annotation marker removal');

test('removes <!-- source: ... --> comments', () => {
  const content = '<!-- source: CURRENT.md -->\n## Active tasks';
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('<!-- source:'));
  assert.ok(result.includes('## Active tasks'));
});

test('removes [BLOCKED: ...] stubs', () => {
  const content = '[BLOCKED: AGENTS.md contained potential prompt injection (prompt_injection). Content not loaded.]\n\nSome other context.';
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('[BLOCKED:'));
  assert.ok(result.includes('Some other context.'));
});

test('collapses 3+ blank lines into at most 2', () => {
  const content = 'Line A\n\n\n\n\nLine B';
  const result = sanitizeRecalledContent(content);
  assert.ok(!result.includes('\n\n\n'), 'should not have 3 consecutive newlines');
  assert.ok(result.includes('Line A'));
  assert.ok(result.includes('Line B'));
});

// ---------------------------------------------------------------------------
// buildFencedBlock
// ---------------------------------------------------------------------------

console.log('\nbuildFencedBlock — structure');

test('produces opening and closing memory_context tags', () => {
  const result = buildFencedBlock('Hello world');
  assert.ok(result.startsWith('<memory_context'), `should start with opening tag, got: ${result.slice(0, 40)}`);
  assert.ok(result.endsWith('</memory_context>'));
});

test('includes body content between tags', () => {
  const result = buildFencedBlock('My content');
  assert.ok(result.includes('My content'));
});

test('trims body content', () => {
  const result = buildFencedBlock('  trimmed  ');
  assert.ok(result.includes('\ntrimmed\n'));
});

console.log('\nbuildFencedBlock — attributes');

test('includes type attribute when provided', () => {
  const result = buildFencedBlock('body', { type: 'recall' });
  assert.ok(result.includes('type="recall"'));
});

test('includes multiple attributes', () => {
  const result = buildFencedBlock('body', {
    type: 'recall',
    source: 'session-abc',
    query: 'memory banking',
  });
  assert.ok(result.includes('type="recall"'));
  assert.ok(result.includes('source="session-abc"'));
  assert.ok(result.includes('query="memory banking"'));
});

test('omits null and empty string attributes', () => {
  const result = buildFencedBlock('body', { type: 'recall', source: null, query: '' });
  assert.ok(!result.includes('source='));
  assert.ok(!result.includes('query='));
});

test('escapes double quotes in attribute values', () => {
  const result = buildFencedBlock('body', { query: 'find "important" sessions' });
  assert.ok(!result.includes('"important"'), 'raw quotes in attr should be escaped');
  assert.ok(result.includes('&quot;important&quot;'));
});

test('escapes < and > in attribute values', () => {
  const result = buildFencedBlock('body', { note: 'value > 0 & value < 100' });
  assert.ok(result.includes('&gt;'));
  assert.ok(result.includes('&lt;'));
  assert.ok(result.includes('&amp;'));
});

test('throws TypeError for non-string content', () => {
  assert.throws(() => buildFencedBlock(42), TypeError);
  assert.throws(() => buildFencedBlock(null), TypeError);
});

// ---------------------------------------------------------------------------
// buildRecallBlock
// ---------------------------------------------------------------------------

console.log('\nbuildRecallBlock — full pipeline');

test('returns empty string for empty content', () => {
  assert.strictEqual(buildRecallBlock(''), '');
  assert.strictEqual(buildRecallBlock('   '), '');
});

test('returns empty string for null/whitespace-only after sanitize', () => {
  // Content that becomes empty after sanitization
  const onlyBlock = '<memory_context type="recall">\nsome data\n</memory_context>';
  assert.strictEqual(buildRecallBlock(onlyBlock), '');
});

test('produces a fenced block with type="recall" by default', () => {
  const result = buildRecallBlock('Some recalled content.');
  assert.ok(result.includes('type="recall"'));
});

test('includes metadata in the fence', () => {
  const result = buildRecallBlock('Content', {
    source: 'session-2026-04-15',
    query: 'sprint planning',
  });
  assert.ok(result.includes('source="session-2026-04-15"'));
  assert.ok(result.includes('query="sprint planning"'));
});

test('strips nested blocks before wrapping', () => {
  const nested = '<memory_context type="recall">\nold data\n</memory_context>\n\nNew useful data.';
  const result = buildRecallBlock(nested, { source: 'test' });
  // Result should contain only ONE pair of memory_context tags
  const openCount  = (result.match(/<memory_context/gi) || []).length;
  const closeCount = (result.match(/<\/memory_context>/gi) || []).length;
  assert.strictEqual(openCount, 1, `expected 1 opening tag, got ${openCount}`);
  assert.strictEqual(closeCount, 1, `expected 1 closing tag, got ${closeCount}`);
  // Should include new useful data but not old data
  assert.ok(result.includes('New useful data.'));
  assert.ok(!result.includes('old data'));
});

test('strips source comments before wrapping', () => {
  const withComment = '<!-- source: CURRENT.md -->\n## Active work';
  const result = buildRecallBlock(withComment);
  assert.ok(!result.includes('<!-- source:'));
  assert.ok(result.includes('## Active work'));
});

test('custom type attribute in metadata overrides default', () => {
  const result = buildRecallBlock('content', { type: 'snapshot' });
  assert.ok(result.includes('type="snapshot"'));
});

// ---------------------------------------------------------------------------
// extractFencedBlocks
// ---------------------------------------------------------------------------

console.log('\nextractFencedBlocks — parsing');

test('returns empty array for text with no fenced blocks', () => {
  const blocks = extractFencedBlocks('Plain text with no blocks.');
  assert.strictEqual(blocks.length, 0);
});

test('extracts a single block with body', () => {
  const text = '<memory_context type="recall">\nHello from the past.\n</memory_context>';
  const blocks = extractFencedBlocks(text);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].body, 'Hello from the past.');
});

test('parses attributes correctly', () => {
  const text = '<memory_context type="recall" source="sess-123" query="sprint">\nbody\n</memory_context>';
  const blocks = extractFencedBlocks(text);
  assert.strictEqual(blocks[0].attrs.type, 'recall');
  assert.strictEqual(blocks[0].attrs.source, 'sess-123');
  assert.strictEqual(blocks[0].attrs.query, 'sprint');
});

test('extracts multiple blocks', () => {
  const text = [
    '<memory_context type="recall">\nBlock one\n</memory_context>',
    'Some separator text',
    '<memory_context type="snapshot">\nBlock two\n</memory_context>',
  ].join('\n');
  const blocks = extractFencedBlocks(text);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].body, 'Block one');
  assert.strictEqual(blocks[1].body, 'Block two');
});

test('raw field contains the full matched string', () => {
  const tag = '<memory_context type="recall">\nbody text\n</memory_context>';
  const blocks = extractFencedBlocks(tag);
  assert.strictEqual(blocks[0].raw, tag);
});

test('handles null gracefully', () => {
  assert.deepStrictEqual(extractFencedBlocks(null), []);
});

// ---------------------------------------------------------------------------
// stripFencedBlocks
// ---------------------------------------------------------------------------

console.log('\nstripFencedBlocks — removal');

test('removes all fenced blocks, keeps surrounding text', () => {
  const text = 'Before\n<memory_context type="recall">\nremove me\n</memory_context>\nAfter';
  const result = stripFencedBlocks(text);
  assert.ok(!result.includes('<memory_context'));
  assert.ok(!result.includes('remove me'));
  assert.ok(result.includes('Before'));
  assert.ok(result.includes('After'));
});

test('returns unchanged text when no blocks present', () => {
  const text = 'Plain text with no blocks.';
  assert.strictEqual(stripFencedBlocks(text), text);
});

test('handles null gracefully', () => {
  assert.strictEqual(stripFencedBlocks(null), '');
});

// ---------------------------------------------------------------------------
// Round-trip: build then extract
// ---------------------------------------------------------------------------

console.log('\nRound-trip: build → extract');

test('extracted block matches what was built', () => {
  const original = 'Summary of past sprint planning session.';
  const meta     = { type: 'recall', source: 'sess-abc', query: 'sprint planning' };
  const block    = buildRecallBlock(original, meta);
  const parsed   = extractFencedBlocks(block);

  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].attrs.type, 'recall');
  assert.strictEqual(parsed[0].attrs.source, 'sess-abc');
  assert.strictEqual(parsed[0].body, original);
});

test('strip after build leaves empty string', () => {
  const block  = buildRecallBlock('Some recalled content.');
  const result = stripFencedBlocks(block);
  assert.strictEqual(result, '');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
