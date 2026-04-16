/**
 * reflect-trigger.js — OpenCode plugin для детерминированного триггера рефлексии.
 *
 * OpenCode plugin API (opencode.ai):
 *   - ES module: export default { name, subscribe, handler }
 *   - subscribe: массив событий из event bus OpenCode
 *   - handler(event, ctx): возвращает HookResult или {}
 *
 * Подписывается на:
 *   - "session.idle"         — агент завершил сессию
 *   - "tool.execute.after"   — после выполнения любого инструмента
 *
 * Advisory: выводит additionalContext агенту, НЕ запускает рефлексию автоматически.
 */

import { execSync, execFileSync } from "child_process";

export default {
  name: "reflect-trigger",

  subscribe: ["session.idle", "tool.execute.after"],

  handler(event, ctx) {
    // Срабатываем только при завершении сессии
    // или после инструмента update-memory (новая сессия записана)
    const isSessionIdle = event.type === "session.idle";
    const isAfterUpdateMemory =
      event.type === "tool.execute.after" &&
      event.tool?.name?.includes("update-memory");

    if (!isSessionIdle && !isAfterUpdateMemory) {
      return {};
    }

    try {
      const repoRoot = execFileSync(
        "git", ["rev-parse", "--show-toplevel"],
        { cwd: ctx.cwd, encoding: "utf-8" }
      ).trim();

      const output = execSync(
        `bash "${repoRoot}/memory-bank/scripts/check-reflect-trigger.sh"`,
        { encoding: "utf-8", timeout: 5000 }
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
