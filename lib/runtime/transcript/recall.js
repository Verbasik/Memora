'use strict';

/**
 * lib/runtime/transcript/recall.js — Transcript recall pipeline for Memora
 *
 * Implements FR-011 (Recall summarization) from HERMES_RUNTIME_LAYER_TZ.md:
 *
 *   Phase 2 Step 2: search → format → truncate → fenced recall block
 *
 *   Pipeline:
 *     TranscriptStore.search(query)
 *       → formatConversation(messages)          // human-readable transcript text
 *       → truncateAroundMatches(text, query)     // smart window centred on matches
 *       → buildSessionBlock(session, text)       // header + excerpt per session
 *       → buildRecallBlock(assembled, metadata)  // canonical fenced block
 *
 * Design notes:
 *   - Zero external dependencies (Node.js >= 16 built-ins only).
 *   - No LLM summarization — Memora's zero-dep constraint means we return
 *     structured text excerpts rather than model-generated summaries.
 *     This is the "degraded mode" acknowledged in FR-011; a future optional
 *     summarizer can be composed on top of recallTranscripts() without
 *     changing this module's interface.
 *   - formatConversation() and truncateAroundMatches() are ports of Hermes
 *     _format_conversation() and _truncate_around_matches() adapted to
 *     Memora's MessageRecord schema and zero-regex-dependency style.
 *
 * Inspired by hermes-agent/tools/session_search_tool.py but adapted for:
 *   - Memora's MessageRecord (role/content/toolName/toolCalls fields)
 *   - Node.js built-ins only (no regex-based FTS, no asyncio)
 *   - Smaller per-session char budget (agent context, not LLM summarizer)
 */

const { buildRecallBlock } = require('../fenced-context');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max chars rendered per session before truncation (override via options.maxSessionChars). */
const DEFAULT_MAX_SESSION_CHARS = 40_000;

/** Max chars for tool message content before inline truncation. */
const TOOL_CONTENT_LIMIT = 500;

/** Separator rendered between session blocks in the assembled recall. */
const SESSION_SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

// ---------------------------------------------------------------------------
// formatConversation  (port of Hermes _format_conversation)
// ---------------------------------------------------------------------------

/**
 * Format an array of MessageRecords into a human-readable conversation transcript.
 *
 * Rendering rules (mirrors Hermes _format_conversation):
 *   - role:'tool'      → [TOOL:<toolName>]: <content>  (long content truncated)
 *   - role:'assistant' → [ASSISTANT]: [Called: name1, name2]  (if toolCalls present)
 *                        [ASSISTANT]: <content>               (if content present)
 *   - all others       → [<ROLE>]: <content>
 *
 * @param {import('./store').MessageRecord[]} messages
 * @returns {string}
 */
function formatConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const parts = [];

  for (const msg of messages) {
    const role    = (msg.role    || 'unknown').toUpperCase();
    const content = msg.content  || '';
    const toolName = msg.toolName || null;

    if (role === 'TOOL' && toolName) {
      // Truncate long tool outputs to keep the formatted text manageable
      let body = content;
      if (body.length > TOOL_CONTENT_LIMIT) {
        body = body.slice(0, 250) + '\n...[truncated]...\n' + body.slice(-250);
      }
      parts.push(`[TOOL:${toolName}]: ${body}`);

    } else if (role === 'ASSISTANT') {
      // Normalise toolCalls: may be a JSON string (as stored in MessageRecord) or Array
      let toolCalls = msg.toolCalls || null;
      if (typeof toolCalls === 'string') {
        try { toolCalls = JSON.parse(toolCalls); } catch (_) { toolCalls = null; }
      }

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const names = toolCalls.map(tc => {
          if (tc && typeof tc === 'object') {
            // Support both {name:...} and OpenAI {function:{name:...}} shapes
            return tc.name || (tc.function && tc.function.name) || '?';
          }
          return '?';
        });
        parts.push(`[ASSISTANT]: [Called: ${names.join(', ')}]`);
      }
      if (content) {
        parts.push(`[ASSISTANT]: ${content}`);
      }

    } else {
      parts.push(`[${role}]: ${content}`);
    }
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// truncateAroundMatches  (port of Hermes _truncate_around_matches)
// ---------------------------------------------------------------------------

