# HOOKS — Детерминированные триггеры обслуживания памяти

Практическое руководство: что это, как настроить, как проверить.

---

## Зачем нужны хуки

LLM-агент по природе вероятностен: он может забыть запустить рефлексию, не заметить накопление сессий или запустить её дважды. Хуки решают эту проблему — они **детерминированы** и **не зависят от reasoning модели**.

```
Без хуков:                    С хуками:
──────────────────────        ──────────────────────────────
Агент завершил работу         Агент завершил работу
    ↓                             ↓
Может быть запустит           Stop event → скрипт
memory-reflect...             → считает сессии
Или не запустит.              → выводит уведомление
                              Всегда. Детерминированно.
```

**Хуки в Memora — advisory**: они уведомляют агента, но не запускают рефлексию автоматически. Агент сам решает. Это сделано намеренно — против промпт-инъекций и нежелательного автоматизма.

---

## Как работает система

### Архитектура

```
┌──────────────────────────────────────────────────────────┐
│                    Agent lifecycle                       │
│                                                          │
│  Session starts → работает → Stop event                  │
└─────────────────────────────┬────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Hook fires       │  (tool-specific adapter)
                    │  Claude: Stop     │
                    │  Codex:  Stop     │
                    │  Qwen:   Stop     │
                    │  OpenCode: plugin │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────────────────────────┐
                    │  check-reflect-trigger.sh             │
                    │  (единый скрипт для всех toolchains)  │
                    │                                       │
                    │  1. Сканирует SESSIONS/*.md           │
                    │  2. Считает файлы без <!-- reflected: │
                    │  3. Если ≥ REFLECT_THRESHOLD (def: 3) │
                    │     → выводит advisory-уведомление    │
                    └─────────┬─────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
        < threshold                    ≥ threshold
               │                             │
           (тихий                    ╔═══════════════╗
            exit 0)                  ║ 💡 memory-    ║
                                     ║ reflect:      ║
                                     ║ N сессий без  ║
                                     ║ обработки.    ║
                                     ║ Запусти:      ║
                                     ║ /memory-      ║
                                     ║  reflect      ║
                                     ╚═══════════════╝
```

### Три хука, один Stop-event

| Хук | Скрипт | Триггер | Порог (env) | Default |
|-----|--------|---------|-------------|---------|
| `memory-reflect` | `check-reflect-trigger.sh` | Сессии без `<!-- reflected:` | `REFLECT_THRESHOLD` | 3 |
| `memory-consolidate` | `check-consolidate-trigger.sh` | Сессии без `<!-- consolidated:` | `CONSOLIDATE_THRESHOLD` | 5 |
| `memory-gc` | `check-gc-trigger.sh` | Всего файлов в `SESSIONS/` | `GC_THRESHOLD` | 20 |

Все три скрипта запускаются при каждом Stop-событии, независимо друг от друга.

### Ручной запуск скриптов

```bash
# Рефлексия
bash memory-bank/scripts/check-reflect-trigger.sh [--threshold N] [--quiet]

# Консолидация
bash memory-bank/scripts/check-consolidate-trigger.sh [--threshold N] [--quiet]

# GC
bash memory-bank/scripts/check-gc-trigger.sh [--threshold N] [--quiet]

# Все три сразу (используется Codex):
bash memory-bank/scripts/run-stop-hooks.sh

# Всегда exit 0 — не блокируют pipeline
```

---

## Настройка по toolchains

---

### Claude Code ✅ Задокументирован

**Конфиг:** `.claude/settings.json`

```json
{
  "permissions": { "...": "..." },
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "bash memory-bank/scripts/check-reflect-trigger.sh" },
          { "type": "command", "command": "bash memory-bank/scripts/check-consolidate-trigger.sh" },
          { "type": "command", "command": "bash memory-bank/scripts/check-gc-trigger.sh" }
        ]
      }
    ]
  }
}
```

Все три команды выполняются последовательно при каждом Stop. Каждая независима.

**Как проверить:**
1. Открой проект в Claude Code.
2. Выполни любую задачу и завершись.
3. При достижении порогов появятся блоки с уведомлениями.

**Настройка порогов:**
```bash
export REFLECT_THRESHOLD=5      # default: 3
export CONSOLIDATE_THRESHOLD=7  # default: 5
export GC_THRESHOLD=30          # default: 20
```

---

### Qwen Code ✅ Подтверждён (v0.12.0+)

**Конфиг:** `.qwen/settings.json`

```json
{
  "context": {
    "fileName": ["AGENTS.md", "QWEN.md"]
  },
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "bash memory-bank/scripts/check-reflect-trigger.sh" },
          { "type": "command", "command": "bash memory-bank/scripts/check-consolidate-trigger.sh" },
          { "type": "command", "command": "bash memory-bank/scripts/check-gc-trigger.sh" }
        ]
      }
    ]
  }
}
```

