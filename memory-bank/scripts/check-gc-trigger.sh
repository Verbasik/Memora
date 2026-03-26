#!/usr/bin/env bash
# check-gc-trigger.sh — детерминированный триггер garbage collection
#
# Назначение: подсчитать общее число сессионных файлов и уведомить агента,
#             если SESSIONS/ разросся сверх допустимого порога.
#
# Использование:
#   bash memory-bank/scripts/check-gc-trigger.sh [--quiet] [--threshold N]
#
#   --quiet       не выводить ничего, только exit code
#   --threshold N переопределить порог (по умолчанию: GC_THRESHOLD или 20)
#
# Exit codes:
#   0 — всегда (advisory, не блокирует pipeline)
#
# Env:
#   GC_THRESHOLD — порог файлов в SESSIONS/ (default: 20)
#   SESSIONS_DIR — путь к директории сессий (default: memory-bank/.local/SESSIONS)

set -uo pipefail

# ── Параметры ─────────────────────────────────────────────────────────────────

THRESHOLD="${GC_THRESHOLD:-20}"
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

# ── Подсчёт файлов в SESSIONS/ ────────────────────────────────────────────────

TOTAL=0

if [ -d "$SESSIONS_DIR" ]; then
  while IFS= read -r -d '' f; do
    [[ "$f" == *"_template"* ]] && continue
    TOTAL=$((TOTAL + 1))
  done < <(find "$SESSIONS_DIR" -maxdepth 1 -name "*.md" -not -name "_template.md" -print0 2>/dev/null)
fi

# ── Вывод ─────────────────────────────────────────────────────────────────────

if [ "$TOTAL" -ge "$THRESHOLD" ]; then
  if [ "$QUIET" = false ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  🧹 memory-gc: SESSIONS/ разросся, пора убраться           ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    printf  "║  Файлов в SESSIONS/: %-3s  Порог: %-3s                      ║\n" \
      "$TOTAL" "$THRESHOLD"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Запусти: /memory-gc                                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
  fi
fi

# Всегда exit 0 — хук advisory, не блокирующий
exit 0
