---
title: "PATTERN — Confidence Decay"
id: "pattern-confidence-decay"
type: "PATTERN"
version: "0.1.0"
pii_risk: "none"
ttl: null
tags: ["confidence", "provenance", "quality"]
purpose: "Активное снижение уровня достоверности фактов при отсутствии верификации"
entrypoint: "AGENTS.md -> PATTERNS/provenance-standard.md -> PATTERNS/confidence-decay.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PATTERNS/provenance-standard.md"
provides:
  - "confidence_decay_algorithm"
  - "reverification_rules"
  - "gc_candidate_criteria"
last_verified: "2026-03-23"
max_lines: 100
---

# Confidence Decay

Активный алгоритм снижения confidence при отсутствии верификации.
Применяется в `memory-audit` (проверка) и `memory-gc` (очистка).

## Contract

- when: выполнение memory-audit или memory-gc; обновление FACTS/*.md
- prereq: файл имеет поля `confidence` и `last_verified` в frontmatter
- reads: этот файл; `PATTERNS/provenance-standard.md`
- writes: none (паттерн описывает алгоритм)
- success: confidence актуален; стale факты выявлены; gc-кандидаты определены
- on_fail: если last_verified отсутствует → пометить как `observed`; запросить верификацию

## Decay Algorithm

### Таблица порогов

| Текущий confidence | Условие | Действие | Новый confidence |
|-------------------|---------|----------|-----------------|
| `confirmed` | `age` > 90 дней | Понизить | `inferred` |
| `confirmed` | `age` > 180 дней | Понизить | `observed` |
| `inferred` | `age` > 60 дней | Понизить | `observed` |
| `observed` | `age` > 90 дней | Пометить | `⚠️ STALE` |
| `⚠️ STALE` | `age` > 180 дней | Кандидат | gc-candidate |

`age = сегодня − last_verified`

### Decay log

При каждом понижении добавь запись в секцию **Confidence history** факта:

```markdown
| [ГГГГ-ММ-ДД] | [старый] → [новый] | decay: last_verified > N дней |
```

## Reverification

Подтверждение факта в новой сессии **восстанавливает** confidence:

| Подтверждений | Новый confidence |
|---------------|----------------|
| 1 (текущая сессия) | `observed` |
| 2 (независимых) | `inferred` |
| 3+ или human review | `confirmed` |

При reverification: обнови `last_verified` и запись в Confidence history:

```markdown
| [ГГГГ-ММ-ДД] | observed → confirmed | reverification: [SESSIONS/файл.md] |
```

## GC Integration

Факты с `gc-candidate` статусом обрабатываются в `memory-gc`:
- Перечислить пользователю.
- **Не удалять автоматически** — только предложить.
- Если пользователь подтвердил — удалить файл и убрать ссылки.

## Pitfalls

- Decay **инкрементальный**: одно снижение за один аудит (не скачок с confirmed сразу в STALE).
- Reverification восстанавливает, но не пропускает уровни: 1 подтверждение = observed.
- Файлы без `confidence` в frontmatter — пропустить в decay; применять только устаревание (⚠️ УСТАРЕЛО при age > 60д).
