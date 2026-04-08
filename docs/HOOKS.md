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
→ save hook blocks completion if unsaved exchanges accumulated (blocking)
→ advisory reminders shown for reflect / consolidate / gc
```

The hooks fall into two categories:

- **Blocking save hook** (`check-save-trigger.sh`) — prevents session close when unsaved exchanges exceed a threshold; requires the agent to run `update-memory` before continuing.
- **Advisory hooks** (`check-reflect-trigger.sh`, `check-consolidate-trigger.sh`, `check-gc-trigger.sh`) — show maintenance reminders without blocking; the agent decides when to act.

All hooks are **deterministic**: given the same session state, they always produce the same result.

This design gives you both safety (no context loss from unchecked sessions) and flexibility (maintenance timing stays under human control).

---

## Included hook scripts

Memora includes four shell hooks plus a wrapper:

### `check-save-trigger.sh` — blocking

Fires on session stop. Counts human exchanges since the last `update-memory` call.

- Reads session metadata from the transcript path provided by the toolchain.
- Tracks last-save state per session in `~/.memora/hook_state/`.
- When unsaved exchanges reach the threshold: responds with `{"decision":"block","reason":"..."}`, which causes Claude Code to display the reason and prevent session close.
- Once the agent runs `update-memory`, the counter resets and the session can end.
- Guard: if `stop_hook_active=true` is set in the input JSON, the hook returns `{}` immediately to prevent infinite loops.

### `check-reflect-trigger.sh` — advisory

Used to remind when enough unreflected sessions have accumulated.

### `check-consolidate-trigger.sh` — advisory

Used to remind when enough unconsolidated session material exists.

### `check-gc-trigger.sh` — advisory

Used to remind when session files have grown large enough to justify cleanup.

### `run-stop-hooks.sh`

A wrapper script used in environments that support only one stop hook command. Runs all advisory hooks in sequence.

---

## Thresholds

The default thresholds are:

| Variable | Hook | Meaning | Default |
|---|---|---|---:|
| `SAVE_INTERVAL` | `check-save-trigger.sh` | human exchanges since last save | 20 |
| `REFLECT_THRESHOLD` | `check-reflect-trigger.sh` | sessions without reflection | 3 |
| `CONSOLIDATE_THRESHOLD` | `check-consolidate-trigger.sh` | sessions without consolidation | 5 |
| `GC_THRESHOLD` | `check-gc-trigger.sh` | total files in `SESSIONS/` | 20 |

These defaults make the maintenance flow visible without becoming noisy.

Override via environment variable, e.g. `SAVE_INTERVAL=10 bash memory-bank/scripts/check-save-trigger.sh`.

---

## Why two hook types?

The split between blocking and advisory is intentional.

**Blocking save hook** prevents the most common failure mode in AI-agent workflows: a session ends without saving accumulated context, and the next agent starts cold. The cost of a block is low (one `update-memory` call); the cost of lost context is high.

**Advisory hooks** cover maintenance operations — reflection, consolidation, cleanup — where timing matters less and agent autonomy is preferable. These remind without forcing.

Together they create an operational rhythm:

- no context is lost involuntarily,
- maintenance timing stays flexible and human-controlled,
- behavior remains predictable and debuggable.

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

## Activation and verification

When `memora init` or package `postinstall` runs inside a git repository, `init.sh` activates `.githooks/` through `git config core.hooksPath .githooks`.

After installation, verify the setup with:

```bash
memora doctor
```

This checks that the pre-commit hook exists, is executable, and is wired into git.

---

## Manual testing

You can run the scripts directly.

### Save check (blocking)

```bash
echo '{"session_id":"test","stop_hook_active":false}' \
  | bash memory-bank/scripts/check-save-trigger.sh
```

Returns `{}` (no-op) or `{"decision":"block","reason":"..."}` depending on exchange count.

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
- Keep `.githooks/` activated through `core.hooksPath=.githooks`.
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

**Last updated:** 2026-04-08
