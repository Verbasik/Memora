#!/usr/bin/env bash
# check-reflect-trigger.sh — детерминированный триггер рефлексии
#
# Назначение: подсчитать сессии без пометки `reflected` и уведомить агента,
#             если накопилось достаточно материала для рефлексии.
#
# Использование:
#   bash memory-bank/scripts/check-reflect-trigger.sh [--quiet] [--threshold N]
#
#   --quiet       не выводить ничего, только exit code
#   --threshold N переопределить порог (по умолчанию: REFLECT_THRESHOLD или 3)
#
# Exit codes:
#   0 — рефлексия не нужна (меньше порога)
#   0 — рефлексия нужна (сообщение выведено, exit 0 чтобы не блокировать pipeline)
#
# Env:
#   REFLECT_THRESHOLD — порог сессий (default: 3)
#   SESSIONS_DIR      — путь к директории сессий (default: memory-bank/.local/SESSIONS)

set -uo pipefail

# ── Параметры ─────────────────────────────────────────────────────────────────

THRESHOLD="${REFLECT_THRESHOLD:-3}"
_PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
SESSIONS_DIR="${SESSIONS_DIR:-${_PROJECT_ROOT}/memory-bank/.local/SESSIONS}"
QUIET=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)      QUIET=true; shift ;;
    --threshold)  THRESHOLD="$2"; shift 2 ;;
    *)            shift ;;
  esac
done

# ── Подсчёт непомеченных сессий ───────────────────────────────────────────────

UNREFLECTED=0
TOTAL=0

if [ -d "$SESSIONS_DIR" ]; then
  while IFS= read -r -d '' f; do
    [[ "$f" == *"_template"* ]] && continue
    TOTAL=$((TOTAL + 1))
    # Ищем пометку <!-- reflected: ... --> в любом месте файла
    if ! grep -qiE "<!--\s*reflected:" "$f" 2>/dev/null; then
      UNREFLECTED=$((UNREFLECTED + 1))
    fi
  done < <(find "$SESSIONS_DIR" -maxdepth 1 -name "*.md" -not -name "_template.md" -print0 2>/dev/null)
fi

# ── Вывод ─────────────────────────────────────────────────────────────────────

if [ "$UNREFLECTED" -ge "$THRESHOLD" ]; then
  if [ "$QUIET" = false ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  💡 memory-reflect: пора провести рефлексию                 ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    printf  "║  Сессий без рефлексии: %-3s  Порог: %-3s  Всего: %-3s        ║\n" \
      "$UNREFLECTED" "$THRESHOLD" "$TOTAL"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Запусти: /memory-reflect                                   ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
  fi
fi

# Всегда exit 0 — хук advisory, не блокирующий
exit 0
