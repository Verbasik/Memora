---
title: "CHANGELOG — значимые изменения проекта"
id: "[project-slug]-changelog"
type: "CHANGELOG"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать вехи и важные изменения — не git log, а смысловые события"
entrypoint: "AGENTS.md -> INDEX.md -> CHANGELOG.md"
authority: "free"
status: "active"
reads: []
writes: []
depends_on: []
provides:
  - "project_milestones"
  - "change_history"
canonical_owner: "Значимые изменения проекта с датой и контекстом"
last_verified: "[ГГГГ-ММ-ДД]"
---

# CHANGELOG

Значимые изменения проекта. Не git log — только вехи.

## Contract

- when: завершена крупная фича; принято важное архитектурное решение; выпущена версия
- prereq: изменение имеет значимость для понимания истории проекта
- reads: только этот файл
- writes: новая запись в `[Unreleased]` или новый датированный блок
- success: изменение зафиксировано с датой и контекстом "почему"
- on_fail: если непонятно, стоит ли записывать -> записывай; избыток лучше пробела

## [Unreleased]

-

## [2026-03-23] — 8 концепций из claude-mem: расширенная интеграция

Адаптация и расширение 8 концепций из runtime-системы claude-mem для file-based архитектуры Memora.

### Новые PATTERNS файлы (6)
- `PATTERNS/observation-typing.md` — матрица 6 типов × 7 концептов; маршрутизация к каноническим файлам-владельцам
- `PATTERNS/privacy-control.md` — 3-зонная система приватности: `<private>` (удалить), `<sensitive>` (pii_risk: high), `<ephemeral>` (только Session tier)
- `PATTERNS/confidence-decay.md` — многоступенчатый decay с reverification и audit trail; интеграция с gc (STALE → gc-candidate)
- `PATTERNS/agent-profiles.md` — 5 профилей агентов (full-stack-dev / code-reviewer / architect / debugger / writer) с token_budget и restore_layers
- `PATTERNS/progressive-disclosure.md` — 6-слойная стратегия загрузки контекста с бюджетом токенов по формуле `chars/4`
- `POLICIES/privacy-zones.md` — формальная политика управления зонами приватности

### Обновлённые skills (7 Claude Code + 21 адаптер Qwen/OpenCode)
- `memory-restore` — budget-aware layered loading (6 слоёв), token economics report, backward-compatible 7-field HANDOFF parse
- `update-memory` — шаг Privacy scan; structured HANDOFF contract (7 полей); observation_type/concepts при создании FACTS
- `memory-consolidate` — 3D conflict resolution (confidence × recency × breadth) с auto-resolution и audit trail
- `memory-reflect` — privacy scan перед промоцией; concepts-based clustering signal
- `memory-bootstrap` — шаг 8.5: создание профиля агента из PATTERNS/agent-profiles.md
- `memory-audit` — 3 новые проверки: #9 Confidence Decay, #10 Privacy Leak Scan, #11 Token Economics Health
- `memory-gc` — шаг 5.5: очистка stale фактов (confidence: observed + last_verified > 180d)

### Обновлённые существующие файлы
- `CONVENTIONS.md`, `MEMORY-MODEL.md`, `LIFECYCLE.md` — ссылки на новые паттерны
- `PATTERNS/provenance-standard.md` — обновлены правила decay
- `FACTS/_template.md`, `EPISODES/_template.md` — типизированные frontmatter и Observations
- `AGENTS/_template.md` — новые поля профиля
- `schemas/fact.schema.json`, `schemas/agent.schema.json` — optional поля для typing и профилей
- `.claude/rules/security.md` — правило privacy scan перед записью

### Почему
Анализ claude-mem выявил концепции, отсутствующие в Memora: typing наблюдений, privacy zones, token awareness, conflict resolution. Все концепции расширены по сравнению с оригиналом (3D conflict vs timestamp-only, reverification vs simple decay, ephemeral/sensitive tiers vs только private).

## [ГГГГ-ММ-ДД] — [Заголовок]

- [Что изменилось и почему]
