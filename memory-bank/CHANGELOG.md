---
title: "CHANGELOG — значимые изменения проекта"
id: "[project-slug]-changelog"
type: "CHANGELOG"
version: "0.1.0"
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

## [ГГГГ-ММ-ДД] — [Заголовок]

- [Что изменилось и почему]
