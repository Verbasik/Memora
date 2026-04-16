# 🔒 Runtime Layer

**Purpose:** Document the `lib/runtime/` module — programmatic security screening, frozen session snapshots, and fenced recall context for Memora.
**Audience:** Maintainers, contributors, toolchain integrators, security reviewers.
**Read when:** You want to understand how Memora enforces security at the code level, how session snapshots work, or how recalled content is safely fenced before injection.
**Last updated:** 2026-04-16

**See also:** [Security](./SECURITY.md) · [Memory Model](./MEMORY_MODEL.md) · [Workflows](./WORKFLOWS.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Module: security-scanner](#-module-security-scanner)
- [Module: snapshot](#-module-snapshot)
- [Module: fenced-context](#-module-fenced-context)
- [Module: transcript/store (Phase 2)](#️-module-transcriptstore-phase-2)
- [Module: transcript/recall (Phase 2)](#-module-transcriptrecall-phase-2)
- [Module: provider (Phase 3)](#-module-provider-phase-3)
- [Module: provider-registry (Phase 3)](#-module-provider-registry-phase-3)
- [Module: providers/local (Phase 3)](#-module-providerslocal-phase-3)
- [Public API (lib/runtime/index.js)](#-public-api-libruntimeindexjs)
- [Security patterns reference](#-security-patterns-reference)
- [Usage examples](#-usage-examples)
- [Relationship to memory-bank](#-relationship-to-memory-bank)
- [Roadmap](#-roadmap)
- [Navigation](#-navigation)

---

## 🎯 Overview

The runtime layer (`lib/runtime/`) is a **programmatic security and context management layer** that sits on top of the canonical `memory-bank/`.

It provides three capabilities:

1. **Security screening** — content destined for memory writes or context file injection is scanned for prompt injection, exfiltration payloads, and invisible Unicode before it reaches the agent's system prompt.
2. **Frozen session snapshots** — the memory context is captured once at session start and frozen. Mid-session writes to memory files do not affect the active session snapshot.
3. **Fenced recall context** — recalled content from previous sessions is wrapped in a canonical `<memory_context>` block and sanitized before re-injection to prevent recursive context pollution.

The runtime layer is **additive**. It does not replace or rewrite the `memory-bank/`. Canonical knowledge files (`ARCHITECTURE.md`, `DECISIONS.md`, etc.) remain the source of truth.

---

## 🏗️ Architecture

```text
lib/runtime/
├── index.js               ← Public high-level API (Phases 1–3)
├── security-scanner.js    ← Prompt injection + exfiltration screening (Phase 1)
├── snapshot.js            ← Frozen session snapshot semantics (Phase 1)
├── fenced-context.js      ← Fenced recall block builder + sanitizer (Phase 1)
├── provider.js            ← MemoryProvider base class / contract (Phase 3)
├── provider-registry.js   ← ProviderRegistry orchestrator + failure isolation (Phase 3)
├── providers/
│   └── local.js           ← LocalMemoryProvider built-in (Phase 3)
└── transcript/
    ├── store.js           ← JSONL-backed TranscriptStore (Phase 2, Step 1)
    └── recall.js          ← Recall pipeline: search → format → fenced block (Phase 2, Step 2)
```

Each module is independently usable. `index.js` re-exports all sub-modules and provides a convenience API covering all three phases.

**No external dependencies.** The runtime layer uses only Node.js built-ins (`fs`, `crypto`, `path`). It requires Node.js >= 16 (consistent with the rest of Memora).

---

## 🛡️ Module: security-scanner

**File:** `lib/runtime/security-scanner.js`

Provides two scanning functions:

| Function | Purpose |
|---|---|
| `scanMemoryContent(content)` | Scan content before writing it to a memory file |
| `scanContextContent(content, filename)` | Scan a context file before injecting it into the prompt |

Both return a `ScanResult`:

```js
{
  blocked:   boolean,      // true if content should be rejected
  patternId: string|null,  // identifier of the matched threat pattern
  reason:    string|null,  // human-readable block reason
}
```

`scanContextContent` additionally returns a `sanitized` field — a safe placeholder string that callers can inject instead of the original blocked content.

### Threat detection categories

**Memory writes — checked for:**

| Pattern ID | What it catches |
|---|---|
| `prompt_injection` | "ignore previous/all/above/prior instructions" |
| `role_hijack` | "you are now [X]" |
| `deception_hide` | "do not tell the user" |
| `sys_prompt_override` | "system prompt override" |
| `disregard_rules` | "disregard your instructions/rules/guidelines" |
| `bypass_restrictions` | "act as if you have no restrictions" |
| `exfil_curl` | `curl ... $API_KEY / $TOKEN / $SECRET` |
| `exfil_wget` | `wget ... $API_KEY / $TOKEN / $SECRET` |
| `read_secrets` | `cat .env / credentials / .netrc / .pgpass` |
| `ssh_backdoor` | `authorized_keys` references |
| `ssh_access` | `$HOME/.ssh / ~/.ssh` references |
| `invisible_unicode` | Zero-width spaces, directional overrides, BOM |

**Context file injection — additionally checked for:**

| Pattern ID | What it catches |
|---|---|
| `html_comment_injection` | `<!-- ... ignore/override/system/secret ... -->` |
| `hidden_div` | `<div style="display:none">` hidden content |
| `translate_execute` | "translate X and execute/run/eval" |

**Important:** Benign UTF-8 content (Cyrillic, CJK, accented Latin) is not flagged. Only characters with no visible representation and a known injection risk are blocked.

---

## 📸 Module: snapshot

**File:** `lib/runtime/snapshot.js`

Implements **frozen session snapshot semantics** — the key invariant that the memory context an agent reads at session start cannot be altered by mid-session memory writes.

### How it works

1. `createSnapshot(sources, options)` reads each file in `sources` (memory-bank files, context files).
2. All file contents are captured at read time.
3. The resulting `SessionSnapshot` object is frozen with `Object.freeze()` — it is structurally immutable for the lifetime of the session.
4. If a source file is modified after snapshot creation, `getActiveSnapshot()` still returns the frozen original content.

### SessionSnapshot shape

```js
{
  sessionId:    string,   // e.g. '20260416T143022-a3f1c9'
  createdAt:    string,   // ISO 8601 timestamp
  sources:      string[], // frozen array of file paths
  files: [
    { path, content, loadedAt, error }  // frozen per-file record
  ],
  contentHash:  string,   // SHA-256 of all loaded contents
  loadedCount:  number,
  errorCount:   number,
  frozen:       true,     // always true
}
```

### Singleton pattern

The module maintains a single active snapshot per process:

| Function | Purpose |
|---|---|
| `buildAndActivateSnapshot(sources, options)` | Create and activate; throws if already active |
| `getActiveSnapshot()` | Return active snapshot or `null` |
| `clearActiveSnapshot()` | Reset; use between test runs or explicit refreshes |
| `describeSnapshot(snapshot)` | Return human-readable diagnostics string |
| `renderSnapshotContent(snapshot, options)` | Concatenate all file contents with `<!-- source: -->` markers |

---

## 🔲 Module: fenced-context

**File:** `lib/runtime/fenced-context.js`

Provides the canonical **fenced recall block** format for Memora — a structured wrapper for content recalled from previous sessions.

### Why fencing matters

When recalled content is injected into the system prompt without a clear wrapper, the agent cannot easily distinguish between:
- current project facts,
- historical summaries from past sessions,
- active user instructions.

The fenced format makes the boundary explicit.

### Fenced block format

```xml
<memory_context type="recall" source="session-2026-04-14" query="sprint planning">
Recalled content here.
Content is sanitized before being placed inside the block.
</memory_context>
```

### Functions

| Function | Purpose |
|---|---|
| `sanitizeRecalledContent(content)` | Remove nested blocks, source comments, `[BLOCKED:]` stubs; collapse blank lines |
| `buildFencedBlock(content, attrs)` | Wrap content in `<memory_context>` with XML-escaped attributes |
| `buildRecallBlock(content, metadata)` | Full pipeline: sanitize → fence; returns `''` if empty after sanitize |
| `extractFencedBlocks(text)` | Parse all `<memory_context>` blocks from a string |
| `stripFencedBlocks(text)` | Remove all `<memory_context>` blocks, return surrounding text |

### Sanitization rules

`sanitizeRecalledContent` applies these transformations in order:

1. Remove `<memory_context>...</memory_context>` blocks (prevents recursive nesting).
2. Remove `<!-- source: ... -->` annotation comments (added by `renderSnapshotContent`).
3. Remove `[BLOCKED: ...]` stubs (added by `scanContextContent` when a file is blocked).
4. Collapse 3+ consecutive blank lines to 2.
5. Trim surrounding whitespace.

---

## 🗄️ Module: transcript/store (Phase 2)

**File:** `lib/runtime/transcript/store.js`

JSONL-backed session transcript storage. Stores conversation history separately from the canonical `memory-bank/`, satisfying the requirement that transcript memory must not pollute stable knowledge files.

### Design decisions

- **Zero external dependencies** — uses Node.js `fs` built-ins only (no `better-sqlite3`, no `node:sqlite`). Interface-stable: a future SQLite backend can replace the JSONL internals without changing callers.
- **Atomic writes (FR-006)** — `writeFileAtomic()` writes to a temp file (`.filename.tmp.PID`, same directory) then calls `fs.renameSync()`. Concurrent readers always see either the old complete file or the new complete file — never a partially-written version.
- **Append-only messages** — `fs.appendFileSync` is effectively atomic on POSIX for records below PIPE_BUF (~4 KB), which covers all transcript records.
- **Default storage location** — `memory-bank/.local/` (two files: `transcript-sessions.jsonl` and `transcript-messages.jsonl`). Can be overridden via `options.dataDir`.

### Session schema (`SessionRecord`)

```js
{
  sessionId:    string,      // unique identifier, e.g. '20260416T143022-a3f1c9'
  projectDir:   string,      // absolute path at open time
  source:       string,      // 'claude' | 'codex' | 'qwen' | 'opencode' | 'cli' | 'test' | 'unknown'
  startedAt:    string,      // ISO 8601
  endedAt:      string|null, // ISO 8601, null while open
  messageCount: number,
  title:        string|null,
}
```

### Message schema (`MessageRecord`)

```js
{
  id:         number,      // auto-incrementing, file-scoped
  sessionId:  string,
  role:       string,      // 'user' | 'assistant' | 'tool' | 'system'
  content:    string|null,
  toolName:   string|null,
  toolCalls:  string|null, // JSON-serialized array
  timestamp:  string,      // ISO 8601
  tokenCount: number|null,
}
```

### API

```js
const { TranscriptStore } = require('./lib/runtime/transcript/store');
const store = new TranscriptStore({ dataDir: '/path/to/data' });

// Sessions
const session  = store.openSession('sess-001', { source: 'claude', title: 'Sprint planning' });
const sessions = store.listSessions({ limit: 10, source: 'claude' });
const closed   = store.closeSession('sess-001', { title: 'Sprint review' });
const found    = store.getSession('sess-001');

// Messages
const msg  = store.appendMessage('sess-001', { role: 'user', content: 'Hello' });
const msgs = store.getMessages('sess-001');

// Search (FR-010 baseline)
const results = store.search('sprint', { maxSessions: 5, source: 'claude' });
// returns: [{ session: SessionRecord, messages: MessageRecord[] }, ...]
```

### Search behavior

`search(query, options)` performs case-insensitive substring matching across all message content. Results are:
- grouped by session,
- ordered by session `startedAt` descending (most recent first),
- with stable tiebreaking by file insertion order when timestamps are equal,
- limited to `maxSessions` sessions (default: 5).

---

## 🔍 Module: transcript/recall (Phase 2)

**File:** `lib/runtime/transcript/recall.js`

Recall pipeline that transforms raw `TranscriptStore.search()` results into a canonical fenced recall block ready for agent context injection. Implements FR-011 (Recall summarization).

### Pipeline

```
TranscriptStore.search(query)
  → formatConversation(messages)        // human-readable transcript text per session
  → truncateAroundMatches(text, query)  // smart window centred on match positions
  → buildSessionBlock(session, text)    // labelled block with header + excerpt
  → buildRecallBlock(assembled)         // canonical <memory_context> fenced block
```

### Design decisions

- **No LLM summarization** — Memora's zero-dep constraint means structured text excerpts are returned instead of model-generated summaries. This is the explicit degraded mode from FR-011; a future optional summarizer can be layered on top of `recallTranscripts()` without changing the interface.
- **`DEFAULT_MAX_SESSION_CHARS = 40 000`** — Hermes uses 100k (for an LLM summarizer). Memora's recall goes directly into agent context injection, where a smaller window is more appropriate.
- **Failure isolation** — errors from `store.search()` are caught and surfaced in `diagnostics`, never re-thrown. The caller always receives a well-formed `RecallResult`.

### Functions

| Function | Purpose |
|---|---|
| `formatConversation(messages)` | Format `MessageRecord[]` into a readable transcript (port of Hermes `_format_conversation`) |
| `truncateAroundMatches(text, query, maxChars)` | Smart truncation centred on match positions (port of Hermes `_truncate_around_matches`) |
| `formatSessionHeader(session)` | One-line session label: `Session: … \| Source: … \| Started: … \| Messages: …` |
| `buildSessionBlock(session, messages, query, opts)` | Assemble header + excerpt for a single session result |
| `recallTranscripts(store, query, opts)` | Main entry point — returns `RecallResult` |

### RecallResult shape

```js
{
  found:        boolean,  // true if at least one session matched
  block:        string,   // fenced recall block ('' if not found)
  sessionCount: number,   // sessions included in the block
  query:        string,   // the trimmed query that was used
  diagnostics:  string,   // human-readable status message
}
```

### Truncation strategy

`truncateAroundMatches` uses three strategies in priority order (mirrors Hermes `_truncate_around_matches`):

1. **Full-phrase positions** — case-insensitive exact phrase match.
2. **Proximity co-occurrence** — all query terms appear within 200 chars of the rarest-term position.
3. **Individual term positions** — any occurrence of any query word (last resort).

Window selection: for each candidate position, the window `[pos − maxChars/4, pos + 3·maxChars/4]` is scored by how many match positions it covers. The window with the highest score is chosen.

### Usage

```js
const { TranscriptStore } = require('./lib/runtime/transcript/store');
const { recallTranscripts } = require('./lib/runtime/transcript/recall');

const store = new TranscriptStore();
const result = recallTranscripts(store, 'sprint planning', { maxSessions: 3 });

if (result.found) {
  // result.block is a ready-to-inject <memory_context type="recall"> fenced block
  console.log(result.block);
} else {
  console.log(result.diagnostics);  // e.g. 'No sessions found matching "sprint planning".'
}
```

---

## 📋 Module: provider (Phase 3)

**File:** `lib/runtime/provider.js`

Defines the `MemoryProvider` base class — the contract every optional memory provider must implement. All methods have **no-op / safe-default implementations** so subclasses only override what they actually need.

### Lifecycle overview

```
(1) Registration  → ProviderRegistry.addProvider(provider)
(2) Startup       → provider.isAvailable() checked; if false, skipped
                    provider.initialize(sessionId, opts)
(3) Per-turn      → provider.onTurnStart(turnNumber, message, opts)
                    provider.prefetch(query, opts)        → context string
                    provider.syncTurn(user, assistant, opts)
                    provider.queuePrefetch(query, opts)   [background]
(4) Hooks         → provider.onPreCompress(messages)     → string
                    provider.onMemoryWrite(action, target, content)
                    provider.onDelegation(task, result, opts)
(5) Session end   → provider.onSessionEnd(messages)
(6) Shutdown      → provider.shutdown()
```

### Method reference

| Method | Default | Purpose |
|---|---|---|
| `get name()` | `'unnamed'` | Unique provider id; subclasses **MUST** override |
| `isAvailable()` | `true` | Return `false` to skip initialization (no network calls allowed) |
| `initialize(sessionId, opts)` | no-op | Called once at session start |
| `shutdown()` | no-op | Called in reverse registration order at teardown |
| `systemPromptBlock()` | `''` | Static text to include in system prompt |
| `prefetch(query, opts)` | `''` | Recall relevant context before each turn |
| `queuePrefetch(query, opts)` | no-op | Background prefetch for next turn |
| `syncTurn(user, assistant, opts)` | no-op | Persist completed turn to backend |
| `getToolSchemas()` | `[]` | Tool schemas to expose to the model |
| `handleToolCall(name, args, opts)` | throws | Dispatch a tool call; override if `getToolSchemas()` is non-empty |
| `onTurnStart(n, message, opts)` | no-op | Turn-start tick |
| `onSessionEnd(messages)` | no-op | Session-end hook |
| `onPreCompress(messages)` | `''` | Pre-compression hook; return text for compressor |
| `onMemoryWrite(action, target, content)` | no-op | Mirror canonical memory writes |
| `onDelegation(task, result, opts)` | no-op | Subagent completion observation |

### Extending

```js
const { MemoryProvider } = require('./lib/runtime/provider');

class MyProvider extends MemoryProvider {
  get name() { return 'my-backend'; }

  initialize(sessionId, opts) {
    this._client = new MyBackendClient(opts.apiKey);
  }

  prefetch(query, opts) {
    return this._client.search(query);
  }

  syncTurn(user, assistant) {
    this._client.store({ user, assistant });
  }
}
```

---

## 🔀 Module: provider-registry (Phase 3)

**File:** `lib/runtime/provider-registry.js`

`ProviderRegistry` orchestrates multiple `MemoryProvider` instances with **full failure isolation**: errors in any single provider are caught, logged to `registry.diagnostics`, and never propagate to block other providers.

### Registration

```js
const { ProviderRegistry }    = require('./lib/runtime/provider-registry');
const { LocalMemoryProvider } = require('./lib/runtime/providers/local');

const registry = new ProviderRegistry();
registry.addProvider(new LocalMemoryProvider());
// returns true; returns false on duplicate name
```

- **First-registered wins** on tool name collision — duplicates are noted in `diagnostics`
- Providers with `isAvailable() === false` are registered but skipped by `initializeAll()`
- `providers` property returns a snapshot copy of the registration list

### Bulk lifecycle

```js
const { initialized, skipped, failed } = registry.initializeAll('sess-001', {
  projectDir: process.cwd(),
  source: 'claude',
});
// skipped: providers where isAvailable() returned false
// failed:  providers where initialize() threw

const { shutdown, failed } = registry.shutdownAll();
// iterates in reverse registration order (clean teardown)
```

### Fan-out operations

All fan-out methods catch per-provider exceptions and append them to `registry.diagnostics`:

| Method | Returns | Fan-out strategy |
|---|---|---|
| `buildSystemPrompt()` | `string` | Joins `systemPromptBlock()` results with `"\n\n"` |
| `prefetchAll(query, opts)` | `string` | Joins `prefetch()` results with `"\n\n"` |
| `queuePrefetchAll(query, opts)` | `void` | Fire-and-forget background prefetch |
| `syncAll(user, assistant, opts)` | `void` | Calls `syncTurn()` on all providers |
| `onTurnStart(n, msg, opts)` | `void` | Turn-start hook |
| `onSessionEnd(messages)` | `void` | Session-end hook |
| `onPreCompress(messages)` | `string` | Joins pre-compression contributions |
| `onMemoryWrite(action, target, content)` | `void` | Memory write hook |
| `onDelegation(task, result, opts)` | `void` | Subagent completion hook |

### Tool routing

```js
registry.getToolSchemas()                          // aggregated, deduplicated
registry.hasTool('recall_transcripts')             // true if any provider owns this tool
registry.handleToolCall('recall_transcripts', args) // routes to owning provider; returns JSON string
// On error or unknown tool: returns JSON { error: '...' }
```

---

## 🏠 Module: providers/local (Phase 3)

**File:** `lib/runtime/providers/local.js`

`LocalMemoryProvider` is Memora's **built-in zero-dependency memory provider**. It bridges the Phase 2 Transcript Layer (`TranscriptStore` + `recallTranscripts`) to the Phase 3 `MemoryProvider` contract.

- `isAvailable()` always returns `true` — no external service required
- `store` is injectable via constructor option for isolated testing

### Quick start

```js
const { LocalMemoryProvider } = require('./lib/runtime/providers/local');

// Default — creates its own TranscriptStore pointing at memory-bank/.local/
const provider = new LocalMemoryProvider();

// Custom data directory
const provider = new LocalMemoryProvider({ dataDir: '/path/to/data' });

// Inject a pre-built store (testing)
const provider = new LocalMemoryProvider({ store: testStore });
```

### Lifecycle mapping

| `MemoryProvider` method | `LocalMemoryProvider` behavior |
|---|---|
| `initialize(sessionId, opts)` | Lazy-creates `TranscriptStore`; calls `store.openSession()` |
| `prefetch(query, opts)` | Calls `recallTranscripts(store, query, opts)`; returns fenced block string (or `''` if no matches) |
| `syncTurn(user, assistant)` | Calls `store.appendMessage()` for user then assistant messages |
| `onSessionEnd(messages)` | Calls `store.closeSession()` |
| `shutdown()` | Calls `store.closeSession()` as safety fallback (idempotent) |

Out-of-scope for Phase 3 (inherited no-op defaults): tool schemas, `systemPromptBlock`, `queuePrefetch`, `onTurnStart`, `onPreCompress`, `onMemoryWrite`, `onDelegation`.

---

## 🔌 Public API (`lib/runtime/index.js`)

The `index.js` module re-exports all sub-modules and provides a high-level convenience API covering all three phases.

```js
const runtime = require('./lib/runtime');
```

### High-level functions

#### `runtime.initSession(sources, options)`

Build and activate a frozen snapshot from the given file paths.

```js
const { snapshot, diagnostics, hasErrors } = runtime.initSession([
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
]);
// snapshot.frozen === true
// snapshot.loadedCount, snapshot.errorCount
// diagnostics: human-readable summary string
```

Throws if a session is already active. Call `resetSession()` first for an explicit refresh.

---

#### `runtime.checkMemoryWrite(content)`

Screen content before persisting it to a memory file.

```js
const { allowed, reason, patternId } = runtime.checkMemoryWrite(content);
if (!allowed) {
  console.warn(`Blocked (${patternId}): ${reason}`);
}
```

---

#### `runtime.loadContextFile(filePath)`

Read and screen a prompt-adjacent context file (`AGENTS.md`, `CLAUDE.md`, etc.) before injection.

```js
const { allowed, content, diagnostics, patternId } = runtime.loadContextFile('./AGENTS.md');
// content: original if clean; '[BLOCKED: ...]' placeholder if threat detected
// caller can inject 'content' in both cases (blocked placeholder is safe)
```

---

#### `runtime.buildRecallBlock(content, metadata)`

Sanitize and wrap recalled content in a canonical fenced block.

```js
const block = runtime.buildRecallBlock(recalledText, {
  source: 'session-2026-04-14',
  query:  'sprint planning',
});
// '<memory_context type="recall" source="..." query="...">\n...\n</memory_context>'
```

---

#### `runtime.getSession()` / `runtime.resetSession()`

```js
const snap = runtime.getSession();   // null before initSession
runtime.resetSession();              // clear active snapshot
```

---

---

### Transcript API (Phase 2)

#### `runtime.openTranscriptSession(sessionId, meta)`

Open a new transcript session. Returns `{ opened, session, diagnostics }`.

```js
const { opened, session } = runtime.openTranscriptSession('sess-001', {
  projectDir: process.cwd(),
  source:     'claude',
  title:      'Sprint planning',
});
```

#### `runtime.appendTranscriptMessage(sessionId, message)`

Append a message to an open session. Returns `{ appended, message, diagnostics }`.

```js
runtime.appendTranscriptMessage('sess-001', { role: 'user', content: 'Hello' });
```

#### `runtime.recallTranscripts(query, options)`

Search transcript history and return a `RecallResult` (fenced block + metadata).

```js
const { found, block, sessionCount } = runtime.recallTranscripts('sprint planning', {
  maxSessions: 3,
  source:      'claude',
});
if (found) injectIntoPrompt(block);
```

#### `runtime.resetTranscriptStore(store?)`

Clear (or replace) the module-level `TranscriptStore` singleton — use between test runs.

---

### Provider Registry API (Phase 3)

#### `runtime.getProviderRegistry()`

Return the module-level `ProviderRegistry` singleton (lazy-initialized).

```js
const registry = runtime.getProviderRegistry();
registry.addProvider(new runtime.localProvider.LocalMemoryProvider());
registry.initializeAll(sessionId, { projectDir, source: 'claude' });
```

#### `runtime.resetProviderRegistry(registry?)`

Clear (or replace) the module-level `ProviderRegistry` singleton — use between test runs.

#### `runtime.onTurnStart(turnNumber, message, opts)`

Fan-out to all registered providers at the start of each agent turn.

#### `runtime.onSessionEnd(messages)`

Fan-out to all registered providers when the agent session ends.

#### `runtime.onPreCompress(messages)` → `string`

Fan-out before context compression. Returns combined provider contributions (joined by `"\n\n"`).

#### `runtime.onMemoryWrite(action, target, content)`

Fan-out when a canonical memory file is written. `action`: `'add' | 'replace' | 'remove'`.

#### `runtime.onDelegation(task, result, opts)`

Fan-out after a subagent delegation completes.

---

### Low-level sub-module access

```js
// Phase 1
runtime.security        // → { scanMemoryContent, scanContextContent }
runtime.snapshot        // → { createSnapshot, buildAndActivateSnapshot, ... }
runtime.fenced          // → { buildRecallBlock, sanitizeRecalledContent, ... }

// Phase 2
runtime.transcriptStore  // → { TranscriptStore }
runtime.transcriptRecall // → { recallTranscripts, formatConversation, ... }

// Phase 3
runtime.provider         // → { MemoryProvider }
runtime.providerRegistry // → { ProviderRegistry }
runtime.localProvider    // → { LocalMemoryProvider }
```

---

## 🔐 Security patterns reference

### Invisible Unicode detection

The following Unicode code points are blocked (no visible representation + known injection risk):

| Code point | Name |
|---|---|
| U+200B | Zero Width Space |
| U+200C | Zero Width Non-Joiner |
| U+200D | Zero Width Joiner |
| U+2060 | Word Joiner |
| U+FEFF | Zero Width No-Break Space (BOM) |
| U+202A | Left-to-Right Embedding |
| U+202B | Right-to-Left Embedding |
| U+202C | Pop Directional Formatting |
| U+202D | Left-to-Right Override |
| U+202E | Right-to-Left Override |

---

## 💡 Usage examples

### Full Phase 1 pipeline

```js
const runtime = require('./lib/runtime');

// 1. Capture session context as frozen snapshot
const { snapshot } = runtime.initSession([
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
]);

// 2. Before a memory write — screen for threats
const { allowed, reason } = runtime.checkMemoryWrite(newContent);
if (!allowed) throw new Error(reason);
// ... proceed with write

// 3. Before injecting a context file — screen it
const ctx = runtime.loadContextFile('./AGENTS.md');
const safeContent = ctx.content; // placeholder if blocked, original if clean

// 4. Build a recall block for session handoff
const block = runtime.buildRecallBlock(previousSessionSummary, {
  source: snapshot.sessionId,
  query:  'previous session',
});

// 5. At end of session — clear snapshot
runtime.resetSession();
```

---

## 🏗️ Relationship to memory-bank

The runtime layer and the `memory-bank/` are intentionally separate:

| Layer | Role | Location | Writes to |
|---|---|---|---|
| `memory-bank/` | Canonical knowledge (durable) | `memory-bank/` files | Memory workflows (update-memory, etc.) |
| `lib/runtime/` | Session + security runtime | `lib/runtime/` modules | Does **not** write to `memory-bank/` |

The runtime layer is a **read-and-screen gate**, not a replacement for the knowledge model. It enforces security invariants that complement the declarative rules in `SECURITY.md` and `.claude/rules/security.md`.

---

## 🗺️ Roadmap

### Phase 1 — ✅ Complete (2026-04-16)

- `security-scanner.js` — 21 threat patterns, invisible Unicode detection
- `snapshot.js` — frozen snapshot semantics, session ID, content hash
- `fenced-context.js` — sanitize + fence pipeline, extract + strip utilities
- `index.js` — high-level public API
- 134 tests, all green

### Phase 2 — ✅ Complete (2026-04-16)

- **Step 1** — `lib/runtime/transcript/store.js` — JSONL-backed `TranscriptStore`; `writeFileAtomic()` (FR-006); rich schema (FR-009); `search()` (FR-010 baseline); 44 tests ✓
- **Step 2** — `lib/runtime/transcript/recall.js` — `formatConversation` + `truncateAroundMatches` + `buildSessionBlock` + `recallTranscripts()` → `RecallResult`; degraded mode (FR-011) ✓
- **Step 3** — `lib/runtime/index.js` public API: `openTranscriptSession`, `appendTranscriptMessage`, `recallTranscripts`, `resetTranscriptStore` ✓
- **Step 4** — 28 integration tests (FR-002, FR-007, FR-009, FR-010, FR-011, FR-016) ✓

### Phase 3 — 🔄 In Progress (2026-04-16)

**Step 1 — ✅ Shipped:**
- `lib/runtime/provider.js` — `MemoryProvider` base class; all lifecycle methods as no-op defaults; `handleToolCall` throws by contract (FR-014 contract layer)

**Step 2 — ✅ Shipped:**
- `lib/runtime/provider-registry.js` — `ProviderRegistry` orchestrator; failure isolation per provider; `_fireAll` + `_collectStrings` fan-out helpers; tool routing via `_toolToProvider` map; all 5 lifecycle hooks (FR-015)

**Step 3 — ✅ Shipped:**
- `lib/runtime/providers/local.js` — `LocalMemoryProvider`; bridges Phase 2 transcript API to Phase 3 contract; injectable store for testing; idempotent `_closeSession()` (FR-014 built-in provider)

**Step 4 — ✅ Shipped:**
- `lib/runtime/index.js` extended: `getProviderRegistry`, `resetProviderRegistry`, convenience wrappers for 5 lifecycle hooks, low-level re-exports for all Phase 3 modules (FR-014, FR-015)

**Step 5 — 📋 Next:**
- Unit/integration tests for `MemoryProvider`, `ProviderRegistry`, `LocalMemoryProvider` and Phase 3 `index.js` API

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [SECURITY.md](./SECURITY.md) |
| → See also | [MEMORY_MODEL.md](./MEMORY_MODEL.md) · [WORKFLOWS.md](./WORKFLOWS.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
