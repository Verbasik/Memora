# ⚙️ Workflows

**Purpose:** Explain the memory workflows included in the Memora repository.  
**Audience:** Users, maintainers, toolchain integrators.  
**Read when:** You want to understand how Memora organizes session start, session update, maintenance, and cleanup workflows.  
**Last updated:** 2026-04-03

**See also:** [Memory Model](./MEMORY_MODEL.md) · [Toolchains](./TOOLCHAINS.md) · [Patterns](./PATTERNS.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Why workflows matter](#-why-workflows-matter)
- [The eight workflows](#-the-eight-workflows)
- [Session-start workflows](#-session-start-workflows)
- [Session-update workflow](#-session-update-workflow)
- [Quality and maintenance workflows](#-quality-and-maintenance-workflows)
- [Consolidation and synthesis workflows](#-consolidation-and-synthesis-workflows)
- [Cleanup workflow](#-cleanup-workflow)
- [A practical workflow sequence](#-a-practical-workflow-sequence)
- [Why the workflow set is valuable](#-why-the-workflow-set-is-valuable)
- [Best practices](#-best-practices)
- [Navigation](#-navigation)

---

## 🎯 Overview

Memora includes documented workflows for the core stages of memory lifecycle management.

These workflows are a major strength of the repository because they provide a **portable operational protocol set** across multiple AI coding environments.

The workflow set includes:

- `memory-bootstrap`
- `memory-restore`
- `update-memory`
- `memory-audit`
- `memory-consolidate`
- `memory-reflect`
- `memory-gc`
- `memory-clarify`

These are supplied through the toolchain adapter layer:

- Claude Code skills
- Codex skills
- Qwen agent files
- OpenCode commands

---

## 📊 The eight workflows

| Workflow | When to use | What it does |
|----------|-------------|-------------|
| **memory-bootstrap** | New memory-bank or template-only content | Inspect repo, fill core files, establish baseline |
| **memory-restore** | Begin a new work session | Restore context from previous session, load .local/ |
| **update-memory** | After completing work | Update CURRENT.md, HANDOFF.md, promote session notes |
| **memory-audit** | Before major tasks or weekly | Check memory bank integrity, find gaps, list issues |
| **memory-consolidate** | After 3+ sessions | Move session notes to stable EPISODES/, clean up |
| **memory-reflect** | After consolidation | Synthesize learnings, create higher-order insights |
| **memory-gc** | When sessions accumulate | Archive old SESSIONS/, compress CURRENT.md |
| **memory-clarify** | When audit shows gaps | Generate targeted questions to fill knowledge gaps |

---

## 🏗️ Why workflows matter

A memory-bank becomes much more useful when teams know:

- how to start a session,
- how to continue a session,
- how to update state after work,
- how to maintain quality over time,
- how to consolidate and clean up growing memory.

The included workflow set gives Memora operational shape, not just file structure.

---

## 🚀 Session-start workflows

### `memory-bootstrap`

Use this workflow when the memory-bank has just been initialized or still contains mostly template content.

Its role is to help establish the first meaningful project memory:

- inspect the repository,
- fill core memory files,
- create initial current and handoff state,
- establish a stronger working baseline.

### `memory-restore`

Use this workflow at the beginning of a new work session.

Its role is to:

- restore current context,
- read session briefing and active state,
- route into only the files needed for the current task,
- keep startup context lightweight and relevant.

---

## 📝 Session-update workflow

### `update-memory`

Use this workflow after meaningful progress or before ending a session.

Its role is to:

- refresh `.local/CURRENT.md`,
- refresh `.local/HANDOFF.md`,
- preserve continuity,
- promote stable knowledge when appropriate.

This workflow is one of the most practical parts of the Memora operating model because it keeps active work connected to durable project memory.

---

## 🔧 Quality and maintenance workflows

### `memory-audit`

Use this workflow when you want to inspect memory quality and integrity.

Its role is to review:

- freshness,
- drift,
- duplication,
- size limits,
- safety and hygiene,
- other memory-bank quality signals.

### `memory-clarify`

Use this workflow when there are gaps, conflicts, or unresolved questions.

Its role is to turn ambiguity into explicit follow-up questions or tracked issues.

Together, `memory-audit` and `memory-clarify` help keep project memory reviewable and trustworthy.

---

## 🔄 Consolidation and synthesis workflows

### `memory-consolidate`

Use this workflow when multiple sessions have accumulated knowledge worth promoting into more stable files.

Its role is to:

- consolidate session notes,
- route durable knowledge to canonical owners,
- reduce duplication,
- strengthen reusable project memory.

### `memory-reflect`

Use this workflow when there is enough accumulated session material to extract recurring insights or patterns.

Its role is to:

- synthesize recurring themes,
- surface reusable patterns,
- strengthen long-lived team memory,
- support more intentional reuse.

This pair gives Memora one of its most distinctive operational strengths: it supports not only memory storage, but memory refinement.

---

## 🗑️ Cleanup workflow

### `memory-gc`

Use this workflow when session-state files have accumulated and the working set needs cleanup.

Its role is to:

- archive old or exhausted session material,
- keep active state compact,
- reduce clutter in `.local/SESSIONS/`,
- preserve memory-bank hygiene over time.

---

## 🎯 A practical workflow sequence

### First-time setup

```text
memora init
→ memora validate
→ fill PROJECT / ARCHITECTURE / CONVENTIONS / TESTING
→ use memory-bootstrap if desired through your selected toolchain
```

### Normal working session

```text
memory-restore
→ work on the task
→ update-memory
```

### Periodic maintenance

```text
memory-audit
→ memory-consolidate
→ memory-reflect
→ memory-gc
```

### When ambiguity appears

```text
memory-audit
→ memory-clarify
```

---

## ✨ Why the workflow set is valuable

The included workflows make Memora strong in practice because they give teams:

- repeatable operational habits,
- continuity across sessions,
- portable memory procedures across toolchains,
- clearer paths for maintenance and refinement.

This is what helps Memora behave like a memory operating model rather than just a folder structure.

---

## 💡 Best practices

- Start each session by restoring context, not by reading everything.
- Keep current and handoff state lightweight and useful.
- Use audit and consolidation regularly, not only when memory feels messy.
- Treat workflows as part of normal engineering practice, not as exceptional operations.
- Keep the memory-bank’s stable layers clean by promoting knowledge intentionally.

---

## 📚 Related reading

| Topic | Link |
|-------|------|
| Memory architecture | [Memory Model](./MEMORY_MODEL.md) |
| Reusable techniques | [Patterns](./PATTERNS.md) |
| Advisory hooks | [Hooks](./HOOKS.md) |
| AI integrations | [Toolchains](./TOOLCHAINS.md) |

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [MEMORY_MODEL.md](./MEMORY_MODEL.md) |
| Next → | [VALIDATION.md](./VALIDATION.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
