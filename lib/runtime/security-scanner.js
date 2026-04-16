'use strict';

/**
 * security-scanner.js — Runtime security screening for Memora
 *
 * Provides two scanning functions:
 *   - scanMemoryContent(content)       — for memory writes (prompt-adjacent)
 *   - scanContextContent(content, filename) — for injected context files
 *
 * Inspired by Hermes memory_tool.py and prompt_builder.py security patterns.
 * Returns a ScanResult: { blocked: boolean, patternId: string|null, reason: string|null }
 *
 * Design principles (from ТЗ FR-004, FR-005):
 *   - Blocking is the default on match; caller decides how to surface the reason.
 *   - Benign UTF-8 content (Cyrillic, CJK, accented Latin) MUST pass through.
 *   - Invisible Unicode detection MUST NOT produce false positives on normal text.
 *   - Security failures block dangerous writes/injections (not degrade silently).
 */

// ---------------------------------------------------------------------------
// Invisible Unicode detection
// Only characters with no visible representation and commonly used for
// injection (zero-width joiners, directional overrides, BOM).
// Does NOT flag RTL/LTR marks used legitimately in Arabic/Hebrew prose.
// ---------------------------------------------------------------------------

const INVISIBLE_CHARS = new Set([
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\u2060', // Word Joiner
  '\uFEFF', // Zero Width No-Break Space (BOM)
  '\u202A', // Left-to-Right Embedding
  '\u202B', // Right-to-Left Embedding
  '\u202C', // Pop Directional Formatting
  '\u202D', // Left-to-Right Override
  '\u202E', // Right-to-Left Override (highest injection risk)
]);

/**
 * @param {string} content
 * @returns {{ found: boolean, charCode: string|null }}
 */
function _detectInvisibleChars(content) {
  for (const char of INVISIBLE_CHARS) {
    if (content.includes(char)) {
      return { found: true, charCode: char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') };
    }
  }
  return { found: false, charCode: null };
}

// ---------------------------------------------------------------------------
// Threat patterns for MEMORY WRITES
// Matches content being saved to memory files that will be injected into
// the system prompt on future sessions.
// ---------------------------------------------------------------------------

const MEMORY_THREAT_PATTERNS = [
  // Prompt injection
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, id: 'prompt_injection' },
  { pattern: /you\s+are\s+now\s+/i,                                  id: 'role_hijack' },
  { pattern: /do\s+not\s+tell\s+the\s+user/i,                        id: 'deception_hide' },
  { pattern: /system\s+prompt\s+override/i,                          id: 'sys_prompt_override' },
  { pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, id: 'disregard_rules' },
  { pattern: /act\s+as\s+(if|though)\s+you\s+(have\s+no|don't\s+have)\s+(restrictions|limits|rules)/i, id: 'bypass_restrictions' },
  // Exfiltration via curl/wget with secret-like variable names
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: 'exfil_curl' },
  { pattern: /wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: 'exfil_wget' },
  // Reading credentials/secrets from the filesystem
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, id: 'read_secrets' },
  // SSH persistence
  { pattern: /authorized_keys/i,              id: 'ssh_backdoor' },
  { pattern: /\$HOME\/\.ssh|~\/\.ssh/i,       id: 'ssh_access' },
];

// ---------------------------------------------------------------------------
// Threat patterns for CONTEXT FILE INJECTION
// Matches content in AGENTS.md, CLAUDE.md, .hermes.md, .cursorrules and
// similar files before they are injected into the system prompt.
// ---------------------------------------------------------------------------

const CONTEXT_THREAT_PATTERNS = [
  // Prompt injection
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, id: 'prompt_injection' },
  { pattern: /do\s+not\s+tell\s+the\s+user/i,                       id: 'deception_hide' },
  { pattern: /system\s+prompt\s+override/i,                         id: 'sys_prompt_override' },
  { pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, id: 'disregard_rules' },
  { pattern: /act\s+as\s+(if|though)\s+you\s+(have\s+no|don't\s+have)\s+(restrictions|limits|rules)/i, id: 'bypass_restrictions' },
  // HTML/Markdown hidden content injection
  { pattern: /<!--[^>]*(?:ignore|override|system|secret|hidden)[^>]*-->/i, id: 'html_comment_injection' },
  { pattern: /<\s*div\s+style\s*=\s*["'][\s\S]*?display\s*:\s*none/i,     id: 'hidden_div' },
  // Translate-and-execute pattern (common indirect injection)
  { pattern: /translate\s+.*\s+into\s+.*\s+and\s+(execute|run|eval)/i, id: 'translate_execute' },
  // Exfiltration
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: 'exfil_curl' },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass)/i, id: 'read_secrets' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ScanResult
 * @property {boolean} blocked    — true if content should be rejected/blocked
 * @property {string|null} patternId — identifier of the matched pattern, or null
 * @property {string|null} reason  — human-readable block reason, or null if clean
 */

/**
 * Scan content intended for a MEMORY WRITE.
 * Called before persisting any content to memory files that will be injected
 * into the system prompt on future sessions.
 *
 * @param {string} content
 * @returns {ScanResult}
 */
function scanMemoryContent(content) {
  if (typeof content !== 'string') {
    return { blocked: false, patternId: null, reason: null };
  }

  // Invisible Unicode check
  const inv = _detectInvisibleChars(content);
  if (inv.found) {
    return {
      blocked: true,
      patternId: 'invisible_unicode',
      reason: `Blocked: content contains invisible Unicode character U+${inv.charCode} (possible injection attempt). Memory entries are injected into the system prompt and must not contain injection payloads.`,
    };
  }

  // Threat pattern check
  for (const { pattern, id } of MEMORY_THREAT_PATTERNS) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        patternId: id,
        reason: `Blocked: content matches threat pattern '${id}'. Memory entries are injected into the system prompt and must not contain injection or exfiltration payloads.`,
      };
    }
  }

  return { blocked: false, patternId: null, reason: null };
}

/**
 * Scan content from a CONTEXT FILE before it is injected into the prompt.
 * Called for AGENTS.md, CLAUDE.md, .hermes.md, .cursorrules and similar files.
 *
 * Unlike scanMemoryContent, this returns a sanitized string on block
 * rather than just a boolean — callers can inject the sanitized placeholder
 * instead of the original content (matches Hermes prompt_builder behaviour).
 *
 * @param {string} content    — raw file content
 * @param {string} filename   — filename for diagnostic messages
 * @returns {{ blocked: boolean, patternId: string|null, reason: string|null, sanitized: string }}
 */
function scanContextContent(content, filename) {
  if (typeof content !== 'string') {
    return { blocked: false, patternId: null, reason: null, sanitized: content };
  }

  const findings = [];

  // Invisible Unicode check
  for (const char of INVISIBLE_CHARS) {
    if (content.includes(char)) {
      const code = char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      findings.push(`invisible_unicode_U+${code}`);
    }
  }

  // Threat pattern check
  for (const { pattern, id } of CONTEXT_THREAT_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(id);
    }
  }

  if (findings.length > 0) {
    const joined = findings.join(', ');
    const sanitized = `[BLOCKED: ${filename} contained potential prompt injection (${joined}). Content not loaded.]`;
    return {
      blocked: true,
      patternId: findings[0],
      reason: `Context file '${filename}' blocked: ${joined}`,
      sanitized,
    };
  }

  return { blocked: false, patternId: null, reason: null, sanitized: content };
}

module.exports = { scanMemoryContent, scanContextContent };
