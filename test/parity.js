#!/usr/bin/env node
/**
 * test/parity.js — Automated parity verification for Memora adapter layer.
 *
 * Reads parity-baseline.json and verifies that all adapter files, hook configs,
 * and guardrail files declared in the baseline actually exist on disk. Produces
 * structured failure messages identifying provider, capability, and mismatch type
 * so regressions are easy to diagnose in CI.
 *
 * Checks performed:
 *   check-workflow-files       — all 9 core workflow files exist per provider
 *   check-hook-config-files    — all hook config files exist per provider
 *   check-entry-contract       — provider entry files exist on disk
 *   check-guardrail-files      — hard-enforcement guardrail files exist
 *   check-hook-path-resolution — OpenCode plugins resolve script paths via repo root
 *
 * Related requirements: FR-001, FR-002, FR-005, FR-006, FR-009, FR-010, FR-013
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'parity-baseline.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the path exists relative to repoRoot. */
function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

/** Reads a file relative to repoRoot as UTF-8 string. */
function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

/** Structured assertion: fail with provider + capability + mismatch type. */
function assertFile(provider, capability, mismatchType, relativePath) {
  assert.ok(
    exists(relativePath),
    `[${mismatchType}] provider=${provider} capability=${capability} file missing: ${relativePath}`
  );
}

// ── Load baseline ─────────────────────────────────────────────────────────────

