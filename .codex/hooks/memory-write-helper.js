#!/usr/bin/env node
'use strict';

/**
 * memory-write-helper.js — explicit canonical write gate for Codex CLI
 *
 * Codex PreToolUse/PostToolUse hooks are Bash-oriented and do not intercept
 * file edits universally. This module provides an explicit helper that skills
 * and scripts must call before writing to any canonical memory path.
 *
 * Usage (from a Codex skill or script):
 *   const { writeCanonicalFile } = require('./.codex/hooks/memory-write-helper');
 *   writeCanonicalFile('memory-bank/.local/CURRENT.md', content);
 */

const { writeCanonicalFile } = require('../../lib/runtime/bridge/codex');

module.exports = { writeCanonicalFile };
