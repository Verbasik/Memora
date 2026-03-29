#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const node = process.execPath;
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'scaffold.manifest.json'), 'utf8')
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options
  });

  if (result.status !== 0) {
    const details = [
      `Command failed: ${command} ${args.join(' ')}`,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`
    ].filter(Boolean);
    throw new Error(details.join('\n\n'));
  }

  return result;
}

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options
  });
}

function makeProjectDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(projectRoot) {
  run('git', ['init', '-q'], { cwd: projectRoot });
}

function assertExists(projectRoot, relativePath) {
  assert.ok(
    fs.existsSync(path.join(projectRoot, relativePath)),
    `Expected scaffold entry to exist: ${relativePath}`
  );
}

function assertMissing(projectRoot, relativePath) {
  assert.ok(
    !fs.existsSync(path.join(projectRoot, relativePath)),
    `Expected optional scaffold entry to be absent: ${relativePath}`
  );
}

function assertExecutable(projectRoot, relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  const mode = fs.statSync(fullPath).mode;
  assert.ok((mode & 0o111) !== 0, `Expected executable file: ${relativePath}`);
}

function runValidate(projectRoot) {
  run(node, ['bin/memora.js', 'validate', projectRoot], { cwd: repoRoot });
}

function runValidateJson(projectRoot, extraArgs = [], expectedStatus = 0) {
  const result = runResult(node, ['bin/memora.js', 'validate', projectRoot, '--format', 'json', ...extraArgs], {
    cwd: repoRoot
  });

  assert.equal(
    result.status,
    expectedStatus,
    `Unexpected validate exit code ${result.status}. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return JSON.parse(result.stdout);
}

function runDoctor(projectRoot) {
  const result = run(node, ['bin/memora.js', 'doctor', projectRoot, '--format', 'json'], {
    cwd: repoRoot
  });
  const report = JSON.parse(result.stdout);
  assert.equal(report.errors.length, 0, `Doctor reported errors: ${JSON.stringify(report.errors, null, 2)}`);
  return report;
}

function assertDefaultEntries(projectRoot) {
  for (const entry of manifest.defaultEntries) {
    assertExists(projectRoot, entry.target);
  }
}

function assertOptionalEntries(projectRoot, expected) {
  for (const entry of manifest.optionalEntries.assets || []) {
    if (expected.assets) {
      assertExists(projectRoot, entry.target);
    } else {
      assertMissing(projectRoot, entry.target);
    }
  }

  for (const entry of manifest.optionalEntries.services || []) {
    if (expected.services) {
      assertExists(projectRoot, entry.target);
    } else {
      assertMissing(projectRoot, entry.target);
    }
  }
}

function assertGitHooks(projectRoot) {
  const hooksPath = run('git', ['config', '--get', 'core.hooksPath'], { cwd: projectRoot }).stdout.trim();
  assert.equal(hooksPath, '.githooks', 'Expected git hooks path to be .githooks');
  assertExecutable(projectRoot, '.githooks/pre-commit');
}

function assertQwenEntry(projectRoot) {
  const settings = JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.qwen/settings.json'), 'utf8')
  );
  assert.deepEqual(settings.context.fileName, ['AGENTS.md']);
}

function assertValidationProfiles(projectRoot) {
  const extendedReport = runValidateJson(projectRoot, ['--profile', 'extended']);
  assert.equal(extendedReport.profile, 'extended');
  assert.equal(extendedReport.errors.length, 0, 'Extended profile should stay non-blocking on fresh scaffold');

  const governanceReport = runValidateJson(projectRoot, ['--profile', 'governance'], 1);
  assert.equal(governanceReport.profile, 'governance');
  assert.ok(governanceReport.errors.length > 0, 'Governance profile should flag unresolved scaffold placeholders');
}

function runInitScenario({ includeAssets, includeServices }) {
  const projectRoot = makeProjectDir('memora-init-');
  initGitRepo(projectRoot);

  const args = ['bin/memora.js', 'init', projectRoot];
  if (includeAssets) args.push('--include-assets');
  if (includeServices) args.push('--include-services');

  run(node, args, { cwd: repoRoot });

  assertDefaultEntries(projectRoot);
  assertOptionalEntries(projectRoot, {
    assets: includeAssets,
    services: includeServices
  });
  assertGitHooks(projectRoot);
  assertQwenEntry(projectRoot);
  runValidate(projectRoot);
  assertValidationProfiles(projectRoot);
  runDoctor(projectRoot);
}

function runPostinstallScenario() {
  const projectRoot = makeProjectDir('memora-postinstall-');
  initGitRepo(projectRoot);

  run(node, ['bin/postinstall.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      INIT_CWD: projectRoot
    }
  });

  assertDefaultEntries(projectRoot);
  assertOptionalEntries(projectRoot, { assets: false, services: false });
  assertGitHooks(projectRoot);
  assertQwenEntry(projectRoot);
  runValidate(projectRoot);
  assertValidationProfiles(projectRoot);
  runDoctor(projectRoot);
}

function runSchemaContractScenario() {
  const projectRoot = makeProjectDir('memora-contract-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });

  const invalidFact = `---
title: "Runtime Fact"
id: "fact-runtime-contract"
type: "FACT"
version: "1.0.0"
authority: "controlled"
status: "active"
owner: "validator"
created_at: "2026-03-29"
pii_risk: "none"
ttl: null
tags: []
confidence: "observed"
last_verified: "2026-03-29"
---

# Runtime Fact

This fact intentionally omits provenance to exercise schema-driven validation.
`;

  fs.mkdirSync(path.join(projectRoot, 'memory-bank/FACTS'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'memory-bank/FACTS/runtime-contract.md'), invalidFact);

  const report = runValidateJson(projectRoot, [], 1);
  assert.ok(
    report.errors.some((entry) => entry.file === 'memory-bank/FACTS/runtime-contract.md' && entry.message.includes('"provenance"')),
    `Expected schema-driven error for missing provenance. Actual errors: ${JSON.stringify(report.errors, null, 2)}`
  );
}

function main() {
  runInitScenario({ includeAssets: false, includeServices: false });
  runInitScenario({ includeAssets: true, includeServices: true });
  runPostinstallScenario();
  runSchemaContractScenario();
  process.stdout.write('Smoke tests passed.\n');
}

main();
