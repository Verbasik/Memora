#!/usr/bin/env bash
set -euo pipefail

# Валидация структуры и лимитов memory bank

ERRORS=0
WARNINGS=0

check_lines() {
  local file="$1" max="$2" label="$3"
  if [ -f "$file" ]; then
    lines=$(wc -l < "$file")
    if [ "$lines" -gt "$max" ]; then
      echo "❌ $label: $lines строк (макс $max)"
      ERRORS=$((ERRORS + 1))
    fi
  fi
}

check_exists() {
  local file="$1" label="$2"
  if [ ! -f "$file" ]; then
    echo "⚠️  Отсутствует: $label"
    WARNINGS=$((WARNINGS + 1))
  fi
}

echo "Проверка memory bank..."
echo ""

# Проверка существования обязательных файлов
check_exists "memory-bank/INDEX.md" "INDEX.md"
check_exists "memory-bank/CONSTITUTION.md" "CONSTITUTION.md"
check_exists "memory-bank/PROJECT.md" "PROJECT.md"
check_exists "memory-bank/ARCHITECTURE.md" "ARCHITECTURE.md"
check_exists "memory-bank/CONVENTIONS.md" "CONVENTIONS.md"
check_exists "memory-bank/TESTING.md" "TESTING.md"
check_exists "memory-bank/DECISIONS.md" "DECISIONS.md"

# Проверка лимитов строк
check_lines "memory-bank/.local/CURRENT.md" 80 "CURRENT.md"
check_lines "memory-bank/.local/HANDOFF.md" 40 "HANDOFF.md"
check_lines "memory-bank/INDEX.md" 60 "INDEX.md"
check_lines "memory-bank/CONSTITUTION.md" 60 "CONSTITUTION.md"
check_lines "memory-bank/PROJECT.md" 80 "PROJECT.md"
check_lines "memory-bank/ARCHITECTURE.md" 120 "ARCHITECTURE.md"
check_lines "memory-bank/CONVENTIONS.md" 100 "CONVENTIONS.md"
check_lines "memory-bank/TESTING.md" 60 "TESTING.md"
check_lines "memory-bank/DECISIONS.md" 80 "DECISIONS.md"
check_lines "memory-bank/OPEN_QUESTIONS.md" 60 "OPEN_QUESTIONS.md"

# Проверка на секреты
echo ""
echo "Поиск секретов..."
if grep -rniE "(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[A-Za-z0-9]" memory-bank/ 2>/dev/null | grep -v "scripts/" | grep -v "_template"; then
  echo "🔴 Обнаружены возможные секреты!"
  ERRORS=$((ERRORS + 1))
else
  echo "✓ Секреты не обнаружены"
fi

# Подсчёт сессий
SESSION_COUNT=$(find memory-bank/.local/SESSIONS -name "*.md" -not -name "_template.md" 2>/dev/null | wc -l)
if [ "$SESSION_COUNT" -gt 20 ]; then
  echo "⚠️  Сессий: $SESSION_COUNT (рекомендуется архивация)"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "Результат: ❌ ошибок: $ERRORS, ⚠️ предупреждений: $WARNINGS"
[ "$ERRORS" -eq 0 ] && exit 0 || exit 1

