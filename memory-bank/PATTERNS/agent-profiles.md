---
title: "PATTERN — Agent Profiles"
id: "pattern-agent-profiles"
type: "PATTERN"
version: "0.1.0"
pii_risk: "none"
ttl: null
tags: ["agents", "profiles", "configuration", "context-loading"]
purpose: "Профили агентов для адаптации observation typing и стратегии загрузки контекста"
entrypoint: "AGENTS.md -> AGENTS/<agent>.md -> PATTERNS/agent-profiles.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PATTERNS/observation-typing.md"
  - "PATTERNS/progressive-disclosure.md"
provides:
  - "agent_profile_presets"
  - "token_budget_defaults"
  - "restore_layer_strategy"
last_verified: "2026-03-23"
max_lines: 100
---

# Agent Profiles

Профили определяют, **что наблюдать** и **сколько загружать** при restore.
Профиль задаётся в `AGENTS/<agent>.md` → поле `profile`.

## Contract

- when: memory-bootstrap (создание профиля); memory-restore (определение бюджета); update-memory (фильтрация observation types)
- prereq: `PATTERNS/observation-typing.md` прочитан
- reads: этот файл; `AGENTS/<agent>.md`
- writes: none
- success: определены observation_types, restore_layers и token_budget агента
- on_fail: если профиль не найден → использовать `full-stack-dev` как default

## Встроенные профили

| Профиль | observation_types | restore_layers | token_budget |
|---------|-------------------|----------------|-------------|
| `full-stack-dev` | bugfix, feature, refactor, discovery, decision, incident | 1-3 | 8000 |
| `code-reviewer` | bugfix, refactor | 1-2 | 4000 |
| `architect` | feature, decision | 1-4 | 12000 |
| `debugger` | bugfix, incident | 1-2 | 4000 |
| `writer` | feature, discovery | 1-2 | 4000 |
| `custom` | задаётся вручную в AGENTS/*.md | задаётся вручную | задаётся вручную |

observation_concepts для всех профилей: все 7 из `PATTERNS/observation-typing.md`.

## Использование профиля

### В AGENTS/<agent>.md (frontmatter)

```yaml
profile: "full-stack-dev"
restore_layers: [1, 2, 3]
token_budget: 8000
# Опционально — переопределить типы для этого агента:
observation_types: ["bugfix", "feature", "discovery"]
```

### В memory-restore

1. Прочитай `AGENTS/<agent>.md` (если существует).
2. Возьми `token_budget` и `restore_layers`.
3. Используй `observation_types` как фильтр при загрузке Layer 4 (FACTS/).
4. Если файл не существует → default: `full-stack-dev`.

### В memory-bootstrap

После инициализации создай `AGENTS/<agent>.md` с подходящим профилем.
Определи профиль по типу задачи пользователя.

## Расширение профиля (custom)

Используй `profile: "custom"` и задай все поля вручную:

```yaml
profile: "custom"
observation_types: ["discovery", "incident"]
restore_layers: [1, 2]
token_budget: 3000
```

## Pitfalls

- Профиль не блокирует другие types — только фильтрует при загрузке FACTS в Layer 4.
- token_budget — heuristic (chars/4), не точный лимит. Оставляй 10% запас.
- Multi-agent: каждый агент может иметь свой профиль в одном проекте.
