/**
 * .opencode/plugins/runtime-bridge.js — Memora runtime bridge for OpenCode
 *
 * ESM server-side plugin that wires OpenCode lifecycle events to the shared
 * Memora runtime bridge (lib/runtime/bridge/opencode.js).
 *
 * Uses createRequire to import the CJS bridge module from an ES module context.
 *
 * FR coverage:
 *   FR-401 — session.created   → handleSessionCreated (runtime bootstrap)
 *   FR-402 — chat.message      → handleChatMessage    (pre-turn recall)
 *   FR-403 — session.deleted   → handleSessionDeleted (true close)
 *   FR-404 — tool.execute.before/after, experimental.session.compacting,
 *             session.status (primary), session.idle (legacy backward-compat)
 */

import { createRequire }   from 'module';
import { fileURLToPath }   from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const _require   = createRequire(import.meta.url);

// CJS bridge adapter — all business logic lives here for testability.
const bridge = _require(resolve(__dirname, '../../lib/runtime/bridge/opencode.js'));

// ── Plugin entrypoint ──────────────────────────────────────────────────────────

export const MemoraRuntimePlugin = async (input) => {
  // Capture project directory once; passed to session bootstrap.
  const projectDir = input.worktree || input.directory || process.cwd();

  return {

    // ── FR-401 / FR-403 / FR-404: session lifecycle events ──────────────────

    event: async ({ event }) => {
      switch (event.type) {
        case 'session.created':
          // FR-401: runtime bootstrap — init transcript session, provider registry.
          bridge.handleSessionCreated(event, { projectDir });
          break;

        case 'session.deleted':
          // FR-403: true close — onSessionEnd + shutdownAll.
          // Must use session.deleted, NOT session.idle as sole finalizer.
          bridge.handleSessionDeleted(event);
          break;

        case 'session.status':
          // FR-404: primary checkpoint event (session.status.type: idle|busy).
          bridge.handleSessionStatus(event);
          break;

        case 'session.idle':
          // FR-404: deprecated legacy event — backward-compat observability only.
          bridge.handleSessionStatus(event);
          break;

        default:
          break;
      }
    },

    // ── FR-402: pre-turn recall ────────────────────────────────────────────────

    'chat.message': async (hookInput, output) => {
      const additionalContext = bridge.handleChatMessage(hookInput, output);
      if (!additionalContext) return;

      // Prepend recall context as a text part visible to the model.
      if (!Array.isArray(output.parts)) {
        output.parts = [];
      }
      output.parts.unshift({ type: 'text', text: additionalContext });
    },

    // ── FR-404: canonical write screening (pre-tool) ──────────────────────────

    'tool.execute.before': async (hookInput, output) => {
      // Throws Error if write is blocked — OpenCode treats this as tool failure.
      bridge.handleToolExecuteBefore(hookInput, output);
    },

    // ── FR-404: canonical write observation (post-tool) ───────────────────────

    'tool.execute.after': async (hookInput, output) => {
      // Observes apply_patch calls touching memory-bank/ paths.
      bridge.handleToolExecuteAfter(hookInput, output);
    },

    // ── FR-404: compaction context injection ──────────────────────────────────

    'experimental.session.compacting': async (hookInput, output) => {
      // Injects Memora runtime context string into output.context[].
      bridge.handleSessionCompacting(hookInput, output);
    },

  };
};
