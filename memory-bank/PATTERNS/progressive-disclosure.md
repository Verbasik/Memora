---
title: "PATTERN — Progressive Disclosure"
id: "pattern-progressive-disclosure"
type: "PATTERN"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: ["context-loading", "token-economics", "restore"]
purpose: "Послойная стратегия загрузки контекста с контролем токенного бюджета"
entrypoint: "AGENTS.md -> PATTERNS/agent-profiles.md -> PATTERNS/progressive-disclosure.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PATTERNS/agent-profiles.md"
provides:
  - "layered_loading_strategy"
  - "token_budget_formula"
  - "restore_layer_definitions"
last_verified: "2026-03-23"
max_lines: 100
---

# Progressive Disclosure

Шесть слоёв загрузки контекста с нарастающей стоимостью. Применяется в `memory-restore`.

## Contract

- when: начало сессии (memory-restore); определение что загружать
- prereq: `AGENTS/<agent>.md` прочитан (или используется default)
- reads: этот файл; `AGENTS/<agent>.md` для token_budget и restore_layers
- writes: none
- success: контекст загружен в пределах бюджета; отчёт содержит token economics
- on_fail: если бюджет превышен → остановить загрузку; сообщить что пропущено

## Шесть слоёв

| Слой | Файлы | ~Токены | Когда загружать |
|------|-------|---------|----------------|
| 1 | `.local/HANDOFF.md` | ~200 | Всегда |
| 2 | `.local/CURRENT.md` + `INDEX.md` | ~400 | Всегда |
| 3 | Canonical files (ARCHITECTURE, CONVENTIONS и т.д.) | ~800–2000 | По задаче |
| 4 | `FACTS/*.md` + `DECISIONS.md` (релевантные) | ~400–1000 | По задаче |
| 5 | `EPISODES/*.md` (последние 3) + `PATTERNS/*.md` | ~600–1500 | По запросу |
| 6 | Full `SESSIONS/*.md` scan | ~1000–3000 | Только reflect/consolidate |

## Token Budget Formula

```
estimated_tokens ≈ total_chars / 4
remaining = budget - estimated_tokens_loaded
```

**Пороги:**
- `remaining < 500` → СТОП, не загружать следующий слой
- `remaining < 1000` → пропустить Layer 4
- `remaining < 2000` → пропустить Layer 5

## Типичные размеры файлов

| Файл | ~Chars | ~Tokens |
|------|--------|---------|
| HANDOFF.md | 800 | ~200 |
| CURRENT.md | 1600 | ~400 |
| ARCHITECTURE.md | 3000 | ~750 |
| CONVENTIONS.md | 2000 | ~500 |
| Один FACTS/*.md | 1200 | ~300 |
| Один EPISODES/*.md | 2000 | ~500 |

## Бюджеты по профилям

| Профиль | Default budget | Default layers |
|---------|---------------|----------------|
| `full-stack-dev` | 8000 | 1-3 |
| `architect` | 12000 | 1-4 |
| `code-reviewer` | 4000 | 1-2 |
| `debugger` | 4000 | 1-2 |

## Token Economics Report

Каждый restore завершается отчётом:

```
Budget: [N] / Loaded: [N] (~[chars] chars) / Remaining: [N]
Layers: [1, 2, 3] | Skipped: [4, 5] (budget)
Files: HANDOFF.md (~200t) | CURRENT.md (~400t) | ARCHITECTURE.md (~750t)
```

## Pitfalls

- Формула `chars/4` — heuristic с ~20% погрешностью. Оставляй 10% запас.
- Layer 6 (SESSIONS scan) — только для reflect/consolidate, никогда для обычного restore.
- Token economics — informational, не блокирующий. Загрузка не прерывается при превышении — только уведомляет.
