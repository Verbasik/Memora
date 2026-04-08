---
title: "PATTERN — Wing/Hall/Room Taxonomy"
id: "pattern-wing-hall-room"
type: "PATTERN"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: ["taxonomy", "metadata", "context-filtering", "mempalace"]
purpose: "Трёхуровневая таксономия для классификации сессионных и эпизодических записей"
entrypoint: "AGENTS.md -> INDEX.md -> PATTERNS/wing-hall-room.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PATTERNS/observation-typing.md"
  - "PATTERNS/progressive-disclosure.md"
provides:
  - "wing_hall_room_vocabulary"
  - "session_metadata_schema"
  - "filtered_retrieval_keys"
source: "Адаптировано из mempalace v3.0.0 Wing/Hall/Room architecture"
last_verified: "2026-04-08"
max_lines: 100
---

# Wing/Hall/Room Taxonomy

Трёхуровневая классификация записей памяти. Добавляется как front matter в SESSIONS/ и EPISODES/.
Не меняет файловую структуру — только обогащает metadata для будущего filtered retrieval.

## Contract

- when: создание SESSION или EPISODE записи; filtered search по агенту/домену/теме
- prereq: известен контекст записи (агент, тип знания, тема)
- reads: этот файл; `PATTERNS/observation-typing.md` для маппинга hall ↔ type
- writes: none
- success: запись помечена wing/hall/room; поиск по metadata возможен
- on_fail: если wing/room неизвестны → оставить пустыми, не угадывать

## Три уровня иерархии

```
Wing  (агент или домен)
└── Hall  (тип знания)
    └── Room  (конкретная тема)
```

### Wing — кто или что

Идентифицирует агента-владельца или предметную область.

| Значение | Когда использовать |
|----------|--------------------|
| `claude` | Сессии агента Claude Code |
| `codex` | Сессии агента Codex CLI |
| `qwen` | Сессии агента Qwen Code |
| `opencode` | Сессии агента OpenCode |
| `feature-<slug>` | Работа над конкретной фичей |
| `infra` | Инфраструктура, DevOps, CI/CD |
| `docs` | Документация, memory bank |
| `research` | Исследования, анализ внешних проектов |

### Hall — тип знания

Соответствует `observation_type` из `PATTERNS/observation-typing.md`.

| Hall | Observation types | Что хранится |
|------|------------------|-------------|
| `hall_facts` | `decision`, `discovery` | Решения, конфигурационные факты |
| `hall_events` | `feature`, `incident` | Сессии, milestone, инциденты |
| `hall_discoveries` | `discovery`, `refactor` | Инсайты, паттерны, gotchas |
| `hall_advice` | любой | Рекомендации, уроки, best practices |

Если нет доминирующего типа → используй `hall_events` как fallback.

### Room — конкретная тема

Slug темы, к которой относится запись. Произвольный kebab-case.

Примеры: `auth-migration`, `db-schema`, `api-refactor`, `memory-bank-setup`, `stop-hooks`, `entity-detection`

## Front matter schema

```yaml
wing: claude          # агент или домен
hall: hall_events     # тип знания (см. таблицу выше)
room: stop-hooks      # тема в kebab-case
```

Добавляется в `---` блок SESSIONS/ и EPISODES/ файлов.

## Использование при retrieval (Layer 2)

```
# Фильтр по wing — все сессии агента claude
find memory-bank/.local/SESSIONS/ -name "*.md" | xargs grep -l "wing: claude"

# Фильтр по hall — все решения
grep -rl "hall: hall_facts" memory-bank/

# Фильтр по room — все записи о конкретной теме
grep -rl "room: stop-hooks" memory-bank/
```

При реализации ChromaDB-поиска эти поля станут where-clause filters (Layer 2 из progressive-disclosure).

## Pitfalls

- Не создавай новые halls — только из таблицы выше.
- Wing НЕ равно имени пользователя — это агент/домен, не человек.
- Room должен быть одним slug (kebab-case), не предложением.
- Если не уверен в wing/room — оставь пустым. Пустое лучше, чем неточное.
