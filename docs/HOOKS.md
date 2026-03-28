# Hooks

**Purpose:** explain the deterministic advisory hook system included in Memora.  
**Audience:** maintainers, toolchain integrators, advanced users.  
**Read when:** you want to configure or understand reflection, consolidation, and cleanup reminders.  
**See also:** [Toolchains](./TOOLCHAINS.md), [Workflows](./WORKFLOWS.md)

---

## Why hooks matter

AI-agent workflows can accumulate session state quickly. Memora’s hook system makes memory maintenance visible through **deterministic advisory reminders**.

That matters because it gives you:

- predictable maintenance signals,
- less reliance on agent improvisation,
- reusable operational behavior across toolchains.

The hook layer is one of Memora’s strongest practical features today.

---

## Hook model

At a high level:

```text
Agent session ends
→ Stop-style event fires
→ hook script checks memory-bank session state
→ threshold is evaluated
→ advisory reminder is shown if maintenance is due
```

The important property is this:

- the hooks are **deterministic**,
- the hooks are **non-blocking**,
- the hooks are **advisory**.

This gives operational visibility without forcing intrusive automation.

---

## Included hook scripts

Memora includes three shell hooks:

### `check-reflect-trigger.sh`
Used to remind when enough unreflected sessions have accumulated.

### `check-consolidate-trigger.sh`
Used to remind when enough unconsolidated session material exists.

### `check-gc-trigger.sh`
Used to remind when session files have grown large enough to justify cleanup.

### `run-stop-hooks.sh`
A wrapper script used in environments that support only one stop hook command.

---

## Thresholds

The default thresholds are:

| Variable | Meaning | Default |
|---|---|---:|
| `REFLECT_THRESHOLD` | sessions without reflection | 3 |
| `CONSOLIDATE_THRESHOLD` | sessions without consolidation | 5 |
| `GC_THRESHOLD` | total files in `SESSIONS/` | 20 |

These defaults make the maintenance flow visible without becoming noisy.

---

## Why the hooks are advisory

Memora uses an advisory model on purpose.

That gives you several benefits:

- maintenance reminders remain visible,
- the workflow stays non-blocking,
- teams retain control over timing,
- behavior remains easier to understand and debug.

This design is especially useful in AI-agent environments where predictability matters.

---

## Per-toolchain integration

### Claude Code
Uses `.claude/settings.json` hook definitions.

### Codex CLI
Uses `.codex/config.toml` and the `run-stop-hooks.sh` wrapper.

### Qwen Code
Uses `.qwen/settings.json` with hook definitions.

### OpenCode
Uses `.opencode/plugins/*.js` plugins that invoke the shell scripts.

For full adapter details, see [Toolchains](./TOOLCHAINS.md).

---

## Manual testing

You can run the scripts directly.

### Reflection check

```bash
bash memory-bank/scripts/check-reflect-trigger.sh
```

### Consolidation check

```bash
bash memory-bank/scripts/check-consolidate-trigger.sh
```

### Cleanup check

```bash
bash memory-bank/scripts/check-gc-trigger.sh
```

### All stop hooks

```bash
bash memory-bank/scripts/run-stop-hooks.sh
```

This makes the hook system easy to verify locally.

---

## Operational value

The hook system adds real value because it:

- reinforces healthy memory maintenance,
- works across multiple toolchains,
- stays simple to inspect,
- stays easy to test,
- remains independent from a single vendor-specific environment.

It turns memory maintenance into a visible operational rhythm rather than an afterthought.

---

## Best practices

- Keep the hook scripts in the repository as part of normal project setup.
- Use the default thresholds first before tuning them.
- Test hook output directly at least once per environment.
- Keep hook behavior advisory and predictable.
- Pair hooks with the workflows in [Workflows](./WORKFLOWS.md).

---

## Troubleshooting checklist

If you do not see reminders when expected:

- confirm the session files exist,
- run the scripts directly from the repository root,
- verify the relevant toolchain adapter is active,
- confirm the thresholds are not set too high,
- check that the expected stop event is actually firing.

---

## Related reading

- [Toolchains](./TOOLCHAINS.md)
- [Workflows](./WORKFLOWS.md)
- [Security](./SECURITY.md)

---

**Last updated:** 2026-03-28
