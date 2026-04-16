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
├── index.js            ← Public high-level API
├── security-scanner.js ← Prompt injection + exfiltration screening
├── snapshot.js         ← Frozen session snapshot semantics
└── fenced-context.js   ← Fenced recall block builder + sanitizer
```

Each module is independently usable. The `index.js` re-exports all three and provides a convenience API for the most common agent-facing operations.

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

## 🔌 Public API (`lib/runtime/index.js`)

The `index.js` module re-exports all three sub-modules and provides a high-level convenience API.

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

### Low-level sub-module access

```js
runtime.security  // → { scanMemoryContent, scanContextContent }
runtime.snapshot  // → { createSnapshot, buildAndActivateSnapshot, ... }
runtime.fenced    // → { buildRecallBlock, sanitizeRecalledContent, ... }
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

### Phase 2 — 📋 Planned

SQLite + FTS5 transcript store:

- `lib/runtime/transcript/store.js` — session/message schema, WAL mode
- `lib/runtime/transcript/recall.js` — FTS5 search → session grouping → summary
- Secure atomic write path (tempfile + rename)
- Integration with `memory-restore` and `memory-explorer` workflows

### Phase 3 — 📋 Planned

MemoryProvider contract and lifecycle hooks:

- Pluggable provider interface
- Session lifecycle hooks (pre-write, post-recall, on-error)

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [SECURITY.md](./SECURITY.md) |
| → See also | [MEMORY_MODEL.md](./MEMORY_MODEL.md) · [WORKFLOWS.md](./WORKFLOWS.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
