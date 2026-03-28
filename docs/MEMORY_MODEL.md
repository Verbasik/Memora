# Memory Model

**Purpose:** explain how Memora structures project memory.  
**Audience:** users, maintainers, architects, contributors.  
**Read when:** you want to understand the conceptual and practical layout of the Memora memory-bank.  
**See also:** [Workflows](./WORKFLOWS.md), [Patterns](./PATTERNS.md), [Manifesto](./MANIFESTO.md)

---

## Overview

Memora gives a repository a structured memory architecture for long-lived AI coding work.

At a high level:

```text
Agent starts
→ reads AGENTS.md
→ routes through memory-bank/INDEX.md
→ loads only relevant memory files
→ performs the task
→ updates current session state
→ uses lifecycle workflows and hooks as needed
```

The goal is simple:

- stable knowledge should be easy to find,
- active session state should stay isolated,
- agents should read only the minimum relevant context.

---

## Why a layered model?

Without structure, project memory tends to collapse into one of two bad patterns:

1. one giant instruction file,
2. many disconnected notes with overlapping meaning.

Memora avoids both by separating knowledge by role, stability, and lifecycle.

This gives you:

- clearer ownership,
- less duplication,
- better continuity,
- more predictable agent behavior.

---

## The four memory layers

### 1. Structural memory

This layer contains stable project framing and governance.

Typical files:

- `CONSTITUTION.md`
- `PROJECT.md`
- `ARCHITECTURE.md`
- `CONVENTIONS.md`
- `TESTING.md`

This layer answers questions such as:

- What is this project?
- How is it organized?
- Which rules and conventions matter?
- How do we validate changes?

---

### 2. Semantic memory

This layer contains reusable, stable, domain-relevant knowledge.

Typical locations:

- `FACTS/`
- `DECISIONS.md`
- `ADR/`
- `PATTERNS/`
- `AREAS/`
- `POLICIES/`
- `AGENTS/`
- `TESTS/`

This layer answers questions such as:

- Which facts should be remembered?
- Which decisions were made and why?
- Which reusable techniques already exist?
- Which subsystem-specific knowledge matters?

---

### 3. Episodic memory

This layer captures structured records of past work and unresolved issues.

Typical locations:

- `EPISODES/`
- `OPEN_QUESTIONS.md`
- `CHANGELOG.md`

This layer is useful when you need:

- context from previous sessions,
- unresolved questions,
- records of meaningful milestones.

---

### 4. Session memory

This layer holds active, current, local working state.

Typical locations:

- `.local/CURRENT.md`
- `.local/HANDOFF.md`
- `.local/SESSIONS/`

This layer is intentionally separated from stable project knowledge. It gives agents a place to track active work without polluting durable memory.

---

## Canonical ownership

One of the strongest ideas in Memora is **canonical ownership**.

Each kind of knowledge should have one primary owner.

Examples:

- project identity → `PROJECT.md`
- system design → `ARCHITECTURE.md`
- engineering conventions → `CONVENTIONS.md`
- validation rules → `TESTING.md`
- architecture decisions → `DECISIONS.md` and `ADR/`
- current state → `.local/CURRENT.md`
- handoff context → `.local/HANDOFF.md`

This keeps the memory-bank readable and reduces semantic drift.

---

## Minimal relevant context

Memora is designed around the idea that agents should not read the whole repository by default.

Instead:

- `AGENTS.md` defines the entry contract,
- `memory-bank/INDEX.md` routes the task to the right files,
- the agent loads only the files needed for the current task.

This is one of the most important practical properties of the system: it keeps context cleaner and more intentional.

---

## The role of `AGENTS.md`

`AGENTS.md` is the main entry point for AI agents.

It defines:

- bootstrap order,
- reading rules,
- operating rules,
- completion expectations,
- memory-bank map.

It acts as the first control surface before the agent starts loading project memory.

---

## The role of `memory-bank/INDEX.md`

`memory-bank/INDEX.md` is the routing table.

It answers:

- what to read first,
- what to read only when needed,
- where specific knowledge belongs,
- how to handle ambiguity.

It is the practical router for minimal relevant context.

---

## Session state and continuity

Memora isolates active session state in `.local/`.

This gives two major benefits:

### 1. Active work stays lightweight
You can keep current progress, next steps, and handoff notes close at hand.

### 2. Stable knowledge stays clean
Long-lived architectural or project facts do not need to live in temporary session notes.

This separation is one of the reasons Memora remains scalable as projects and sessions grow.

---

## Repository structure through the memory lens

A typical Memora-enabled repository combines four concerns:

1. **CLI tooling** — command-line entry points
2. **memory-bank scaffold** — the knowledge structure itself
3. **operational automation** — hooks, validation, CI
4. **toolchain adapters** — integration with AI coding environments

That makes the repository more than a prompt pack: it becomes a structured operating environment for agent memory.

---

## How the layers work together

A healthy Memora flow looks like this:

```text
Stable identity and rules
→ route only to relevant knowledge
→ work using current session context
→ update current state
→ maintain memory with workflows and hooks
```

This creates a strong balance between:

- durable memory,
- working context,
- operational maintenance.

---

## Practical benefits

Teams using the model gain:

- a predictable place for each kind of knowledge,
- a smaller and cleaner context surface for agents,
- better continuity between sessions,
- better maintainability of project memory,
- reusable structure across multiple toolchains.

---

## Next reading

To continue from the model into actual usage:

- [Workflows](./WORKFLOWS.md)
- [Patterns](./PATTERNS.md)
- [Validation](./VALIDATION.md)
- [Toolchains](./TOOLCHAINS.md)

---

**Last updated:** 2026-03-28
