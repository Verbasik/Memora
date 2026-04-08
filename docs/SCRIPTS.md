# Scripts

**Purpose:** document the utility scripts included in `memory-bank/scripts/`.  
**Audience:** users, maintainers, toolchain integrators.  
**Read when:** you want to use entity detection, the knowledge graph CLI, or understand the hook scripts.  
**See also:** [Memory Model](./MEMORY_MODEL.md), [Workflows](./WORKFLOWS.md), [Hooks](./HOOKS.md)

---

## Overview

Memora includes four shell hook scripts and two Python utility scripts:

| Script | Type | Purpose |
|---|---|---|
| `check-save-trigger.sh` | Shell hook | Blocking save reminder |
| `check-reflect-trigger.sh` | Shell hook | Advisory reflect reminder |
| `check-consolidate-trigger.sh` | Shell hook | Advisory consolidate reminder |
| `check-gc-trigger.sh` | Shell hook | Advisory cleanup reminder |
| `run-stop-hooks.sh` | Shell wrapper | Runs all advisory hooks in sequence |
| `entity-detect.py` | Python utility | Discovers persons and projects in memory-bank |
| `knowledge_graph.py` | Python utility | Temporal knowledge graph CLI |

For hook documentation, see [Hooks](./HOOKS.md). This page covers the two Python utilities.

---

## `entity-detect.py` — Entity Recognition

Scans all `*.md` files in the memory-bank and detects candidate persons and projects using heuristic patterns. Outputs a JSON file with confirmed/unconfirmed candidates for agent review.

### Requirements

- Python 3.9+
- No external dependencies

### Usage

```bash
# Run with defaults (scans memory-bank/, writes memory-bank/.local/entities.json)
python3 memory-bank/scripts/entity-detect.py

# Specify source directory and output path
python3 memory-bank/scripts/entity-detect.py --dir memory-bank --output memory-bank/.local/entities.json

# Exclude additional files or directories
python3 memory-bank/scripts/entity-detect.py --exclude ".local" --exclude "ARCHIVE"

# Quiet mode (no progress output)
python3 memory-bank/scripts/entity-detect.py --quiet
```

### Detection logic

- **Persons** — matched via verb patterns (`said`, `asked`, `assigned to`), dialogue markers (`> Name:`), and `@mentions`. Requires at least 2 occurrences across different files.
- **Projects** — matched via action patterns (`building`, `shipped`, `deployed`), kebab/snake identifiers, and import statements. Requires at least 3 occurrences.

Internal memory-bank terms (`on_fail`, `_trigger`, `_type`, etc.) are excluded automatically.

### Output format

```json
{
  "persons": [
    { "name": "Alice", "occurrences": 5, "confirmed": false }
  ],
  "projects": [
    { "name": "auth-migration", "occurrences": 8, "confirmed": false }
  ]
}
```

All candidates start with `confirmed: false`. Set to `true` after review; only confirmed entities should be used for knowledge graph seeding.

---

## `knowledge_graph.py` — Temporal Knowledge Graph

A local SQLite-backed knowledge graph that tracks entity state with temporal validity windows. Useful for multi-agent workflows where you need to know who is working on what, with full historical queryability.

Storage: `.local/knowledge_graph.db` (not committed; local only).

### Requirements

- Python 3.9+
- No external dependencies (uses `sqlite3` from the standard library)

### Path resolution

The script auto-detects the database path by walking up the directory tree from `cwd` until it finds a `memory-bank/` directory. Falls back to `cwd` if not found. Override with `--db <path>`.

### CLI reference

#### Add a triple (record a fact)

```bash
python3 memory-bank/scripts/knowledge_graph.py add <subject> <predicate> <object> [--from DATE] [--src FILE]
```

```bash
# Claude starts working on a task
python3 memory-bank/scripts/knowledge_graph.py add claude works_on auth-migration --from 2026-04-08

# Claude completes a task
python3 memory-bank/scripts/knowledge_graph.py add claude completed memory-bank-setup --from 2026-04-08

# Architectural decision recorded
python3 memory-bank/scripts/knowledge_graph.py add team decided use-postgresql --from 2026-04-08 --src SESSIONS/2026-04-08-claude-db.md
```

