'use strict';

/**
 * lib/runtime/hook-logger.js — shared diagnostic logger for Memora hook entrypoints.
 *
 * Writes each log line to TWO destinations:
 *   1. process.stderr   — captured by the toolchain (Claude Code shows in UI;
 *                         Codex shows in terminal when hooks are enabled)
 *   2. MEMORA_LOG_FILE  — a plain text file the user can `tail -f` in any terminal
 *
 * Usage:
 *   const { log, debug, VERBOSE } = require('../../lib/runtime/hook-logger');
 *   log('SessionStart', 'session=abc files=2 injected=1234chars');
 *   debug('PreToolUse', '✓ allowed write — memory-bank/.local/CURRENT.md');
 *
 * Environment variables:
 *   MEMORA_VERBOSE=1      — enables debug() output (default: off)
 *   MEMORA_LOG_FILE=path  — path to log file (default: /tmp/memora-hooks.log)
 */

const fs   = require('fs');

const VERBOSE  = process.env.MEMORA_VERBOSE === '1';
// Use a fixed path so `tail -f /tmp/memora-hooks.log` always works.
// os.tmpdir() on macOS returns /var/folders/…/T/ — not /tmp — which is confusing.
const LOG_FILE = process.env.MEMORA_LOG_FILE || '/tmp/memora-hooks.log';

/**
 * Always-on log. Use for significant events: session start/end, blocks, recalls.
 */
function log(hook, msg) {
  const line = `[memora:${hook}] ${msg}`;
  process.stderr.write(line + '\n');
  _appendToFile(line);
}

/**
 * Verbose-only log. Use for high-frequency events: every tool pass, every Bash allow.
 */
function debug(hook, msg) {
  if (VERBOSE) log(hook, msg);
}

function _appendToFile(line) {
  try {
    // ISO timestamp trimmed to seconds for readability
    const ts = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    fs.appendFileSync(LOG_FILE, `${ts} ${line}\n`, 'utf8');
  } catch (_) {
    // Log-file write failure must never break hook execution.
  }
}

module.exports = { log, debug, VERBOSE, LOG_FILE };
