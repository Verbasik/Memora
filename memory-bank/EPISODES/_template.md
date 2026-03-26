---
title: "EPISODES/[ГГГГ-ММ-ДД]-[slug] — [краткое описание события]"
id: "episode-[ГГГГ-ММ-ДД]-[slug]"
type: "EPISODE"
version: "1.0.0"
authority: "free"
status: "active"
owner: "[агент]"
session_id: "[опционально — id исходной сессии]"
created_at: "[ГГГГ-ММ-ДД]"
pii_risk: "none"
ttl: "90d"
tags: []
<!-- reflected: -->
<!-- consolidated: -->
---

# Episode: [краткое описание]

Структурированная запись прошедшей сессии или значимого события.
Живёт в `EPISODES/` после promotion из `.local/SESSIONS/`.

## Contract

- when: promotion из сессии; восстановление контекста прошлой работы; memory-reflect/consolidate
- prereq: сессия завершена; есть знания, достойные сохранения дольше 30 дней
- reads: этот файл
- writes: при пометке `reflected`/`consolidated`
- success: ключевые действия, выводы и знания для промоции задокументированы
- on_fail: если нет промотируемых знаний -> не создавать EPISODE; оставить в SESSIONS

## Canonical scope

- contains: контекст сессии, ключевые действия, выводы, знания для промоции
- excludes:
  - сырой вывод терминала -> не записывать
  - PII пользователя -> не записывать
  - секреты и токены -> не записывать

## Summary

<!-- 2–3 предложения: что произошло и почему это важно. -->

[Краткое описание сессии]

## Key actions

<!-- Что было сделано. Только значимые шаги. -->

- [действие 1]
- [действие 2]

## Observations

<!-- Типизированные наблюдения. Type из PATTERNS/observation-typing.md. -->

| # | Наблюдение | Type | Concepts | Для промоции |
|---|-----------|------|----------|-------------|
| 1 | [текст] | discovery | how-it-works, gotcha | FACTS/[slug].md |
| 2 | [текст] | decision | why-it-exists, trade-off | DECISIONS.md |

## Knowledge for promotion

<!-- Список знаний, готовых к промоции в канонические файлы.
     Отмечай [x] после промоции. -->

- [ ] [факт/решение] -> [целевой файл]
- [ ] [факт/решение] -> [целевой файл]

## Open questions raised

<!-- Вопросы, возникшие в ходе сессии. -->

- [вопрос]

## Failure routes

- Если ttl истёк -> перенести в `ARCHIVE/` через `memory-gc`
- Если все пункты промоции отмечены -> пометить `<!-- consolidated: ГГГГ-ММ-ДД -->`
