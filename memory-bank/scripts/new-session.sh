#!/usr/bin/env bash
set -euo pipefail

# Использование: ./memory-bank/scripts/new-session.sh <agent-name> <task-slug>
# Пример: ./memory-bank/scripts/new-session.sh claude fix-auth-timeout

AGENT="${1:?Укажи имя агента (claude/codex/qwen/opencode)}"
SLUG="${2:?Укажи slug задачи (напр. fix-auth-timeout)}"
DATE=$(date +%Y-%m-%d)
FILENAME="memory-bank/.local/SESSIONS/${DATE}-${AGENT}-${SLUG}.md"
TEMPLATE="memory-bank/.local/SESSIONS/_template.md"

if [ -f "$FILENAME" ]; then
  echo "⚠️  Файл уже существует: $FILENAME"
  exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "❌ Шаблон не найден: $TEMPLATE"
  exit 1
fi

sed "s/\[ГГГГ-ММ-ДД\]/${DATE}/g; s/\[agent\]/${AGENT}/g; s/\[slug-задачи\]/${SLUG}/g" \
  "$TEMPLATE" > "$FILENAME"

echo "✓ Создана сессия: $FILENAME"

