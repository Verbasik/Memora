# 📚 Documentation Index

**Purpose:** Provide a clear, role-based map of the Memora documentation set.  
**Audience:** Users, maintainers, contributors, and AI-toolchain integrators.  
**Read when:** You want to find the right technical document quickly.  
**Last updated:** 2026-04-17

**See also:** [../README.md](../README.md) | [../memory-bank/INDEX.md](../memory-bank/INDEX.md)

---

## 📖 Table of Contents

- [What to read first](#-what-to-read-first)
- [Documentation by use case](#-documentation-by-use-case)
- [Documentation by role](#-documentation-by-role)
- [Full document map](#-full-document-map)
- [Product docs vs protocol docs](#-product-docs-vs-protocol-docs)
- [Navigation](#-navigation)

---

## 🚀 What to read first

If you are new to Memora, read in this order:

1. [Getting Started](./GETTING_STARTED.md)
2. [CLI Reference](./CLI.md)
3. [Memory Model](./MEMORY_MODEL.md)

After that, continue based on your use case.

---

## 🎯 Documentation by use case

### I want to get Memora running quickly
Read:

- [Getting Started](./GETTING_STARTED.md)
- [CLI Reference](./CLI.md)

### I want to understand the memory-bank architecture
Read:

- [Memory Model](./MEMORY_MODEL.md)
- [Patterns](./PATTERNS.md)
- [Manifesto](./MANIFESTO.md)

### I want to understand validation and quality gates
Read:

- [Validation](./VALIDATION.md)
- [CLI Reference](./CLI.md)

### I want to configure deterministic maintenance hooks
Read:

- [Hooks](./HOOKS.md)
- [Toolchains](./TOOLCHAINS.md)

### I want to integrate Memora with a specific AI toolchain
Read:

- [Toolchains](./TOOLCHAINS.md)
- [Hooks](./HOOKS.md)
- [Workflows](./WORKFLOWS.md)
- [Runtime Bridge TЗ](./TZ/INDEX.md)
- [Runtime Layer](./RUNTIME.md)

### I want to understand the included memory workflows
Read:

- [Workflows](./WORKFLOWS.md)
- [Patterns](./PATTERNS.md)
- [Memory Model](./MEMORY_MODEL.md)

### I want to understand security and memory hygiene
Read:

- [Security](./SECURITY.md)
- [Patterns](./PATTERNS.md)
- [Manifesto](./MANIFESTO.md)

### I want to understand runtime security and context screening
Read:

- [Runtime Layer](./RUNTIME.md)
- [Security](./SECURITY.md)

### I want to understand how automatic session recall works
Read:

- [Runtime Layer](./RUNTIME.md)
- [Hooks](./HOOKS.md)
- [Toolchains](./TOOLCHAINS.md)

---

## 👥 Documentation by role

### Product / engineering leads
- [README](../README.md)
- [Memory Model](./MEMORY_MODEL.md)
- [Workflows](./WORKFLOWS.md)

### Contributors / maintainers
- [CLI Reference](./CLI.md)
- [Validation](./VALIDATION.md)
- [Hooks](./HOOKS.md)
- [Toolchains](./TOOLCHAINS.md)

### AI-toolchain integrators
- [Toolchains](./TOOLCHAINS.md)
- [Hooks](./HOOKS.md)
- [Workflows](./WORKFLOWS.md)
- [Runtime Layer](./RUNTIME.md)

### Security-conscious teams
- [Security](./SECURITY.md)
- [Runtime Layer](./RUNTIME.md)
- [Patterns](./PATTERNS.md)
- [Validation](./VALIDATION.md)

---

## 📋 Full document map

| Document | Canonical question it answers |
|---|---|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | How do I get Memora working in a project quickly? |
| [CLI.md](./CLI.md) | What does the CLI do, and how do I use it? |
| [MEMORY_MODEL.md](./MEMORY_MODEL.md) | How is Memora’s memory-bank structured? |
| [VALIDATION.md](./VALIDATION.md) | How does Memora keep memory files consistent and reviewable? |
| [HOOKS.md](./HOOKS.md) | How do deterministic advisory hooks work? |
| [TOOLCHAINS.md](./TOOLCHAINS.md) | How does Memora connect to Claude Code, Codex CLI, Qwen Code, and OpenCode? |
| [WORKFLOWS.md](./WORKFLOWS.md) | Which memory workflows are included in the repository? |
| [PATTERNS.md](./PATTERNS.md) | Which reusable knowledge and workflow patterns come with Memora? |
| [SECURITY.md](./SECURITY.md) | How does Memora approach security and memory hygiene? |
| [RUNTIME.md](./RUNTIME.md) | How does the runtime layer screen memory writes, manage transcript recall, and connect to toolchain lifecycle events? |
| [TZ/INDEX.md](./TZ/INDEX.md) | How should runtime bridge integration be implemented across toolchains? |
| [COMPATIBILITY.md](./COMPATIBILITY.md) | Which provider versions and features are supported? |
| [MANIFESTO.md](./MANIFESTO.md) | What design philosophy and protocol mindset shape Memora? |

---

## 🔀 Product docs vs protocol docs

Memora documentation intentionally spans two layers:

### Product and implementation docs
These describe what is already included in the repository and how to use it:

- [Getting Started](./GETTING_STARTED.md)
- [CLI Reference](./CLI.md)
- [Validation](./VALIDATION.md)
- [Hooks](./HOOKS.md)
- [Toolchains](./TOOLCHAINS.md)

### Protocol and architecture docs
These describe how Memora organizes memory and agent workflows:

- [Memory Model](./MEMORY_MODEL.md)
- [Workflows](./WORKFLOWS.md)
- [Patterns](./PATTERNS.md)
- [Security](./SECURITY.md)
- [Manifesto](./MANIFESTO.md)

That split is intentional: it keeps the main user path practical while preserving deeper architectural clarity.

---

## 🧭 Navigation

| Document | Link |
|----------|------|
| ← Back | [../README.md](../README.md) |
| Next → | [GETTING_STARTED.md](./GETTING_STARTED.md) |

**Other sections:** [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