Qwen реализовал hooks по образцу Claude Code (feature "Adding Claude Like hooks" — Done в v0.12.0). Формат идентичен.

**Как проверить:**
1. Убедись, что установлена Qwen Code v0.12.0 или выше.
2. Открой проект: `qwen code .`
3. Выполни задачу → завершение → уведомление появится в output при наличии ≥ 3 сессий.

**Проверка версии:**
```bash
qwen --version
# Нужно: 0.12.0+
```

**Известное ограничение:** в untrusted workspace (`qwen code --untrusted`) project settings отключаются, хуки не сработают. Убедись, что директория в trusted list.

---

### Codex CLI ⚠️ Experimental (v0.114.0+)

**Конфиг:** `.codex/config.toml`

Codex поддерживает только одну команду в `[hooks.Stop]`, поэтому используется wrapper-скрипт:

```toml
[hooks.Stop]
command = "bash memory-bank/scripts/run-stop-hooks.sh"
```

`run-stop-hooks.sh` последовательно вызывает все три скрипта:
```bash
# memory-bank/scripts/run-stop-hooks.sh
bash "$SCRIPTS_DIR/check-reflect-trigger.sh"
bash "$SCRIPTS_DIR/check-consolidate-trigger.sh"
bash "$SCRIPTS_DIR/check-gc-trigger.sh"
```

**Статус:** экспериментальные хуки добавлены в v0.114.0 (11 марта 2026). Формат TOML может измениться в следующих версиях.

**Fallback через `notify` (если `[hooks.Stop]` не работает):**

```toml
# В .codex/config.toml замени [hooks.Stop] на:
[notify]
command = "bash memory-bank/scripts/run-stop-hooks.sh"
```

`notify` срабатывает при `agent-turn-complete` и передаёт JSON payload скрипту через stdin. Скрипт игнорирует stdin и работает корректно.

**Как проверить notify:**
```bash
codex --trust-project
# После завершения хода агента в логе должен появиться вывод скрипта
```

---

### OpenCode ⚠️ Plugin API (проверь версию)

OpenCode использует отдельный ES-модуль плагин для каждого хука. Все три находятся в `.opencode/plugins/`:

| Файл | Хук |
|------|-----|
| `reflect-trigger.js` | memory-reflect |
| `consolidate-trigger.js` | memory-consolidate |
| `gc-trigger.js` | memory-gc |

Все три следуют одному паттерну:
```js
import { execSync } from "child_process";

export default {
  name: "consolidate-trigger",  // уникальное имя для каждого
  subscribe: ["session.idle", "tool.execute.after"],

  handler(event, ctx) {
    const trigger =
      event.type === "session.idle" ||
      (event.type === "tool.execute.after" &&
        event.tool?.name?.includes("update-memory"));

    if (!trigger) return {};

    try {
      const output = execSync(
        "bash memory-bank/scripts/check-consolidate-trigger.sh",  // свой скрипт
        { cwd: ctx.cwd, encoding: "utf-8", timeout: 5000 }
      );
      if (output.trim()) return { additionalContext: output.trim() };
    } catch (_) {}

    return {};
  },
};
```

**Требует ES module.** В директории плагинов лежит `package.json`:
```json
{ "type": "module" }
```

**Как подключить плагины:**
```bash
opencode plugin add .opencode/plugins/reflect-trigger.js
opencode plugin add .opencode/plugins/consolidate-trigger.js
opencode plugin add .opencode/plugins/gc-trigger.js
```

**Как проверить:**
1. Зарегистрируй плагин (команда зависит от версии).
2. Выполни задачу → при завершении сессии (`session.idle`) плагин вызовет скрипт.
3. Вывод скрипта вернётся в `additionalContext` агенту.

**Если API изменился:** ключевые поля для адаптации:

| Что | Текущее значение | Альтернативы |
|---|---|---|
| Экспорт | `export default` | `export const plugin =` |
| Список событий | `subscribe: [...]` | `on: [...]`, `events: [...]` |
| Callback | `handler(event, ctx)` | `handle(event, ctx)` |
| Результат | `{ additionalContext }` | `{ message }`, `{ context }` |

---

## Защита от двойной рефлексии

Два механизма исключают повторную обработку:

**1. Hook — только уведомление**

Хук не запускает `/memory-reflect` автоматически. Он выводит сообщение агенту, агент сам принимает решение.

**2. Skill — идемпотентный фильтр**

Шаг 1 `memory-reflect` фильтрует уже обработанные сессии:
```
Если файл содержит <!-- reflected: ГГГГ-ММ-ДД --> → пропустить
```

Даже если рефлексия запустится дважды — второй запуск найдёт 0 подходящих сессий и завершится с сообщением «Недостаточно сессий».

**3. Из `memory-consolidate` убрана ручная рекомендация**

Инструкция в SKILL.md явно запрещает запускать `/memory-reflect` вручную из consolidate:
> "Триггер рефлексии: хук Stop автоматически проверит. Не запускай /memory-reflect вручную из consolidate."

