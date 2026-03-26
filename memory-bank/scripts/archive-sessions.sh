#!/usr/bin/env bash
set -euo pipefail

# Архивация сессий старше N дней (по умолчанию 30)

DAYS="${1:-30}"
SESSIONS_DIR="memory-bank/.local/SESSIONS"
ARCHIVE_DIR="memory-bank/ARCHIVE"

mkdir -p "$ARCHIVE_DIR"

count=0
find "$SESSIONS_DIR" -name "*.md" -not -name "_template.md" -mtime +"$DAYS" | while read -r f; do
  mv "$f" "$ARCHIVE_DIR/"
  echo "  → $(basename "$f")"
  count=$((count + 1))
done

echo "✓ Архивировано файлов: $count (старше $DAYS дней)"

