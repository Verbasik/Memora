#!/usr/bin/env bash
set -euo pipefail

echo "Инициализация Memory Bank v3..."

D=$(date +%Y-%m-%d)

# ── Directory structure ────────────────────────────────────────────────────────
mkdir -p memory-bank/{ADR,PATTERNS,AREAS,ARCHIVE,FACTS,EPISODES,POLICIES,AGENTS,TESTS}
mkdir -p memory-bank/.local/SESSIONS
mkdir -p memory-bank/scripts
mkdir -p .claude/{skills/update-memory,skills/memory-audit,skills/memory-consolidate,skills/memory-reflect,skills/memory-gc,agents,rules}
mkdir -p .codex/skills/{update-memory,memory-audit}
mkdir -p .qwen/agents
mkdir -p .opencode/commands

# ── Helper: write file only if it doesn't exist ────────────────────────────────
write_if_missing() {
  local file="$1"
  local content="$2"
  [ -f "$file" ] || printf '%s\n' "$content" > "$file"
}

# ── Core memory-bank files ─────────────────────────────────────────────────────

write_if_missing memory-bank/CONSTITUTION.md "---
title: \"КОНСТИТУЦИЯ ПРОЕКТА\"
id: \"constitution\"
type: \"CONSTITUTION\"
version: \"1.0.0\"
authority: \"immutable\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: [\"governance\", \"principles\"]
last_verified: \"$D\"
---

# КОНСТИТУЦИЯ ПРОЕКТА

> Загружай когда: архитектурные решения, выбор технологий, ревью.
> Макс: 60 строк. Верифицировано: $D.
> УРОВЕНЬ ЗАЩИТЫ: неприкосновенный.

## Назначение

Этот файл содержит ненарушимые принципы проекта.

## Принципы

### I. [Заполни первый принцип]

### II. [Заполни второй принцип]

## Управление

- Конституция имеет приоритет над всеми остальными файлами.
- Изменения требуют одобрения человека."

write_if_missing memory-bank/PROJECT.md "---
title: \"ПРОЕКТ\"
id: \"project\"
type: \"PROJECT\"
version: \"1.0.0\"
authority: \"controlled\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# ПРОЕКТ

> Загружай когда: первый раз, scope, домен. Макс: 80 строк. Верифицировано: $D.

## Идентичность

- **Название**:
- **Тип**:
- **Стадия**:"

write_if_missing memory-bank/ARCHITECTURE.md "---
title: \"АРХИТЕКТУРА\"
id: \"architecture\"
type: \"ARCHITECTURE\"
version: \"1.0.0\"
authority: \"controlled\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# АРХИТЕКТУРА

> Загружай когда: архитектура, модули, сервисы. Макс: 120 строк. Верифицировано: $D.

## Обзор системы

"

write_if_missing memory-bank/CONVENTIONS.md "---
title: \"КОНВЕНЦИИ\"
id: \"conventions\"
type: \"CONVENTIONS\"
version: \"1.0.0\"
authority: \"controlled\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# КОНВЕНЦИИ

> Загружай когда: код, ревью. Макс: 100 строк. Верифицировано: $D.
"

write_if_missing memory-bank/TESTING.md "---
title: \"ТЕСТИРОВАНИЕ\"
id: \"testing\"
type: \"TESTING\"
version: \"1.0.0\"
authority: \"controlled\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# ТЕСТИРОВАНИЕ

> Загружай когда: тесты, CI. Макс: 60 строк. Верифицировано: $D.

## Команды

\`\`\`bash

\`\`\`"

write_if_missing memory-bank/DECISIONS.md "---
title: \"РЕШЕНИЯ\"
id: \"decisions\"
type: \"DECISIONS\"
version: \"1.0.0\"
authority: \"controlled\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# РЕШЕНИЯ

> Макс: 80 строк. Верифицировано: $D.

| # | Решение | Статус | Дата | ADR | Влияние |
|---|---------|--------|------|-----|---------|"

write_if_missing memory-bank/OPEN_QUESTIONS.md "---
title: \"ОТКРЫТЫЕ ВОПРОСЫ\"
id: \"open-questions\"
type: \"OPEN_QUESTIONS\"
version: \"1.0.0\"
authority: \"free\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# ОТКРЫТЫЕ ВОПРОСЫ

> Макс: 60 строк. Верифицировано: $D.

| # | Вопрос | Контекст | Поднят | Владелец | Статус |
|---|--------|----------|--------|----------|--------|"

write_if_missing memory-bank/CHANGELOG.md "---
title: \"CHANGELOG\"
id: \"changelog\"
type: \"CHANGELOG\"
version: \"1.0.0\"
authority: \"free\"
status: \"active\"
pii_risk: \"none\"
ttl: null
tags: []
last_verified: \"$D\"
---

# CHANGELOG

## [Unreleased]

-"

# ── Session files (gitignored, no front-matter validation required) ─────────────

[ -f "memory-bank/.local/CURRENT.md" ] || cat > memory-bank/.local/CURRENT.md <<EOF
# ТЕКУЩЕЕ СОСТОЯНИЕ

> Последнее обновление: $D от init

## Активная цель

[Установи первую цель]

## Статус

- [ ] Заполнить PROJECT.md
- [ ] Заполнить ARCHITECTURE.md
- [ ] Заполнить TESTING.md
- [ ] Установить реальную цель

## Checkpoint compaction

> Timestamp: $D
EOF

[ -f "memory-bank/.local/HANDOFF.md" ] || cat > memory-bank/.local/HANDOFF.md <<EOF
# ПЕРЕДАЧА КОНТЕКСТА

> Написано: $D от init

## Что сделано

Memory bank инициализирован.

## Что делать дальше

1. Заполнить PROJECT.md
2. Заполнить ARCHITECTURE.md
3. Заполнить TESTING.md
4. Установить цель в CURRENT.md
EOF

# ── Toolchain settings ─────────────────────────────────────────────────────────
[ -f ".qwen/settings.json" ] || printf '%s\n' '{"context":{"fileName":["AGENTS.md","QWEN.md"]}}' > .qwen/settings.json

# ── .gitignore ─────────────────────────────────────────────────────────────────
if [ -f .gitignore ]; then
  grep -q "memory-bank/.local/" .gitignore 2>/dev/null || \
    printf '\n# Memory bank — локальные файлы сессий\nmemory-bank/.local/\n.claude/memory/\n.qwen/memory/\n' >> .gitignore
else
  printf '# Memory bank — локальные файлы сессий\nmemory-bank/.local/\n.claude/memory/\n.qwen/memory/\n' > .gitignore
fi

# ── .claudeignore ──────────────────────────────────────────────────────────────
[ -f .claudeignore ] || printf '.env\n.env.*\n*.key\n*.pem\n*.p12\n**/secrets/\n**/credentials/\n' > .claudeignore

echo ""
echo "✓ Memory Bank v3 инициализирован."
echo ""
echo "Следующие шаги:"
echo "  1. Скопируй AGENTS.md и CLAUDE.md в корень проекта"
echo "  2. Скопируй skill-файлы в .claude/, .codex/, .qwen/, .opencode/"
echo "  3. Заполни memory-bank/PROJECT.md"
echo "  4. Заполни memory-bank/ARCHITECTURE.md"
echo "  5. Заполни memory-bank/TESTING.md"
echo "  6. git add AGENTS.md CLAUDE.md memory-bank/*.md memory-bank/ADR/"
echo "  7. Скопируй скрипты в memory-bank/scripts/"
echo "  8. Запусти: memora validate  — для проверки front-matter"
