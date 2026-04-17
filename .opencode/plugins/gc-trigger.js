/**
 * gc-trigger.js — OpenCode plugin for deterministic garbage-collection checks.
 *
 * Updated to the current function-based OpenCode plugin API.
 * Advisory-only: logs shell check results instead of injecting model context.
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
      service: "memora-gc-trigger",
      level: "info",
      message: output,
    },
  });
}

export const GcTriggerPlugin = async ({ client, directory, worktree }) => {
  const cwd = worktree || directory || process.cwd();

  return {
    event: async ({ event }) => {
      if (!shouldRun(event)) return;

      try {
        const output = runCheck(cwd, "check-gc-trigger.sh");
        await logResult(client, output);
      } catch (err) {
        await client.app.log({
          body: {
            service: "memora-gc-trigger",
            level: "warn",
            message: "gc trigger check failed",
            extra: { error: err.message },
          },
        });
      }
    },
  };
};
