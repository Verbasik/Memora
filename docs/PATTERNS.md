# 🎨 Patterns

**Purpose:** Provide an overview of the reusable knowledge and workflow patterns included in Memora.  
**Audience:** Maintainers, users, contributors, workflow designers.  
**Read when:** You want to understand the reusable ideas that make Memora’s memory-bank more structured and consistent.  
**Last updated:** 2026-04-03

**See also:** [Memory Model](./MEMORY_MODEL.md) · [Workflows](./WORKFLOWS.md) · [Security](./SECURITY.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Why patterns matter](#-why-patterns-matter)
- [Included patterns](#-included-patterns)
- [1. Observation typing](#-1-observation-typing)
- [2. Privacy control](#-2-privacy-control)
- [3. Confidence decay](#-3-confidence-decay)
- [4. Agent profiles](#-4-agent-profiles)
- [5. Progressive disclosure](#-5-progressive-disclosure)
- [6. Provenance standard](#-6-provenance-standard)
- [How the patterns work together](#-how-the-patterns-work-together)
- [Practical value](#-practical-value)
- [Where to read the full definitions](#-where-to-read-the-full-definitions)
- [Navigation](#-navigation)

---

## 🎯 Why patterns matter

Memora is not only a set of files and commands. It also includes reusable patterns that shape how memory should be:

- structured,
- promoted,
- verified,
- reused,
- kept safe.

These patterns give teams a shared vocabulary for disciplined memory work.

---

## 📋 Included patterns

The repository already includes patterns for:

- observation typing,
- privacy control,
- confidence decay,
- agent profiles,
- progressive disclosure,
- provenance standard.

These patterns are one of Memora’s strongest assets because they raise the quality of memory work from “store notes” to “operate a structured memory system”.

---

## 1️⃣ Observation typing

Observation typing helps classify memory signals in a structured way.

This is useful when you want to distinguish different kinds of events such as:

- bugfixes,
- features,
- refactors,
- discoveries,
- decisions,
- incidents.

Why it matters:

- helps route knowledge to the right canonical owner,
- makes session notes easier to consolidate,
- improves memory discipline across repeated workflows.

---

## 2️⃣ Privacy control

Privacy control defines how sensitive content should be handled in memory workflows.

This pattern is especially important because project memory can accidentally attract:

- secrets,
- credentials,
- sensitive data,
- content that should remain local or short-lived.

Privacy control gives Memora a clear operating vocabulary for memory hygiene and safe promotion behavior.

For full detail, see the privacy pattern in `memory-bank/PATTERNS/privacy-control.md`.

---

## 3️⃣ Confidence decay

Confidence decay introduces a lifecycle for remembered facts.

Why it matters:

- not all facts stay equally trustworthy forever,
- some knowledge needs re-verification,
- older memory should not silently behave as always-fresh knowledge.

This gives the system a more realistic model of long-lived memory quality.

---

## 4️⃣ Agent profiles

Agent profiles let different agent roles focus on different kinds of context and memory behavior.

Examples include roles such as:

- full-stack development,
- code review,
- architecture work,
- debugging,
- writing.

Why it matters:

- encourages context loading discipline,
- supports role-sensitive workflows,
- helps keep memory usage more intentional.

For full detail, see `memory-bank/PATTERNS/agent-profiles.md`.

---

## 5️⃣ Progressive disclosure

Progressive disclosure is the idea that an agent should load memory in layers rather than all at once.

Why it matters:

- keeps context smaller,
- reduces noise,
- strengthens minimal relevant context routing,
- aligns with the role of `memory-bank/INDEX.md`.

This pattern is one of the core reasons Memora stays practical for long-lived agent work.

---

## 6️⃣ Provenance standard

The provenance pattern gives memory a traceability discipline.

Why it matters:

- useful facts and patterns should have sources,
- promoted knowledge is easier to review when origin remains visible,
- memory quality improves when teams can trace how knowledge entered the system.

This strengthens auditability and long-term trust in project memory.

---

## 🔗 How the patterns work together

These patterns reinforce one another:

- **observation typing** helps structure events,
- **progressive disclosure** helps control reading,
- **agent profiles** shape context and focus,
- **privacy control** protects memory hygiene,
- **confidence decay** manages freshness,
- **provenance** improves traceability.

Together, they turn Memora into more than a folder layout: they make it a reusable memory method.

---

## ✨ Practical value

For teams, these patterns provide:

- clearer reasoning about memory structure,
- repeatable workflow design,
- safer memory practices,
- better long-term maintainability.

For contributors, they provide a conceptual vocabulary for evolving the project consistently.

---

## 📚 Where to read the full definitions

Use the overview here first, then continue into the source pattern files inside `memory-bank/PATTERNS/`.

Recommended next steps:

- `memory-bank/PATTERNS/privacy-control.md`
- `memory-bank/PATTERNS/agent-profiles.md`
- additional pattern files in the same directory

---

## 📖 Related reading

- [Memory Model](./MEMORY_MODEL.md)
- [Workflows](./WORKFLOWS.md)
- [Security](./SECURITY.md)
- [Manifesto](./MANIFESTO.md)

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [TOOLCHAINS.md](./TOOLCHAINS.md) |
| Next → | [SECURITY.md](./SECURITY.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)
