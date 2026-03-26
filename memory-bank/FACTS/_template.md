---
title: "FACTS/[slug] — [тезис факта]"
id: "fact-[slug]"
type: "FACT"
version: "1.0.0"
authority: "controlled"
status: "active"
owner: "[агент или роль]"
created_at: "[ГГГГ-ММ-ДД]"
updated_at: "[ГГГГ-ММ-ДД]"
pii_risk: "none"
ttl: null
tags: []
confidence: "observed"
observation_type: "discovery"  # bugfix | feature | refactor | discovery | decision | incident
concepts: ["how-it-works"]     # 2-5 из: how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, trade-off
provenance:
  source: "[SESSIONS/файл.md | human-review | external-doc]"
  date: "[ГГГГ-ММ-ДД]"
last_verified: "[ГГГГ-ММ-ДД]"
---

# [Тезис факта в 5–10 слов]

Устойчивый факт о проекте, окружении или домене.
Загружай только когда факт релевантен текущей задаче.

## Contract

- when: нужен конкретный устойчивый факт; promotion из сессий; cross-agent sharing
- prereq: факт верифицирован как минимум `observed`; не дублируется в канонических файлах
- reads: только этот файл
- writes: при обновлении confidence или provenance
- success: факт однозначно сформулирован с источником и уровнем уверенности
- on_fail: если факт противоречит другому -> зафиксировать в `OPEN_QUESTIONS.md § Conflicts`

## Canonical scope

- contains: один конкретный утверждённый факт с контекстом и provenance
- excludes:
  - мнения или гипотезы без источника -> `OPEN_QUESTIONS.md`
  - архитектурные решения -> `DECISIONS.md` + `ADR/`
  - политики -> `POLICIES/`

## Fact

<!-- Одно чёткое утверждение. Не несколько фактов в одном файле. -->

[Утверждение]

## Evidence

<!-- На что опирается этот факт? Ссылки на сессии, документы, human review. -->

- [источник 1]
- [источник 2]

## Confidence history

| Дата | Уровень | Источник |
|------|---------|---------|
| [ГГГГ-ММ-ДД] | observed | [SESSIONS/файл.md] |
| [ГГГГ-ММ-ДД] | observed | decay: last_verified > 60 дней |
| [ГГГГ-ММ-ДД] | inferred | reverification: [SESSIONS/другой.md] |

## Failure routes

- Если confidence не обновлялся -> применить decay из `PATTERNS/confidence-decay.md` при аудите
- Если факт противоречит новому наблюдению -> пометить `⚠️ STALE`; вынести на review
- Если содержит PII -> немедленно удалить или анонимизировать; обновить `pii_risk`
