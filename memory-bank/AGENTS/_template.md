---
title: "AGENTS/[slug] — профиль агента [имя]"
id: "agent-[slug]"
type: "AGENT"
version: "1.0.0"
authority: "controlled"
status: "active"
owner: "[команда или владелец]"
created_at: "[ГГГГ-ММ-ДД]"
updated_at: "[ГГГГ-ММ-ДД]"
pii_risk: "low"
ttl: null
tags: []
last_verified: "[ГГГГ-ММ-ДД]"
profile: "full-stack-dev"          # full-stack-dev | code-reviewer | architect | debugger | writer | custom
restore_layers: [1, 2, 3]          # Слои progressive disclosure: 1=HANDOFF, 2=CURRENT, 3=canonical, 4=FACTS, 5=EPISODES
token_budget: 8000                 # Макс токенов при restore (~chars/4). Детали: PATTERNS/agent-profiles.md
# observation_types: []            # Опционально — переопределить из профиля
# observation_concepts: []         # Опционально — переопределить из профиля
---

# Agent: [Имя агента]

Профиль AI-агента: роль, компетенции, область ответственности.
Загружай при настройке multi-agent workflow или для понимания возможностей агента.

## Contract

- when: нужно понять роль агента; настройка координации агентов; назначение задач
- prereq: агент уже используется в проекте
- reads: этот файл; при необходимости `AGENTS.md` для глобального контекста
- writes: при обновлении роли, возможностей или области ответственности
- success: понятны роль, инструменты, ограничения и точки координации с другими агентами
- on_fail: если профиль агента неактуален -> обновить `updated_at`; пересмотреть capabilities

## Canonical scope

- contains: роль, компетенции, инструменты, ограничения, точки координации
- excludes:
  - глобальные инструкции для всех агентов -> `AGENTS.md`
  - архитектурные решения -> `DECISIONS.md`

## Identity

- **Имя**: [имя или псевдоним агента]
- **Роль**: [кратко: что делает]
- **Модель**: [напр. claude-sonnet-4-6 | gpt-4o | gemini-pro]
- **Toolchain**: [Claude Code | Codex | Qwen | OpenCode | API]

## Capabilities

<!-- Что агент умеет делать хорошо. -->

- [компетенция 1]
- [компетенция 2]

## Tools & access

<!-- Какие инструменты и системы доступны агенту. -->

| Инструмент | Уровень доступа | Примечание |
|-----------|----------------|------------|
| [tool] | read/write/none | [заметка] |

## Constraints

<!-- Что агент НЕ должен делать. Ограничения и запреты. -->

- [ограничение 1]
- [ограничение 2]

## Coordination

<!-- Как агент взаимодействует с другими агентами. -->

- **Читает от**: [какие агенты поставляют данные]
- **Передаёт к**: [каким агентам передаёт результаты]
- **Shared memory**: `memory-bank/` (read), `.local/CURRENT.md` (write)

## Failure routes

- Если агент выходит за рамки своей роли -> зафиксировать в `OPEN_QUESTIONS.md`
- Если возможности устарели -> обновить `updated_at` и `last_verified`