---

## Полный тест системы за 3 минуты

```bash
# 1. Создай 5 тестовых сессий
mkdir -p memory-bank/.local/SESSIONS
for i in 1 2 3 4 5; do
  cat > "memory-bank/.local/SESSIONS/2026-03-17-test-$i.md" << EOF
# Тестовая сессия $i
## Знания для промоции
- [ ] Тестовый факт $i
EOF
done

# 2. Проверь все три скрипта
bash memory-bank/scripts/check-reflect-trigger.sh
# → уведомление о рефлексии (5 ≥ порога 3)

bash memory-bank/scripts/check-consolidate-trigger.sh
# → уведомление о консолидации (5 ≥ порога 5)

bash memory-bank/scripts/check-gc-trigger.sh
# → тихо (5 < порога 20)

bash memory-bank/scripts/check-gc-trigger.sh --threshold 3
# → уведомление о GC (5 ≥ порога 3)

# 3. Проверь wrapper (Codex)
bash memory-bank/scripts/run-stop-hooks.sh
# → оба уведомления последовательно

# 4. Пометь одну сессию как reflected
echo "<!-- reflected: 2026-03-17 -->" >> memory-bank/.local/SESSIONS/2026-03-17-test-1.md
bash memory-bank/scripts/check-reflect-trigger.sh
# → "4 сессии без рефлексии" (не 5)

# 5. Пометь одну как consolidated
echo "<!-- consolidated: 2026-03-17 -->" >> memory-bank/.local/SESSIONS/2026-03-17-test-2.md
bash memory-bank/scripts/check-consolidate-trigger.sh
# → "4 сессии без консолидации" (не 5)

# 6. Проверь quiet-режим
bash memory-bank/scripts/check-reflect-trigger.sh --quiet && echo "exit: 0 (advisory)"

# 7. Почисти
rm memory-bank/.local/SESSIONS/2026-03-17-test-*.md
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `REFLECT_THRESHOLD` | `3` | Сессий без `reflected` → напомнить о рефлексии |
| `CONSOLIDATE_THRESHOLD` | `5` | Сессий без `consolidated` → напомнить о консолидации |
| `GC_THRESHOLD` | `20` | Всего файлов в `SESSIONS/` → напомнить о GC |
| `SESSIONS_DIR` | `memory-bank/.local/SESSIONS` | Путь к директории сессий (общий для всех) |

Пример `.env` (не коммить в git):
```bash
REFLECT_THRESHOLD=5
CONSOLIDATE_THRESHOLD=7
GC_THRESHOLD=30
```

---

## Troubleshooting

**Уведомление не появляется после завершения сессии**

```bash
# 1. Проверь, что сессии существуют
ls memory-bank/.local/SESSIONS/*.md 2>/dev/null | wc -l

# 2. Проверь скрипт напрямую
bash memory-bank/scripts/check-reflect-trigger.sh

# 3. Для Claude Code — проверь settings.json
cat .claude/settings.json | python3 -m json.tool

# 4. Убедись, что рабочая директория — корень проекта
pwd  # должно заканчиваться на /Memora или имя твоего проекта
```

**Скрипт падает с ошибкой**

```bash
# Проверь bash syntax
bash -n memory-bank/scripts/check-reflect-trigger.sh

# Проверь права (скрипт вызывается через bash, не нужен chmod +x)
bash memory-bank/scripts/check-reflect-trigger.sh --threshold 1
```

**Codex: хук не срабатывает**

```bash
# Переключись на notify fallback в .codex/config.toml:
# Закомментируй [hooks.Stop], раскомментируй [notify]
codex --trust-project --help | grep notify
```

**OpenCode: плагин не загружается**

```bash
# Проверь синтаксис ES module
node --input-type=module < .opencode/plugins/reflect-trigger.js 2>&1 | head -5

# Проверь что package.json с "type":"module" на месте
cat .opencode/plugins/package.json
```

**Двойное уведомление (хук + что-то ещё)**

Убедись, что в SKILL.md `memory-consolidate` нет строки «рекомендуется запустить /memory-reflect» — она должна быть заменена на предупреждение про хук (это сделано в текущей версии Memora).

---

## Архитектурное решение: почему advisory, а не auto-run

Хук мог бы автоматически вызывать `/memory-reflect` без участия агента. Мы отказались от этого по трём причинам:

1. **Prompt injection риск.** Если хук автоматически запускает skill, содержимое сессий (включая потенциально вредоносный контент) напрямую влияет на tool execution без валидации агентом.

2. **Непредсказуемость контекста.** Автозапуск рефлексии в середине другой задачи смешивает контексты. Advisory даёт агенту выбрать правильный момент.

3. **Управляемость.** Пользователь видит уведомление и может решить пропустить рефлексию — например, если проект в середине крупного рефакторинга.

Это соответствует принципу из MANIFESTO.md: «Approval gates — одна из базовых практик для production agent systems».
