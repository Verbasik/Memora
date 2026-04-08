---
name: memory-restore
description: Восстановление контекста в начале новой сессии. Вызывай первым действием — после memory-bootstrap, перед любой задачей.
---

Восстанови контекст из memory bank для продолжения работы.

## 1. Layer 1 — Session briefing (~200 tokens)

Прочитай `memory-bank/.local/HANDOFF.md`.

Если файл структурирован по контракту — извлеки 7 полей:
**Request** / **Investigated** / **Learned** / **Completed** / **Next steps** / **Risks** / **Active files**

Если файл в legacy free-form — парси как обычный текст (backward-compatible).

Если файл отсутствует или пустой → перейди к шагу 2 без briefing.

## 2. Layer 2 — Current state (~400 tokens)

Прочитай `memory-bank/.local/CURRENT.md`:
- Активные задачи и их статус.
- Текущий фокус работы.
- Незавершённые действия.

Прочитай `memory-bank/INDEX.md` — определи маршрутизацию для текущей задачи.

Если оба файла пустые или содержат только шаблон → первый запуск. Выполни `/memory-bootstrap`.

## 2.5. Layer 1.5 — Essential Story (~600 токенов)

Если `memory-bank/.local/SESSIONS/` существует и содержит файлы (кроме `_template.md`):

1. Найди последние 3–5 файлов по дате в имени (`ГГГГ-ММ-ДД-*`), отсортированных от новых к старым.
2. Из каждого файла извлеки поля: **Summary**, **Decisions made**, **Discoveries**, **Next steps**.
3. Скомпонуй **Essential Story** — не более 2400 символов (~600 токенов):

```
### Essential Story (последние N сессий)

[ГГГГ-ММ-ДД] [slug]: [Summary — 1 предложение]
→ Решено: [decision1]; [decision2]
→ Открыто: [question1]
→ Далее: [next1]

[ГГГГ-ММ-ДД] [slug]: ...
```

4. Если в файлах пустые секции — пропускай их без упоминания.
5. Если SESSIONS/ пуст или не существует → пропустить этот шаг без сообщения об ошибке.
6. Если `memory-bank/.local/knowledge_graph.db` существует — добавь в Essential Story блок Agent state:

```bash
python3 memory-bank/scripts/knowledge_graph.py query <agent> 2>/dev/null
```

Формат блока в Essential Story:
```
### Agent state (KG)
<agent> → works_on: <task> (<date>…now)
<agent> → completed: <task1>, <task2>
```

Если KG пустой или скрипт недоступен — пропустить без упоминания.

> Цель: агент получает «тепловую карту» последних событий ДО загрузки канонических файлов,
> не тратя токены на полное чтение каждой сессии.

## 3. Определи token budget

Проверь `memory-bank/AGENTS/<agent>.md` (если существует):
- Возьми `token_budget` и `restore_layers`.
- Возьми `observation_types` для фильтрации Layer 4.

Иначе → **default**: budget=8000, layers=[1,2,3].

Подсчитай: `estimated_loaded = (HANDOFF_chars + CURRENT_chars) / 4`
`remaining = budget - estimated_loaded`

## 4. Layer 3 — Canonical context (budget-aware)

На основе задачи и HANDOFF.md загружай canonical files по таблице из `INDEX.md`.

**После каждого файла:** `remaining -= file_chars / 4`

Если `remaining < 500` → СТОП, перейди к шагу 6.

Приоритет загрузки:

| Если задача касается... | Читай |
|-------------------------|-------|
| Архитектуры / модулей | `ARCHITECTURE.md` |
| Принципов / ограничений | `CONSTITUTION.md` |
| Прошлых решений | `DECISIONS.md` |
| Конкретной подсистемы | `AREAS/<имя>.md` |
| Паттернов / техник | `PATTERNS/<имя>.md` |
| Нерешённых вопросов | `OPEN_QUESTIONS.md` |
| Конвенций кода | `CONVENTIONS.md` |

## 5. Layer 4-5 — Deep context (только если budget позволяет)

**Layer 4** (`remaining > 1000`):
- Загрузи релевантные `FACTS/*.md` (фильтруй по `observation_types` из профиля агента).
- Загрузи `DECISIONS.md` если задача касается архитектурных решений.

**Layer 5** (`remaining > 2000`):
- Загрузи последние 3 файла из `EPISODES/*.md`.
- Загрузи релевантные `PATTERNS/*.md`.

Layer 6 (полный скан SESSIONS/) — только для `/memory-reflect` и `/memory-consolidate`.

## 6. Отчёт с token economics

```
## Контекст восстановлен — [дата]

### Token economics
- Budget: [N] / Loaded: [N] (~[chars] chars / 4) / Remaining: [N]
- Layers: [1, 1.5, 2, 3] | Skipped: [4, 5] (budget)
- Файлы: [HANDOFF.md (~200t)] | [CURRENT.md (~400t)] | [Essential Story (~600t)] | ...

### Из предыдущей сессии
[из HANDOFF.md § Completed + Next steps; 1–2 предложения]

### Активные задачи
[из CURRENT.md]

### Следующие шаги
[из HANDOFF.md § Next steps]

### Открытые риски
[из HANDOFF.md § Risks — если есть]
```

## Правила

- НЕ перезаписывай HANDOFF.md или CURRENT.md — только читай.
- Загружай минимум файлов: только то, что нужно для текущей задачи.
- Backward-compatible: парси и legacy free-form HANDOFF.
- Если оба файла пустые → первый запуск, выполни `/memory-bootstrap`.
- Token economics — heuristic, не точный лимит. Загрузка не блокируется — только информирует.
