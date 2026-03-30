#!/usr/bin/env bash
# run-stop-hooks.sh — wrapper: запускает все Stop-хуки последовательно
#
# Используется toolchains, которые поддерживают только одну команду на Stop-событие
# (например, Codex CLI с [hooks.Stop]).
#
# Каждый скрипт advisory и всегда возвращает exit 0.
# Wrapper тоже всегда возвращает exit 0.

SCRIPTS_DIR="$(dirname "$0")"

bash "$SCRIPTS_DIR/check-reflect-trigger.sh"
bash "$SCRIPTS_DIR/check-consolidate-trigger.sh"
bash "$SCRIPTS_DIR/check-gc-trigger.sh"

exit 0
