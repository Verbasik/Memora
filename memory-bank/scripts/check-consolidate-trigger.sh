#!/usr/bin/env bash
# check-consolidate-trigger.sh — детерминированный триггер консолидации
#
# Назначение: подсчитать сессии без пометки `consolidated` и уведомить агента,
#             если накопилось достаточно материала для консолидации.
#
# Использование:
#   bash memory-bank/scripts/check-consolidate-trigger.sh [--quiet] [--threshold N]
#
#   --quiet       не выводить ничего, только exit code
#   --threshold N переопределить порог (по умолчанию: CONSOLIDATE_THRESHOLD или 5)
#
# Exit codes:
#   0 — всегда (advisory, не блокирует pipeline)
#
# Env:
#   CONSOLIDATE_THRESHOLD — порог сессий без консолидации (default: 5)
#   SESSIONS_DIR          — путь к директории сессий (default: memory-bank/.local/SESSIONS)

set -uo pipefail

# ── Параметры ─────────────────────────────────────────────────────────────────

THRESHOLD="${CONSOLIDATE_THRESHOLD:-5}"
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

# ── Подсчёт неконсолидированных сессий ────────────────────────────────────────

UNCONSOLIDATED=0
TOTAL=0

if [ -d "$SESSIONS_DIR" ]; then
  while IFS= read -r -d '' f; do
    [[ "$f" == *"_template"* ]] && continue
    TOTAL=$((TOTAL + 1))
    # Ищем пометку <!-- consolidated: ... --> в любом месте файла
    if ! grep -qiE "<!--\s*consolidated:" "$f" 2>/dev/null; then
      UNCONSOLIDATED=$((UNCONSOLIDATED + 1))
    fi
  done < <(find "$SESSIONS_DIR" -maxdepth 1 -name "*.md" -not -name "_template.md" -print0 2>/dev/null)
fi

# ── Вывод ─────────────────────────────────────────────────────────────────────

if [ "$UNCONSOLIDATED" -ge "$THRESHOLD" ]; then
  if [ "$QUIET" = false ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  🔗 memory-consolidate: пора консолидировать сессии         ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    printf  "║  Без консолидации: %-3s  Порог: %-3s  Всего сессий: %-3s     ║\n" \
      "$UNCONSOLIDATED" "$THRESHOLD" "$TOTAL"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Запусти: /memory-consolidate                               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
  fi
fi

# Всегда exit 0 — хук advisory, не блокирующий
exit 0