/**
 * Truncate `fullText` to at most `maxChars`, choosing a window that maximises
 * coverage of positions where `query` actually appears.
 *
 * Strategy (in priority order, matching Hermes implementation):
 *   1. Full-phrase positions  — exact case-insensitive phrase in the text.
 *   2. Proximity co-occurrence — all query terms appear within 200 chars of
 *      the rarest-term position.
 *   3. Individual term positions — any occurrence of any query word.
 *
 * Window selection: for each candidate match position, compute a window
 * [pos - maxChars/4, pos + 3*maxChars/4] (25% before, 75% after bias) and
 * pick the window that covers the most match positions.
 *
 * @param {string} fullText
 * @param {string} query
 * @param {number} [maxChars]  — defaults to DEFAULT_MAX_SESSION_CHARS
 * @returns {string}
 */
function truncateAroundMatches(fullText, query, maxChars) {
  const limit = (typeof maxChars === 'number' && maxChars > 0)
    ? maxChars
    : DEFAULT_MAX_SESSION_CHARS;

  if (fullText.length <= limit) return fullText;

  const textLower  = fullText.toLowerCase();
  const queryLower = ((query || '').toLowerCase()).trim();

  let matchPositions = [];

  // ---  1. Full-phrase search  --------------------------------------------
  if (queryLower) {
    let idx = textLower.indexOf(queryLower, 0);
    while (idx !== -1) {
      matchPositions.push(idx);
      idx = textLower.indexOf(queryLower, idx + 1);
    }
  }

  // --- 2. Proximity co-occurrence (all terms within 200 chars) -----------
  if (matchPositions.length === 0) {
    const terms = queryLower.split(/\s+/).filter(Boolean);
    if (terms.length > 1) {
      // Build position lists for each term
      const termPositions = {};
      for (const t of terms) {
        termPositions[t] = [];
        let i = textLower.indexOf(t, 0);
        while (i !== -1) {
          termPositions[t].push(i);
          i = textLower.indexOf(t, i + 1);
        }
      }
      // Rarest term = shortest position list
      const rarest = terms.reduce((a, b) =>
        (termPositions[a] || []).length <= (termPositions[b] || []).length ? a : b
      );
      for (const pos of (termPositions[rarest] || [])) {
        const allNear = terms
          .filter(t => t !== rarest)
          .every(t =>
            (termPositions[t] || []).some(p => Math.abs(p - pos) < 200)
          );
        if (allNear) matchPositions.push(pos);
      }
    }
  }

  // --- 3. Individual term positions (last resort) -------------------------
  if (matchPositions.length === 0) {
    const terms = queryLower.split(/\s+/).filter(Boolean);
    for (const t of terms) {
      let i = textLower.indexOf(t, 0);
      while (i !== -1) {
        matchPositions.push(i);
        i = textLower.indexOf(t, i + 1);
      }
    }
  }

  // No matches at all — take from the start
  if (matchPositions.length === 0) {
    const truncated = fullText.slice(0, limit);
    const suffix = fullText.length > limit ? '\n\n...[later conversation truncated]...' : '';
    return truncated + suffix;
  }

  // --- Pick window that covers the most match positions ------------------
  matchPositions.sort((a, b) => a - b);

  let bestStart = 0;
  let bestCount = 0;
  for (const candidate of matchPositions) {
    // 25% before the candidate, 75% after
    let ws = Math.max(0, candidate - Math.floor(limit / 4));
    let we = ws + limit;
    if (we > fullText.length) {
      ws = Math.max(0, fullText.length - limit);
      we = fullText.length;
    }
    const count = matchPositions.filter(p => p >= ws && p < we).length;
    if (count > bestCount) {
      bestCount = count;
      bestStart = ws;
    }
  }

  const start = bestStart;
  const end   = Math.min(fullText.length, start + limit);

  const prefix   = start > 0   ? '...[earlier conversation truncated]...\n\n' : '';
  const suffix   = end < fullText.length ? '\n\n...[later conversation truncated]...' : '';
  return prefix + fullText.slice(start, end) + suffix;
}

// ---------------------------------------------------------------------------
// formatSessionHeader
// ---------------------------------------------------------------------------

/**
 * Format a one-line session header from a SessionRecord.
 *
 * Example: "Session: 20260416T143022-a3f1c9 | Source: claude | Started: 2026-04-16T14:30:22.000Z | Messages: 42"
 *
 * @param {import('./store').SessionRecord} session
 * @returns {string}
 */
