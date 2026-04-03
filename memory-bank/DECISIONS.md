---
title: "DECISIONS — реестр архитектурных решений"
id: "[project-slug]-decisions"
type: "DECISIONS"
version: "0.1.0"
pii_risk: "none"
ttl: null
tags: []
purpose: "Фиксировать принятые решения с их статусом и ссылками на полный контекст"
entrypoint: "AGENTS.md -> INDEX.md -> DECISIONS.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "CONSTITUTION.md"
  - "ARCHITECTURE.md"
provides:
  - "decision_registry"
  - "decision_status"
canonical_owner: "Реестр всех архитектурных решений; полный контекст — в ADR/"
last_verified: "[ГГГГ-ММ-ДД]"
max_lines: 80
---

# DECISIONS

Канонический реестр архитектурных и технологических решений.
Полный контекст каждого нетривиального решения — в `ADR/ADR-NNN-<slug>.md`.

## Contract

- when: выбор технологии; изменение архитектуры; вопрос "почему выбрали X"; промоция решения из сессии
- prereq: решение принято или обсуждается
- reads: этот файл; при необходимости `ADR/<номер>.md`
- writes: новая строка в таблицу; ссылка на ADR
- success: решение зафиксировано со статусом и ссылкой; не дублируется в других файлах
- on_fail: если решение конфликтует с `CONSTITUTION.md` -> пометить `CONSTITUTION_CONFLICT`; не промотировать

## Canonical scope

- contains: реестр решений с номером, статусом, датой и ссылкой на ADR
- excludes:
  - полный контекст решения -> `ADR/`
  - текущие open questions -> `OPEN_QUESTIONS.md`
  - неподтверждённые предположения

## Status definitions

| Статус | Значение |
|--------|----------|
| ✅ Действует | Решение принято и применяется |
| ⚠️ На пересмотре | Решение под вопросом; ждёт ревью |
| ❌ Заменено | Заменено другим ADR |
| 💡 Предложено | Обсуждается; не принято |
| 🚫 CONSTITUTION_CONFLICT | Конфликт с CONSTITUTION.md; требует human review |

## Registry

| # | Решение | Статус | Дата | ADR | Conf | Источник | Влияние |
|---|---------|--------|------|-----|------|----------|---------|
|   |         |        |      |     |      |          |         |

## Promotion rules

1. Добавь строку в таблицу выше с полями `Conf` и `Источник`.
2. Если решение нетривиальное — создай `ADR/ADR-NNN-<slug>.md`.
3. Проверь соответствие `CONSTITUTION.md` перед промоцией.
4. При замене: пометь старую строку ❌, укажи номер заменяющего ADR.

### Conf / Источник

- `Conf` — уровень уверенности: `observed` | `inferred` | `confirmed` (см. `PATTERNS/provenance-standard.md`)
- `Источник` — краткая ссылка: `SESSIONS/файл.md`, `human-review`, `reflected:N`, ADR-номер

## Failure routes

- Если решение конфликтует с `CONSTITUTION.md` -> пометить `CONSTITUTION_CONFLICT` -> вынести на human review
- Если решение не подтверждено -> не добавлять как ✅; использовать 💡
- Если ADR отсутствует для нетривиального решения -> создать перед финализацией
