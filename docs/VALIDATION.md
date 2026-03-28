# Validation

**Purpose:** explain how Memora keeps memory files structured and reviewable.  
**Audience:** users, maintainers, contributors, CI owners.  
**Read when:** you want the canonical view of validation, pre-commit checks, CI, and reference schemas.  
**See also:** [CLI Reference](./CLI.md), [Getting Started](./GETTING_STARTED.md)

---

## Why validation matters

Memora treats project memory as an operating asset, not as loose notes.

That means memory files should be:

- structured,
- reviewable,
- predictable,
- safe to maintain over time.

Validation is how Memora turns that principle into daily practice.

---

## Validation layers in Memora

Memora currently provides a strong validation stack across three layers:

1. **local CLI validation**
2. **pre-commit validation**
3. **CI validation**

These work together to keep `memory-bank/` clean and consistent.

---

## 1. CLI validation

The main entry point is:

```bash
memora validate
```

This checks front matter in memory-bank markdown files.

### Supported modes

#### Default validation

```bash
memora validate
```

Use this for normal local authoring.

#### Strict validation

```bash
memora validate --strict
```

Use this when you want recommended fields to be treated as required.

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

## What gets checked

The current validation model focuses on front matter and known field values.

### Required fields
Core validation checks for the required fields that every memory file should include.

### Allowed values
It also validates known enumerated values such as authority and status.

### Recommended fields
In strict mode, additional recommended fields are enforced more aggressively.

This makes the validator practical for real authoring workflows while keeping the feedback loop fast.

---

## 2. Pre-commit validation

Memora includes a repository-level pre-commit hook that runs validation when `memory-bank/*.md` files are staged.

### Why this matters

It gives teams a strong local quality gate:

- obvious issues are caught before commit,
- memory-bank hygiene becomes part of the normal developer loop,
- validation becomes habitual instead of occasional.

### Recommended usage

Keep the hook enabled and treat it as part of normal engineering hygiene.

---

## 3. GitHub Actions CI

Memora also includes CI validation for repository-level quality control.

### Included jobs

- **Validate — Core**
- **Validate — Extended**
- **Markdownlint**

### Why this matters

This gives you:

- team-wide validation consistency,
- pull-request visibility,
- cleaner repository history,
- repeatable checks across environments.

CI is especially useful when memory files are reviewed collaboratively.

---

## Reference schemas

The repository includes a `schemas/` directory with JSON Schemas for card types such as:

- agent cards,
- fact cards,
- constitution cards.

These schemas serve as reference artifacts for the memory model and support documentation clarity around card structure.

They are especially useful when you want to understand the intended shape of different memory artifacts.

---

## Practical validation workflow

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
```

This sequence keeps validation useful without making it heavy.

---

## Why Memora’s validation model is a strength

Memora’s validation is strong because it is:

- easy to run,
- fast to understand,
- close to the authoring workflow,
- suitable for local use and CI,
- aligned with the structured-memory goal of the project.

It helps memory-bank files remain assets that teams can trust, review, and maintain.

---

## Best practices

- Run validation immediately after initialization.
- Use watch mode while editing multiple memory files.
- Use strict mode regularly to keep metadata quality high.
- Keep pre-commit checks enabled.
- Treat CI validation as part of memory quality, not just markdown formatting.

---

## Related reading

- [CLI Reference](./CLI.md)
- [Getting Started](./GETTING_STARTED.md)
- [Memory Model](./MEMORY_MODEL.md)

---

**Last updated:** 2026-03-28
