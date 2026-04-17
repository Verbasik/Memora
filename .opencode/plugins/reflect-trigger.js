/**
 * reflect-trigger.js — OpenCode plugin for deterministic reflection checks.
 *
 * Current OpenCode plugin API expects one or more exported plugin functions.
 * Older object-style plugins fail to load with "Plugin export is not a function".
 *
 * Advisory-only behavior:
 *   - react to session.idle and update-memory tool completion
 *   - run the shell threshold check
 *   - log the suggested action instead of trying to inject model context
 */

import { execFileSync } from "child_process";

function shouldRun(event) {
  const isSessionIdle = event.type === "session.idle";
  const isAfterUpdateMemory =
    event.type === "tool.execute.after" &&
    event.tool?.name?.includes("update-memory");

  return isSessionIdle || isAfterUpdateMemory;
}

function runCheck(cwd, scriptName) {
  const repoRoot = execFileSync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd, encoding: "utf-8" }
  ).trim();

  return execFileSync(
    "bash",
    [`${repoRoot}/memory-bank/scripts/${scriptName}`],
    { encoding: "utf-8", timeout: 5000 }
  ).trim();
}

async function logResult(client, output) {
  if (!output) return;
  await client.app.log({
    body: {
      service: "memora-reflect-trigger",
      level: "info",
      message: output,
    },
  });
}

export const ReflectTriggerPlugin = async ({ client, directory, worktree }) => {
  const cwd = worktree || directory || process.cwd();

  return {
    event: async ({ event }) => {
      if (!shouldRun(event)) return;

      try {
        const output = runCheck(cwd, "check-reflect-trigger.sh");
        await logResult(client, output);
      } catch (err) {
        await client.app.log({
          body: {
            service: "memora-reflect-trigger",
            level: "warn",
            message: "reflect trigger check failed",
            extra: { error: err.message },
          },
        });
      }
    },
  };
};
