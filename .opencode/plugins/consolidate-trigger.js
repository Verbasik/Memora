/**
 * consolidate-trigger.js — OpenCode plugin для детерминированного триггера консолидации.
 *
 * Подписывается на:
 *   - "session.idle"         — агент завершил сессию
 *   - "tool.execute.after"   — после выполнения инструмента update-memory
 *
 * Advisory: выводит additionalContext агенту, НЕ запускает консолидацию автоматически.
 * Порог: CONSOLIDATE_THRESHOLD (default: 5).
 */

import { execSync } from "child_process";

export default {
  name: "consolidate-trigger",

  subscribe: ["session.idle", "tool.execute.after"],

  handler(event, ctx) {
    const isSessionIdle = event.type === "session.idle";
    const isAfterUpdateMemory =
      event.type === "tool.execute.after" &&
      event.tool?.name?.includes("update-memory");

    if (!isSessionIdle && !isAfterUpdateMemory) {
      return {};
    }

    try {
      const output = execSync(
        "bash memory-bank/scripts/check-consolidate-trigger.sh",
        { cwd: ctx.cwd, encoding: "utf-8", timeout: 5000 }
      );

      if (output.trim()) {
        return { additionalContext: output.trim() };
      }
    } catch (_) {
      // Не блокируем при ошибке скрипта
    }

    return {};
  },
};