if (!fs.existsSync(baselinePath)) {
  process.stderr.write(
    'ERROR: parity-baseline.json not found.\n' +
    'This file is required for parity verification.\n' +
    'Ensure the feat/parity-baseline branch has been merged into this branch.\n'
  );
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

// ── Check 1: core workflow files ──────────────────────────────────────────────

function checkWorkflowFiles() {
  const surfaces = baseline.core_workflows.provider_surfaces;
  let failures = 0;

  for (const [provider, surface] of Object.entries(surfaces)) {
    for (const [workflow, filePath] of Object.entries(surface.files)) {
      try {
        assertFile(provider, workflow, 'check-workflow-files', filePath);
      } catch (err) {
        process.stderr.write(err.message + '\n');
        failures++;
      }
    }
  }

  assert.equal(
    failures, 0,
    `check-workflow-files: ${failures} workflow file(s) missing across providers`
  );
}

// ── Check 2: hook config files ────────────────────────────────────────────────

function checkHookConfigFiles() {
  const providerConfig = baseline.hooks.provider_config;
  let failures = 0;

  for (const [provider, config] of Object.entries(providerConfig)) {
    for (const hookFile of config.hook_files) {
      try {
        assertFile(provider, 'hooks', 'check-hook-config-files', hookFile);
      } catch (err) {
        process.stderr.write(err.message + '\n');
        failures++;
      }
    }
  }

  assert.equal(
    failures, 0,
    `check-hook-config-files: ${failures} hook config file(s) missing across providers`
  );
}

// ── Check 3: entry contract files ─────────────────────────────────────────────

function checkEntryContract() {
  const providerEntry = baseline.entry_contract.provider_entry;
  let failures = 0;

  for (const [provider, entry] of Object.entries(providerEntry)) {
    // For opencode the entry is a directory, check it exists
    const target = entry.file.endsWith('/') ? entry.file.slice(0, -1) : entry.file;
    try {
      assert.ok(
        exists(target),
        `[check-entry-contract] provider=${provider} entry file/dir missing: ${target}`
      );
    } catch (err) {
      process.stderr.write(err.message + '\n');
      failures++;
    }
  }

  // Also verify both canonical surfaces exist
  for (const surface of baseline.entry_contract.canonical_surfaces) {
    try {
      assert.ok(
        exists(surface),
        `[check-entry-contract] canonical surface missing: ${surface}`
      );
    } catch (err) {
      process.stderr.write(err.message + '\n');
      failures++;
    }
  }

  assert.equal(
    failures, 0,
    `check-entry-contract: ${failures} entry contract file(s) missing`
  );
}

// ── Check 4: guardrail files ──────────────────────────────────────────────────

function checkGuardrailFiles() {
  const enforcement = baseline.guardrails.provider_enforcement;
  let failures = 0;

  for (const [provider, config] of Object.entries(enforcement)) {
    if (config.level === 'hard' || config.level === 'partial') {
      for (const guardrailFile of config.files) {
        try {
          assertFile(provider, 'guardrails', 'check-guardrail-files', guardrailFile);
        } catch (err) {
          process.stderr.write(err.message + '\n');
          failures++;
        }
      }
    }
  }

  assert.equal(
    failures, 0,
    `check-guardrail-files: ${failures} guardrail file(s) missing for hard/partial providers`
  );
}

// ── Check 5: OpenCode hook path resolution ────────────────────────────────────
//
// Verifies that OpenCode plugins resolve script paths via `git rev-parse
// --show-toplevel` rather than using ctx.cwd with a relative path.
// This prevents the runtime gap described in FR-006.

function checkHookPathResolution() {
  const opencode = baseline.hooks.provider_config.opencode;
  let failures = 0;

  for (const pluginFile of opencode.hook_files) {
    const content = readFile(pluginFile);

    // Must contain repo-root resolution
    const hasRepoRootResolution = content.includes('rev-parse') && content.includes('--show-toplevel');
    try {
      assert.ok(
        hasRepoRootResolution,
        `[check-hook-path-resolution] provider=opencode file=${pluginFile}: ` +
        'missing "git rev-parse --show-toplevel" repo-root resolution'
      );
    } catch (err) {
      process.stderr.write(err.message + '\n');
      failures++;
    }

    // Must NOT use bare relative path with cwd: ctx.cwd
    const hasBareCwdRelativePath =
      /execSync\(\s*["'`]bash memory-bank\//.test(content) &&
      /cwd:\s*ctx\.cwd/.test(content);
    try {
      assert.ok(
        !hasBareCwdRelativePath,
        `[check-hook-path-resolution] provider=opencode file=${pluginFile}: ` +
        'still uses relative "bash memory-bank/..." with cwd: ctx.cwd — vulnerable to subdirectory execution'
      );
    } catch (err) {
      process.stderr.write(err.message + '\n');
      failures++;
    }
  }

  assert.equal(
    failures, 0,
    `check-hook-path-resolution: ${failures} path resolution issue(s) found in OpenCode plugins`
  );
}

// ── Check 6: workflow body drift ─────────────────────────────────────────────
//
// For each core workflow, extracts the body (content after the frontmatter
// closing ---) from every provider's file and compares them for equivalence.
// Provider-specific metadata (frontmatter fields like name, description, tools,
// model) is excluded from comparison. Only the semantic instruction body is
// checked.
//
// Skips files listed in baseline.documentation_surface.documented_exceptions
// that have area === "workflows" (e.g. memory-explorer agent vs skill).
//
// Related requirements: FR-003, FR-014

function extractBody(content) {
  // Strip the frontmatter block: everything between the first and second '---'
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterClosed = false;
  const bodyLines = [];

  for (const line of lines) {
    if (!inFrontmatter && !frontmatterClosed && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line.trim() === '---') {
      inFrontmatter = false;
      frontmatterClosed = true;
      continue;
    }
    if (frontmatterClosed) {
      bodyLines.push(line);
    }
  }

  // Normalize: trim trailing whitespace from each line, strip leading/trailing blank lines
  return bodyLines
    .map(l => l.trimEnd())
    .join('\n')
    .trim();
}

function checkWorkflowBodyDrift() {
  const surfaces = baseline.core_workflows.provider_surfaces;
  const exceptions = new Set(
    (baseline.documentation_surface.documented_exceptions || [])
      .filter(e => e.area === 'workflows')
      .map(e => e.id)
  );

  // Build a list of workflow→provider→body mappings
  const workflowBodies = {};

  for (const [provider, surface] of Object.entries(surfaces)) {
    for (const [workflow, filePath] of Object.entries(surface.files)) {
      if (!exists(filePath)) continue; // already caught by checkWorkflowFiles

      const content = readFile(filePath);
      const body = extractBody(content);

      if (!workflowBodies[workflow]) workflowBodies[workflow] = {};
      workflowBodies[workflow][provider] = { body, filePath };
    }
  }

  let failures = 0;

  for (const [workflow, providerMap] of Object.entries(workflowBodies)) {
    const providers = Object.keys(providerMap);
    if (providers.length < 2) continue;

    // Use the first provider as reference
    const [refProvider, ...restProviders] = providers;
    const refBody = providerMap[refProvider].body;

    for (const provider of restProviders) {
      const { body, filePath } = providerMap[provider];
      if (body === refBody) continue;

      // Check if this workflow+provider pair is a documented exception
      const isException = [...exceptions].some(id => {
        const exc = baseline.documentation_surface.documented_exceptions.find(e => e.id === id);
        return exc && exc.provider === provider && exc.area === 'workflows';
      });

      if (isException) continue;

      try {
        assert.equal(
          body, refBody,
          `[check-workflow-body-drift] workflow=${workflow} ` +
          `provider=${provider} (${filePath}) differs from ` +
          `provider=${refProvider} (${providerMap[refProvider].filePath})`
        );
      } catch (err) {
        // Show a compact diff hint
        const refLines = refBody.split('\n');
        const cmpLines = body.split('\n');
        const firstDiff = refLines.findIndex((l, i) => l !== cmpLines[i]);
        const hint = firstDiff >= 0
          ? `\n  first diff at body line ${firstDiff + 1}:\n` +
            `    ref:  ${JSON.stringify(refLines[firstDiff])}\n` +
            `    got:  ${JSON.stringify(cmpLines[firstDiff] ?? '<missing>')}`
          : '\n  (line counts differ)';
        process.stderr.write(err.message + hint + '\n');
        failures++;
      }
    }
  }

  assert.equal(
    failures, 0,
    `check-workflow-body-drift: ${failures} workflow body drift(s) detected`
  );
}

// ── Runner ────────────────────────────────────────────────────────────────────

function main() {
  checkWorkflowFiles();
  checkHookConfigFiles();
  checkEntryContract();
  checkGuardrailFiles();
  checkHookPathResolution();
  checkWorkflowBodyDrift();
  process.stdout.write('Parity checks passed.\n');
}

main();
