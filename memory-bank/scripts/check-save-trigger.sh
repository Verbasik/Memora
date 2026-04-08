#!/usr/bin/env bash
# check-save-trigger.sh — блокирующий триггер сохранения памяти
#
# Назначение: считать human-exchanges в сессии и блокировать завершение,
#             если накопилось достаточно несохранённых сообщений.
#
# Адаптировано из паттерна mempalace/hooks/mempal_save_hook.sh
# (mempalace v3.0.0, MIT License)
#
# Механизм:
#   1. Читает JSON со stdin (Claude Code Stop hook payload)
#   2. Если stop_hook_active=true → пропускает (предотвращает infinite loop)
#   3. Считает human-сообщения в JSONL-транскрипте сессии
#   4. Если накопилось >= SAVE_INTERVAL с момента последнего сохранения →
#      блокирует завершение и просит запустить /update-memory
#
# Использование (в .claude/settings.json):
#   hooks.Stop: {"type": "command", "command": "bash -c '...check-save-trigger.sh'"}
#
# Exit codes:
#   0 — всегда (advisory или blocking через JSON-ответ)
#
# Env:
#   SAVE_INTERVAL  — порог сообщений (default: 20)
#   MEMORA_STATE   — директория состояния (default: ~/.memora/hook_state)

set -uo pipefail

# ── Конфигурация ──────────────────────────────────────────────────────────────

SAVE_INTERVAL="${SAVE_INTERVAL:-20}"
STATE_DIR="${MEMORA_STATE:-$HOME/.memora/hook_state}"
mkdir -p "$STATE_DIR"

# ── Чтение JSON payload от Claude Code ───────────────────────────────────────

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('session_id','unknown'))" 2>/dev/null || echo "unknown")
# Санитизация: только буквы/цифры/дефис/подчёркивание
SESSION_ID=$(echo "$SESSION_ID" | tr -cd 'a-zA-Z0-9_-')
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null || echo "false")

TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null || echo "")
TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

# ── Infinite loop prevention ──────────────────────────────────────────────────
# Если агент уже в цикле сохранения — пропустить безусловно

if [ "$STOP_HOOK_ACTIVE" = "True" ] || [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo "{}"
  exit 0
fi

# ── Подсчёт human-exchanges из JSONL-транскрипта ─────────────────────────────

EXCHANGE_COUNT=0

if [ -f "$TRANSCRIPT_PATH" ]; then
  EXCHANGE_COUNT=$(python3 - "$TRANSCRIPT_PATH" <<'PYEOF'
import json, sys

count = 0
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            msg = entry.get('message', {})
            if not isinstance(msg, dict):
                continue
            if msg.get('role') != 'user':
                continue
            content = msg.get('content', '')
            # Пропускаем системные/командные сообщения
            if isinstance(content, str) and '<command-message>' in content:
                continue
            # Пропускаем tool results
            if isinstance(content, list):
                roles = [b.get('type') for b in content if isinstance(b, dict)]
                if 'tool_result' in roles and 'text' not in roles:
                    continue
            count += 1
        except (json.JSONDecodeError, AttributeError):
            pass
print(count)
PYEOF
  2>/dev/null || echo "0")
fi

# ── Отслеживание последнего сохранения ───────────────────────────────────────

LAST_SAVE_FILE="$STATE_DIR/${SESSION_ID}_last_save"
LAST_SAVE=0
if [ -f "$LAST_SAVE_FILE" ]; then
  LAST_SAVE=$(cat "$LAST_SAVE_FILE" 2>/dev/null || echo "0")
fi

SINCE_LAST=$((EXCHANGE_COUNT - LAST_SAVE))

# ── Лог (для отладки) ─────────────────────────────────────────────────────────

LOG_FILE="$STATE_DIR/hook.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] session=$SESSION_ID exchanges=$EXCHANGE_COUNT since_last=$SINCE_LAST threshold=$SAVE_INTERVAL" >> "$LOG_FILE"

# ── Решение: блокировать или пропустить ──────────────────────────────────────

if [ "$SINCE_LAST" -ge "$SAVE_INTERVAL" ] && [ "$EXCHANGE_COUNT" -gt 0 ]; then
  # Сохраняем текущую точку — следующий Stop будет пропущен (stop_hook_active=true)
  echo "$EXCHANGE_COUNT" > "$LAST_SAVE_FILE"

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] BLOCKING — triggering save at exchange $EXCHANGE_COUNT" >> "$LOG_FILE"

  # Блокируем завершение: Claude Code покажет reason агенту как system message
  cat << 'HOOKJSON'
{
  "decision": "block",
  "reason": "CHECKPOINT: накопилось несохранённых exchanges. Запусти /update-memory чтобы зафиксировать прогресс в memory bank (CURRENT.md, HANDOFF.md, SESSIONS/). После сохранения можешь завершить работу."
}
HOOKJSON

else
  # Не достигли порога — пропускаем
  echo "{}"
fi

exit 0
