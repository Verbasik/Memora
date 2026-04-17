/**
 * .opencode/plugins/runtime-bridge.js — Memora runtime bridge for OpenCode
 *
 * OpenCode plugins run inside Bun, while the shared Memora runtime is CommonJS
 * and imports cleanly under Node. Live OpenCode sessions exposed unstable Bun
 * interop for `lib/runtime/*`, so this plugin calls a tiny Node runner instead
 * of importing the runtime directly.
 *
 * FR coverage:
 *   FR-401 — session.created   → bootstrapSession
 *   FR-402 — chat.message      → prepareTurn + recall injection
 *   FR-403 — session.deleted   → close transcript + provider shutdown
 *   FR-404 — tool.execute.before/after, session.status, session.idle,
 *             experimental.session.compacting
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RUNNER_PATH = resolve(__dirname, './runtime-bridge-runner.cjs');
const LOG_FILE = process.env.MEMORA_LOG_FILE || '/tmp/memora-hooks.log';
const VERBOSE = process.env.MEMORA_VERBOSE === '1';

const DEFAULT_STARTUP_FILES = [
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
];

const CANONICAL_MEMORY_RE =
  /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/;

function resolveExistingFiles(projectDir, relativePaths) {
  return relativePaths
    .map((relativePath) => path.join(projectDir, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));
}

function extractMessageText(output) {
  if (!output || !output.message) return '';

  const content = output.message.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join(' ');
  }

  return '';
}

function injectAdditionalContext(output, additionalContext) {
  if (!additionalContext) return;

  if (!Array.isArray(output.parts)) {
    output.parts = [];
  }

  output.parts.unshift({ type: 'text', text: additionalContext });
}

function getEventSessionId(event) {
  return (
    event?.properties?.sessionID ||
    event?.properties?.sessionId ||
    event?.properties?.info?.sessionID ||
    event?.properties?.info?.sessionId ||
    event?.properties?.info?.id ||
    event?.sessionID ||
    event?.sessionId ||
    null
  );
}

function getEventStatusType(event) {
  const status = event?.properties?.status;
  if (typeof status === 'string') return status;
  return status?.type || event?.properties?.info?.status?.type || null;
}

async function logHook(client, hook, msg, level = 'info') {
  const line = `[memora:${hook}] ${msg}`;

  try {
    process.stderr.write(line + '\n');
  } catch (_) {
    // best effort only
  }

  try {
    const ts = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    fs.appendFileSync(LOG_FILE, `${ts} ${line}\n`, 'utf8');
  } catch (_) {
    // best effort only
  }

  try {
    await client.app.log({
      body: {
        service: 'memora-opencode',
        level,
        message: line,
      },
    });
  } catch (_) {
    // plugin diagnostics must never break runtime flow
  }
}

async function debugHook(client, hook, msg) {
  if (!VERBOSE) return;
  await logHook(client, hook, msg, 'debug');
}

function callRunner(action, payload, projectDir) {
  const proc = spawnSync('node', [RUNNER_PATH, action], {
    cwd: projectDir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  const stdout = (proc.stdout || '').trim();
  const stderr = (proc.stderr || '').trim();

  let result = null;
  if (stdout) {
    try {
      result = JSON.parse(stdout);
    } catch (error) {
      throw new Error(
        `Memora runner returned invalid JSON for ${action}: ${error.message}\n${stdout}`
      );
    }
  }

  if (proc.status !== 0 || result?.ok === false) {
    const message =
      result?.error?.message ||
      stderr ||
      stdout ||
      `Memora runner failed for ${action} (exit=${proc.status})`;
    const error = new Error(message);
    error.runner = { action, exitCode: proc.status, stdout, stderr, result };
    throw error;
  }

  return result || { ok: true };
}

export const MemoraRuntimePlugin = async (input) => {
  const client = input.client;
  const projectDir = input.worktree || input.directory || process.cwd();
  const bootstrappedSessions = new Set();

  await logHook(client, 'PluginInit', `opencode plugin initialized — projectDir=${projectDir}`);

  const ensureSessionBootstrapped = async (sessionId, source) => {
    if (!sessionId) return;
    if (bootstrappedSessions.has(sessionId)) return;

    const startupFiles = resolveExistingFiles(projectDir, DEFAULT_STARTUP_FILES);
    const result = callRunner(
      'session.created',
      {
        projectDir,
        event: {
          type: 'session.created',
          properties: { sessionID: sessionId },
        },
      },
      projectDir
    );

    bootstrappedSessions.add(sessionId);
    await logHook(
      client,
      'SessionStart',
      `opencode session=${sessionId} files=${startupFiles.length} injected=${(result.result?.additionalContext || '').length}chars source=${source}`
    );
  };

  const handleSessionDeleted = async (event) => {
    const sessionId = getEventSessionId(event);

    callRunner(
      'session.deleted',
      {
        projectDir,
        event: {
          type: 'session.deleted',
          properties: { sessionID: sessionId },
        },
      },
      projectDir
    );

    await logHook(client, 'SessionEnd', `opencode session=${sessionId || 'unknown'} finalized`);
  };

  const handleSessionStatus = async (event) => {
    if (getEventStatusType(event) !== 'idle') return;
    await logHook(
      client,
      'Stop',
      `opencode checkpoint — session=${getEventSessionId(event) || 'unknown'} status=idle`
    );
  };

  const handleSessionIdle = async (event) => {
    await logHook(
      client,
      'Stop',
      `opencode checkpoint — session=${getEventSessionId(event) || 'unknown'} event=session.idle`
    );
  };

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case 'session.created':
          await ensureSessionBootstrapped(getEventSessionId(event), 'session.created');
          return;

        case 'session.deleted':
          await handleSessionDeleted(event);
          return;

        case 'session.status':
          await handleSessionStatus(event);
          return;

        case 'session.idle':
          await handleSessionIdle(event);
          return;

        default:
          return;
      }
    },

    'chat.message': async (hookInput, output) => {
      const sessionId = hookInput?.sessionID || null;
      await ensureSessionBootstrapped(sessionId, 'chat.message');

      const text = extractMessageText(output);
      if (!text) {
        await debugHook(client, 'UserPromptSubmit', 'opencode recall empty — no user text');
        return;
      }

      const result = callRunner(
        'chat.message',
        {
          projectDir,
          input: { ...hookInput, sessionID: sessionId },
          output: { message: output.message },
        },
        projectDir
      );

      const additionalContext = result.additionalContext || '';
      injectAdditionalContext(output, additionalContext);

      if (additionalContext) {
        await logHook(client, 'UserPromptSubmit', `opencode recall=${additionalContext.length}chars injected`);
      } else {
        await debugHook(client, 'UserPromptSubmit', 'opencode recall empty — no history yet');
      }
    },

    'chat.params': async (hookInput) => {
      const sessionId = hookInput?.sessionID || null;
      await ensureSessionBootstrapped(sessionId, 'chat.params');
      await logHook(
        client,
        'UserPromptSubmit',
        `opencode prompt start — session=${sessionId || 'unknown'} agent=${hookInput?.agent || 'unknown'}`
      );
    },

    'tool.execute.before': async (hookInput, output) => {
      const args = output?.args || {};
      const filePath = args.filePath || args.path || '';

      if (!CANONICAL_MEMORY_RE.test(filePath)) return;

      try {
        callRunner(
          'tool.execute.before',
          {
            projectDir,
            input: hookInput || {},
            output: { args },
          },
          projectDir
        );
      } catch (error) {
        await logHook(
          client,
          'PreToolUse',
          `✗ BLOCKED opencode tool=${(hookInput && hookInput.tool) || 'tool'} path=${filePath}`
        );
        throw error;
      }
    },

    'tool.execute.after': async (hookInput, output) => {
      const patchText = hookInput?.args?.patchText || '';
      if (!patchText || !CANONICAL_MEMORY_RE.test(patchText)) return;

      callRunner(
        'tool.execute.after',
        {
          projectDir,
          input: hookInput || {},
          output: output || {},
        },
        projectDir
      );

      await logHook(client, 'PostToolUse', '✓ canonical write observed via opencode apply_patch');
    },

    'experimental.session.compacting': async (hookInput, output) => {
      const result = callRunner(
        'experimental.session.compacting',
        {
          projectDir,
          input: hookInput || {},
          output: {
            context: Array.isArray(output?.context) ? [...output.context] : [],
            prompt: output?.prompt || '',
          },
        },
        projectDir
      );

      if (Array.isArray(result.output?.context)) {
        output.context = result.output.context;
      }
    },
  };
};