function formatSessionHeader(session) {
  const parts = [`Session: ${session.sessionId || 'unknown'}`];
  if (session.source && session.source !== 'unknown') {
    parts.push(`Source: ${session.source}`);
  }
  if (session.startedAt) {
    parts.push(`Started: ${session.startedAt}`);
  }
  if (session.title) {
    parts.push(`Title: ${session.title}`);
  }
  if (session.messageCount != null) {
    parts.push(`Messages: ${session.messageCount}`);
  }
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// buildSessionBlock
// ---------------------------------------------------------------------------

/**
 * Format a single session result as a labelled block:
 *
 *   --- Session: ... | Source: ... | Started: ... ---
 *
 *   [USER]: ...
 *
 *   [ASSISTANT]: ...
 *
 * @param {import('./store').SessionRecord}   session
 * @param {import('./store').MessageRecord[]} messages
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.maxSessionChars]
 * @returns {string}
 */
function buildSessionBlock(session, messages, query, options) {
  const maxChars = (options && typeof options.maxSessionChars === 'number')
    ? options.maxSessionChars
    : DEFAULT_MAX_SESSION_CHARS;

  const header           = formatSessionHeader(session);
  const conversationText = formatConversation(messages);
  const excerpt          = truncateAroundMatches(conversationText, query, maxChars);

  return `--- ${header} ---\n\n${excerpt}`;
}

// ---------------------------------------------------------------------------
// recallTranscripts  — main public entry point
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RecallResult
 * @property {boolean} found         — true if at least one session matched
 * @property {string}  block         — canonical fenced recall block (empty if not found)
 * @property {number}  sessionCount  — number of sessions in the result
 * @property {string}  query         — the query that was used
 * @property {string}  diagnostics   — human-readable status message
 */

/**
 * Search the transcript store and return a canonical fenced recall block.
 *
 * Full pipeline:
 *   1. store.search(query, options)  — substring search across messages
 *   2. For each result: formatConversation → truncateAroundMatches → session block
 *   3. Assemble all session blocks separated by a visual divider
 *   4. Wrap in buildRecallBlock() with query provenance metadata
 *
 * Returns RecallResult with found=false and an empty block when:
 *   - query is empty/blank
 *   - no sessions match
 *   - the store throws (error surfaced in diagnostics, not re-thrown)
 *
 * @param {import('./store').TranscriptStore} store
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.maxSessions=5]       — passed to store.search
 * @param {string} [options.source]              — filter by toolchain source
 * @param {number} [options.maxSessionChars]     — per-session char limit for truncation
 * @returns {RecallResult}
 */
function recallTranscripts(store, query, options) {
  const opts = options || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return {
      found:        false,
      block:        '',
      sessionCount: 0,
      query:        query || '',
      diagnostics:  'Empty query — no search performed.',
    };
  }

  const trimmedQuery = query.trim();

  // --- Search ---------------------------------------------------------------
  let results;
  try {
    results = store.search(trimmedQuery, {
      maxSessions: typeof opts.maxSessions === 'number' ? opts.maxSessions : 5,
      source:      opts.source || undefined,
    });
  } catch (err) {
    return {
      found:        false,
      block:        '',
      sessionCount: 0,
      query:        trimmedQuery,
      diagnostics:  `Transcript search failed: ${err.message}`,
    };
  }

  if (!results || results.length === 0) {
    return {
      found:        false,
      block:        '',
      sessionCount: 0,
      query:        trimmedQuery,
      diagnostics:  `No sessions found matching "${trimmedQuery}".`,
    };
  }

  // --- Format ---------------------------------------------------------------
  const sessionBlocks = results.map(({ session, messages }) =>
    buildSessionBlock(session, messages, trimmedQuery, opts)
  );
  const assembled = sessionBlocks.join(SESSION_SEPARATOR);

  // --- Wrap in fenced recall block ------------------------------------------
  const block = buildRecallBlock(assembled, {
    query:     trimmedQuery,
    source:    'transcript-store',
    createdAt: new Date().toISOString(),
    note:      `${results.length} session(s) matched — structured excerpt, no LLM summarization`,
  });

  return {
    found:        true,
    block,
    sessionCount: results.length,
    query:        trimmedQuery,
    diagnostics:  `Recalled ${results.length} session(s) matching "${trimmedQuery}" (structured excerpt mode — no LLM summarization).`,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  formatConversation,
  truncateAroundMatches,
  formatSessionHeader,
  buildSessionBlock,
  recallTranscripts,
};
