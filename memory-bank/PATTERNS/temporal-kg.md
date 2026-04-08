---
title: "PATTERN — Temporal Knowledge Graph"
id: "pattern-temporal-kg"
type: "PATTERN"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: ["knowledge-graph", "temporal", "sqlite", "multi-agent", "state-tracking", "mempalace"]
purpose: "Локальный SQLite граф знаний с временными окнами для multi-agent state tracking"
entrypoint: "AGENTS.md -> INDEX.md -> PATTERNS/temporal-kg.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "PATTERNS/wing-hall-room.md"
  - "PATTERNS/progressive-disclosure.md"
provides:
  - "temporal_state_tracking"
  - "historical_queries"
  - "agent_assignment_registry"
source: "Адаптировано из mempalace v3.0.0 knowledge_graph.py (387 строк)"
last_verified: "2026-04-08"
max_lines: 120
---

# Temporal Knowledge Graph

Локальный SQLite граф знаний с поддержкой временных окон. Хранит факты о состоянии агентов,
задачах и решениях с историей изменений. Альтернатива Zep ($25/mo, Neo4j cloud) — локально, бесплатно.

## Contract

- when: tracking состояния агентов; исторические запросы; multi-agent coordination
- prereq: `memory-bank/scripts/knowledge_graph.py` доступен; Python 3.9+
- reads: этот файл; `knowledge_graph.db` через KG API
- writes: `memory-bank/.local/knowledge_graph.db` (не коммитится)
- success: факты о состоянии агентов/задач записаны с временными окнами; исторические запросы работают
- on_fail: если БД недоступна → fallback на CURRENT.md; не блокировать работу

## Структура данных

### Таблица `entities`
Узлы графа: агенты, задачи, технологии, файлы, компоненты.

```
id         TEXT PK    — нормализованное имя (lower_snake)
name       TEXT       — оригинальное имя
type       TEXT       — unknown | agent | task | technology | file | component
properties TEXT JSON  — произвольные метаданные
```

### Таблица `triples`
Рёбра графа с временными окнами.

```
subject    TEXT  — от кого/чего
predicate  TEXT  — тип связи
object     TEXT  — к кому/чему
valid_from TEXT  — с какой даты факт истинен (ISO 8601)
valid_to   TEXT  — до какой даты (NULL = активен сейчас)
confidence REAL  — уверенность 0.0–1.0
source_file TEXT — исходный SESSION-файл
```

## Типичные предикаты

| Предикат | Субъект | Объект | Пример |
|----------|---------|--------|--------|
| `works_on` | агент | задача/фича | claude works_on auth-migration |
| `completed` | агент | задача | claude completed auth-migration |
| `decided` | агент/команда | решение | team decided use-postgresql |
| `uses` | компонент | технология | backend uses postgresql |
| `blocked_by` | задача | блокер | feature-x blocked_by auth-migration |
| `depends_on` | компонент | зависимость | api depends_on auth-service |
| `owns` | агент | компонент | claude owns memory-bank |
| `created` | агент | файл | claude created knowledge_graph.py |

## Python API

```python
from memory_bank.scripts.knowledge_graph import KnowledgeGraph

kg = KnowledgeGraph()  # db: memory-bank/.local/knowledge_graph.db

# Записать факт
kg.add_triple("claude", "works_on", "auth-migration", valid_from="2026-04-08",
              source_file="SESSIONS/2026-04-08-claude-auth.md")

# Завершить факт
kg.invalidate("claude", "works_on", "auth-migration", ended="2026-04-09")

# Текущее состояние агента
kg.query_entity("claude")
# → [{subject: "claude", predicate: "works_on", object: "temporal-kg", current: True, ...}]

# Исторический снимок
kg.query_entity("claude", as_of="2026-04-01")

# Кто работает над auth-migration?
kg.query_relationship("works_on")

# Хронология агента
kg.timeline("claude")

# Статистика
kg.stats()
```

## CLI

```bash
# Записать
python3 memory-bank/scripts/knowledge_graph.py add claude works_on auth-migration --from 2026-04-08
python3 memory-bank/scripts/knowledge_graph.py add claude works_on auth-migration --src SESSIONS/2026-04-08.md

# Завершить
python3 memory-bank/scripts/knowledge_graph.py invalidate claude works_on auth-migration

# Запросы
python3 memory-bank/scripts/knowledge_graph.py query claude
python3 memory-bank/scripts/knowledge_graph.py query claude --as-of 2026-04-01
python3 memory-bank/scripts/knowledge_graph.py rel works_on

# Обзор
python3 memory-bank/scripts/knowledge_graph.py timeline
python3 memory-bank/scripts/knowledge_graph.py stats
```

## Интеграция с lifecycle

### update-memory (запись)
При создании сессионной заметки (шаг 5) — записывать triple:
- `<agent> works_on <room>` — если начат новый room
- `<agent> completed <task>` — если задача завершена
- `<agent> decided <decision-slug>` — при промоции в DECISIONS.md

### memory-restore (чтение, Layer 1.5+)
При наличии KG — добавить в Essential Story текущее состояние агентов:
```
### Agent state (KG)
claude → works_on: temporal-kg (2026-04-08…now)
claude → completed: mempalace-integration-phase-1, phase-2
```

## Ограничения

- БД хранится только локально (`memory-bank/.local/knowledge_graph.db`, в `.gitignore`)
- При работе на другой машине — KG пуст (нет sync механизма)
- При удалении `.local/` — вся история теряется; SESSIONS/ остаётся как fallback
- Не заменяет CURRENT.md — дополняет его структурированным state tracking

## Pitfalls

- Не записывай PII в subject/object — только slug-имена
- Предикаты нормализуются: `works on` → `works_on`; используй snake_case
- `invalidate` без `--ended` ставит сегодняшнюю дату — проверяй актуальность