#### Invalidate a triple (mark a fact as ended)

```bash
python3 memory-bank/scripts/knowledge_graph.py invalidate <subject> <predicate> <object> [--ended DATE]
```

```bash
# Claude is no longer working on the old task
python3 memory-bank/scripts/knowledge_graph.py invalidate claude works_on old-task
```

Without `--ended`, today's date is used.

#### Query current state of an entity

```bash
python3 memory-bank/scripts/knowledge_graph.py query <entity> [--as-of DATE]
```

```bash
# What is Claude doing right now?
python3 memory-bank/scripts/knowledge_graph.py query claude

# What was Claude doing on 2026-04-01?
python3 memory-bank/scripts/knowledge_graph.py query claude --as-of 2026-04-01
```

#### Query all triples by predicate

```bash
python3 memory-bank/scripts/knowledge_graph.py rel <predicate>
```

```bash
# Who is working on what?
python3 memory-bank/scripts/knowledge_graph.py rel works_on
```

#### Timeline

```bash
# Timeline for a specific entity
python3 memory-bank/scripts/knowledge_graph.py timeline claude

# Full timeline across all entities (last 50 events)
python3 memory-bank/scripts/knowledge_graph.py timeline
```

#### Statistics

```bash
python3 memory-bank/scripts/knowledge_graph.py stats
```

#### Delete an entity

```bash
python3 memory-bank/scripts/knowledge_graph.py delete <entity>
```

### Common predicates

| Predicate | Subject | Object | Meaning |
|---|---|---|---|
| `works_on` | agent | task or feature | currently active work |
| `completed` | agent | task | finished work |
| `decided` | agent or team | decision slug | architectural decision |
| `owns` | agent | component | ownership or responsibility |
| `uses` | component | technology | technology dependency |
| `blocked_by` | task | blocker | blocking relationship |
| `depends_on` | component | dependency | dependency relationship |

### Integration with update-memory

When running `update-memory`, write triples for the current session:

```bash
# Beginning of session — agent starts new room
python3 memory-bank/scripts/knowledge_graph.py add claude works_on <room> --from 2026-04-08 --src SESSIONS/<file>.md

# End of session — task completed
python3 memory-bank/scripts/knowledge_graph.py add claude completed <task> --from 2026-04-08

# Close previous task
python3 memory-bank/scripts/knowledge_graph.py invalidate claude works_on <old-task>
```

### Integration with memory-restore

When running `memory-restore`, if the database exists, append agent state to the Essential Story:

```bash
python3 memory-bank/scripts/knowledge_graph.py query claude 2>/dev/null
```

### Python API

```python
from memory_bank.scripts.knowledge_graph import KnowledgeGraph

kg = KnowledgeGraph()  # auto-detects db path

kg.add_triple("claude", "works_on", "auth-migration", valid_from="2026-04-08",
              source_file="SESSIONS/2026-04-08-claude-auth.md")

kg.invalidate("claude", "works_on", "auth-migration", ended="2026-04-09")

kg.query_entity("claude")           # current state
kg.query_entity("claude", as_of="2026-04-01")  # historical snapshot
kg.query_relationship("works_on")   # all active works_on triples
kg.timeline("claude")               # chronological history
kg.stats()                          # database statistics
```

---

## Related reading

- [Memory Model](./MEMORY_MODEL.md) — Temporal KG and Wing/Hall/Room taxonomy in context
- [Workflows](./WORKFLOWS.md) — how scripts integrate with memory-restore and update-memory
- [Hooks](./HOOKS.md) — blocking save hook and advisory hook scripts
- [`PATTERNS/temporal-kg.md`](../memory-bank/PATTERNS/temporal-kg.md) — full pattern specification
- [`PATTERNS/wing-hall-room.md`](../memory-bank/PATTERNS/wing-hall-room.md) — session taxonomy specification

---

**Last updated:** 2026-04-08
