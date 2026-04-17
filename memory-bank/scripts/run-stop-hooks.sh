#!/usr/bin/env bash
# run-stop-hooks.sh — wrapper: запускает все Stop-хуки последовательно
#
# Используется toolchains, которые поддерживают только одну команду на Stop-событие
# (например, Codex CLI с [hooks.Stop]).
#
# Каждый скрипт advisory и всегда возвращает exit 0.
# Wrapper тоже всегда возвращает exit 0.

SCRIPTS_DIR="$(dirname "$0")"
TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPTS_DIR/../..")"

# Read Stop payload from stdin (Codex passes the JSON payload here).
# Advisory scripts don't need it; the runtime checkpoint does.
PAYLOAD=$(cat)

bash "$SCRIPTS_DIR/check-reflect-trigger.sh"
bash "$SCRIPTS_DIR/check-consolidate-trigger.sh"
bash "$SCRIPTS_DIR/check-gc-trigger.sh"

# Runtime checkpoint — forward payload via stdin.
# Runs advisory-only: errors do not fail the wrapper.
printf '%s' "$PAYLOAD" | node "$TOPLEVEL/.codex/hooks/stop-checkpoint.js" || true

exit 0
