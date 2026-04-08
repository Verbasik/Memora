---
title: "AREAS/mempalace-integration — анализ и план интеграции паттернов mempalace"
id: "mempalace-integration"
type: "AREAS"
version: "1.0.0"
status: "active"
pii_risk: "none"
tags: ["integration", "architecture", "memory", "research"]
purpose: "Зафиксировать архитектурный анализ mempalace и план заимствования паттернов для Memora"
canonical_owner: "Все вопросы об интеграции паттернов mempalace в Memora"
last_verified: "2026-04-08"
max_lines: 200
---

# AREAS: mempalace-integration

Анализ репозитория mempalace v3.0.0 и план применения паттернов в Memora.
Источник: `/Users/me/Documents/Memora/mempalace/`
Дата анализа: 2026-04-08

## Ключевой результат mempalace

- **96.6% LongMemEval** (raw verbatim mode, без API-запросов на summarization)
- Зависимости: ChromaDB + PyYAML (минимально)
- Хранилище: ChromaDB (embeddings) + SQLite (knowledge graph)

---

## Паттерны для заимствования

### 1. 4-Layer Memory Stack (ВЫСОКИЙ приоритет)

**Суть:** чёткая иерархия — сколько контекста загружать и когда.

```
L0 (~100 токенов)  → identity/role — всегда
L1 (~600 токенов)  → auto-generated essential summary — всегда
L2 (~300 токенов)  → on-demand filtered retrieval — по теме
L3 (unlimited)     → full semantic search — по запросу
```

**Применение для Memora:**

| Слой | Что сейчас | Что добавить |
|------|-----------|-------------|
| L0 | `AGENTS.md` header | без изменений |
| L1 | `memory-restore` читает HANDOFF + CURRENT | auto-summary из последних 3-5 SESSIONS/ |
| L2 | `INDEX.md` routing | filtered load по тегам задачи |
| L3 | `memory-explorer` субагент | ChromaDB search по chunks |

**Quick-win:** в `memory-restore` добавить auto-summary из SESSIONS/ как L1.

---

### 2. Temporal Knowledge Graph (СРЕДНИЙ приоритет)

**Суть:** SQLite с временными окнами для tracking состояния агентов.

```python
# Структура: entities + triples с valid_from / valid_to
kg.add_triple("alice", "works_on", "feature-x", valid_from="2026-04-01")
kg.invalidate("alice", "works_on", "feature-y", ended="2026-04-05")

# Исторический запрос
kg.query_entity("alice", as_of="2026-03-15")
# → [works_on: feature-y (expired), ...]

# Текущее состояние
kg.query_entity("alice")
# → [works_on: feature-x (current)]
```

**Применение:** замена/дополнение CURRENT.md для multi-agent state.
Особенно полезно при параллельной работе нескольких агентов.

**Готовый код:** `mempalace/knowledge_graph.py` (387 строк) — берётся почти без изменений.

---

### 3. Wing/Room/Hall таксономия (НИЗКИЙ приоритет)

**Суть:** трёхуровневая иерархия для структурирования знаний.

```
Wing  = агент или домен (alice, devops, auth-system)
Hall  = тип знания (facts, events, discoveries, advice)
Room  = конкретная тема (auth-migration, db-schema)
```

**Применение:** добавить в front matter новых SESSIONS/ и EPISODES/.

```markdown
---
wing: agent-alice
hall: facts
room: auth-migration
---
```

Не меняет структуру файлов, даёт metadata для будущего filtered search.

---

### 4. Blocking Stop Hook (ВЫСОКИЙ приоритет)

**Суть:** хук считает exchanges и блокирует завершение пока память не сохранена.

```bash
# На каждые N сообщений:
{"decision": "block", "reason": "AUTO-SAVE checkpoint — save memory before stopping"}
# После сохранения — второй stop проходит (stop_hook_active=true → пропустить)
```

**Текущая проблема Memora:** Stop hooks только advisory (exit 0, не блокируют).
**Применение:** добавить счётчик exchanges, при достижении порога — block с просьбой `/update-memory`.

**Готовый код:** `mempalace/hooks/mempal_save_hook.sh` (148 строк).

---

### 5. Entity Detection on Init (НИЗКИЙ приоритет)

**Суть:** двухпроходное обнаружение людей/проектов при инициализации.

```bash
memora init ~/projects/
# → Сканирует *.md, находит "Alice", "Bob", "graphql-migration"
# → Спрашивает: is "Alice" a person? [y/n]
# → Сохраняет entities.json
```

**Готовый код:** `mempalace/entity_detector.py` (853 строки).

---

## Что НЕ заимствовать

| Паттерн | Причина |
|---------|---------|
| **AAAK Dialect** | lossy compression, регрессия 96.6% → 84.2% |
| **Palace Graph traversal** | overhead для markdown-based системы |
| **ChromaDB как основное хранилище** | Memora — markdown-first, это сила |
| **CLI split/compress/normalize** | не нужны в programmatic API |

---

## План внедрения

### Фаза 1 — Быстро (1-2 дня)
- [ ] `memory-restore`: auto-summary из SESSIONS/ как L1 layer
- [ ] Stop hook: счётчик exchanges + блокирование при N несохранённых

### Фаза 2 — Средне (1 неделя)
- [ ] Front matter `wing/hall/room` для новых SESSIONS/ и EPISODES/
- [ ] Entity detection при `memora init`

### Фаза 3 — Долго (2-3 недели)
- [ ] Temporal KG (SQLite) для multi-agent state tracking
- [ ] Filtered search по metadata (wing/room/hall)

---

## Ссылки

- Исходный репозиторий: `../mempalace/` (локально)
- Ключевые файлы для изучения:
  - `mempalace/layers.py` — Layer model (515 строк)
  - `mempalace/knowledge_graph.py` — Temporal KG (387 строк)
  - `mempalace/hooks/mempal_save_hook.sh` — Blocking hook (148 строк)
  - `mempalace/entity_detector.py` — Entity detection (853 строк)
- см. `DECISIONS.md` для архитектурных решений
- см. `ARCHITECTURE.md` для общей структуры Memora
