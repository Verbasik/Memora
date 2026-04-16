# ✅ Validation

**Purpose:** Explain how Memora keeps memory files structured and reviewable.  
**Audience:** Users, maintainers, contributors, CI owners.  
**Read when:** You want the canonical view of validation, doctor checks, pre-commit checks, CI, and reference schemas.  
**Last updated:** 2026-04-03

**See also:** [CLI Reference](./CLI.md) · [Getting Started](./GETTING_STARTED.md) · [INDEX.md](./INDEX.md)

---

## 📖 Table of Contents

- [Why validation matters](#-why-validation-matters)
- [Validation layers in Memora](#-validation-layers-in-memora)
- [1. CLI validation](#-1-cli-validation)
- [Validation profiles](#-validation-profiles)
- [2. Operational doctor checks](#-2-operational-doctor-checks)
- [3. Pre-commit validation](#-3-pre-commit-validation)
- [4. GitHub Actions CI](#-4-github-actions-ci)
- [Reference schemas](#-reference-schemas)
- [Practical validation workflow](#-practical-validation-workflow)
- [Why Memora's validation model is a strength](#-why-memoras-validation-model-is-a-strength)
- [Best practices](#-best-practices)
- [Navigation](#-navigation)

---

## 🎯 Why validation matters

Memora treats project memory as an operating asset, not as loose notes.

That means memory files should be:

- structured,
- reviewable,
- predictable,
- safe to maintain over time.

Validation is how Memora turns that principle into daily practice.

---

## 🏗️ Validation layers in Memora

Memora currently provides a strong quality stack across four layers:

1. **local CLI validation**
2. **operational doctor checks**
3. **pre-commit validation**
4. **CI validation**

These work together to keep both the content and the installation surface clean and consistent.

---

## 📦 1. CLI validation

The main entry point is:

```bash
memora validate
```

This now validates memory-bank contracts across schema, integrity, and operational hygiene.

### Validation scopes

`memora validate` supports a `--scope` flag that isolates which surface to check:

| Scope | Surface | Typical use |
|-------|---------|-------------|
| `memory` | `memory-bank/**` — schema, frontmatter, session limits, privacy, internal links, ADR/INDEX | Pre-commit, focused authoring |
| `repo-docs` | `README.md` and `docs/**` — internal link integrity | Documentation review, CI |
| `all` | Both surfaces combined | Default; full validation |

The scope separation means that a broken link in `README.md` never blocks a valid memory-bank commit, and vice versa.

### Supported modes

#### Default validation (all scopes)

```bash
memora validate
```

Use this for normal local authoring.

#### Memory scope only

```bash
memora validate --scope memory
```

Use this in pre-commit hooks and focused memory authoring.

#### Repo-docs scope only

```bash
memora validate --scope repo-docs
```

Use this to audit `README.md` and `docs/` links independently.

#### Strict validation

```bash
memora validate --strict
```

Use this when you want recommended fields to be treated as required.

#### Profile-driven validation

```bash
memora validate --profile core
memora validate --profile extended
memora validate --profile governance
```

Use profiles when you need different enforcement levels for local authoring, team review, and policy-heavy environments.

**Validation Profiles Comparison:**

| Profile | Use case | Strictness |
|---------|----------|-----------|
| **core** | Daily authoring & local work | Warnings only |
| **extended** | Team review, quality gates | Warnings + recommended fields |
| **governance** | Policy compliance, strict CI | All warnings as errors |

#### JSON output

```bash
memora validate --format json
```

Useful for machine-readable reports and CI logs.

#### Watch mode

```bash
memora validate --watch
```

Useful during active editing.

---

## 🔍 What gets checked

The current validation model covers both card contracts and repository integrity.

### Schema-driven contracts
Card-specific schemas from `schemas/` validate required fields, value types, enums, nested objects, dates, and memory-specific fields such as `confidence` and `provenance` where relevant.

### Cross-file integrity
Validation checks core file presence, repository markdown links, and routing references in `INDEX.md`. Extended profiles also verify ADR/DECISIONS alignment.

### Operational constraints
Validation applies line limits, session-bloat checks, stale verification windows, and secret-like pattern detection. Governance profile promotes hygiene drift into blocking errors.

This makes the validator practical for real authoring workflows while keeping the feedback loop fast.

---

## 🏥 2. Operational doctor checks

Memora includes an installation-health command:

```bash
memora doctor
```

This complements `memora validate`.

### What `doctor` covers

- manifest-driven scaffold parity,
- `memory-bank/` presence and critical files,
- active and executable git hooks,
- presence of the GitHub Actions workflow,
- toolchain adapter files,
- hook path integrity,
- broken internal markdown links,
- obvious template placeholders in critical files.

### Why doctor checks matter

It catches the class of issues that content validation alone cannot see:

- partial installs,
- copied projects with broken paths,
- inactive hooks,
- adapter drift,
- repository health regressions.

### When to run doctor

Run `memora doctor` right after `memora init`, after package install, and after moving scaffold files around.

---

## 🚫 3. Pre-commit validation

Memora includes a repository-level pre-commit hook that runs `memora validate --scope memory` when `memory-bank/*.md` files are staged.

### Why `--scope memory` in pre-commit

The hook deliberately validates only the memory surface, not `README.md` or `docs/`:

- Documentation drift in `README.md` should never block a valid memory-bank commit.
- Full repo-docs validation runs separately in CI (`--scope repo-docs`).
- This separation gives fast, focused local feedback without false positives.

If you want to check repo-docs locally, run:

```bash
memora validate --scope repo-docs
```

### Why pre-commit matters

It gives teams a strong local quality gate:

- memory-bank issues are caught before commit,
- hygiene becomes part of the normal developer loop,
- validation becomes habitual instead of occasional.

### How to use the pre-commit hook

Keep the hook enabled and treat it as part of normal engineering hygiene.

---

## 🤖 4. GitHub Actions CI

Memora includes CI validation for repository-level quality control.

### Included jobs

| Job | Scope | Profile | Blocks merge |
|-----|-------|---------|:---:|
| **Validate — memory scope** | `memory` | `core` | ✅ |
| **Validate — repo-docs scope** | `repo-docs` | `core` | ✅ |
| **Validate — all scopes extended** | `all` | `extended` + `governance` report | ❌ advisory |
| **Doctor** | — | — | ✅ |
| **Smoke Install** | — | — | ✅ |
| **Markdownlint** | — | — | ✅ |

The two blocking validate jobs run independently so CI tells you exactly which surface is broken: memory or repo-docs. The advisory job runs after both blocking jobs pass and uploads a governance-profile JSON report as a CI artifact.

### Why CI validation matters

This gives you:

- clear signal: which surface failed (memory vs. repo-docs),
- team-wide validation consistency,
- pull-request visibility,
- repeatable checks across environments.

CI is especially useful when memory files are reviewed collaboratively.

---

## 📄 Reference schemas

The repository includes a `schemas/` directory with JSON Schemas for card types such as:

- agent cards,
- fact cards,
- constitution cards.

These schemas serve as reference artifacts for the memory model and support documentation clarity around card structure.

They are especially useful when you want to understand the intended shape of different memory artifacts.

---

## 🏭 Source-repo policy: intentional placeholders

The Memora source repository ships `memory-bank/` files that are intentionally template-like. These files are the scaffold that users copy into their own projects — they should contain placeholders until the user fills them in with `/memory-bootstrap`.

To prevent the source repo's own `validate` and `doctor` from flagging those placeholders as errors, Memora supports a **source-repo policy** via `package.json`:

```json
{
  "memora": {
    "repoRole": "scaffold-source",
    "sourcePolicyAllowlist": [
      "memory-bank/PROJECT.md",
      "memory-bank/ARCHITECTURE.md",
      "memory-bank/CONSTITUTION.md",
      "memory-bank/CONVENTIONS.md",
      "memory-bank/TESTING.md"
    ]
  }
}
```

### How it works

- If `memora.repoRole === "scaffold-source"` is set in `package.json`, `validate` and `doctor` skip placeholder checks for files in `sourcePolicyAllowlist`.
- Files **not** in the allowlist are still fully validated.
- `package.json` is not copied to target projects by `memora init` (it is not listed in `scaffold.manifest.json`), so **target projects never inherit source-repo policy**.

### Fresh scaffold behaviour

A project created with `memora init` has no `package.json` with `memora.repoRole`. This means:

- Placeholder checks run normally.
- `extended` and `governance` profiles flag unfilled canonical files.
- This is intentional: Memora reminds you to fill in the memory-bank.

---

## ⚙️ Practical validation workflow

A strong everyday workflow looks like this:

### During editing

```bash
memora validate --watch
```

### Before commit

```bash
memora validate
```

### For stronger checks

```bash
memora validate --strict
```

### For automation and reporting

```bash
memora validate --format json
memora validate --profile governance --format json
memora doctor --format json
```

This sequence keeps validation useful without making it heavy.

---

## ✨ Why Memora’s validation model is a strength

Memora’s validation is strong because it is:

- easy to run,
- fast to understand,
- close to the authoring workflow,
- suitable for local use and CI,
- aligned with the structured-memory goal of the project.

It helps memory-bank files remain assets that teams can trust, review, and maintain.

---

## 💡 Best practices

- Run validation immediately after initialization.
- Choose `core` for local scaffolding, `extended` for review, and `governance` for policy-enforced repos.
- Run `memora doctor` immediately after initialization.
- Use watch mode while editing multiple memory files.
- Use strict mode regularly to keep metadata quality high.
- Keep pre-commit checks enabled.
- Treat CI validation as part of memory quality, not just markdown formatting.

---

## 🧭 Navigation

| Link | Destination |
|------|-------------|
| ← Back | [WORKFLOWS.md](./WORKFLOWS.md) |
| Next → | [HOOKS.md](./HOOKS.md) |

**Other sections:** [INDEX.md](./INDEX.md) · [memory-bank/](../memory-bank/INDEX.md) · [HOME](../README.md)

---

## Related reading

- [CLI Reference](./CLI.md)
- [Getting Started](./GETTING_STARTED.md)
- [Memory Model](./MEMORY_MODEL.md)

---

**Last updated:** 2026-03-28
