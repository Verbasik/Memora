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
const { extractFrontMatter } = require('../lib/validate');

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
version: "0.1.0"
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

function runMissingLocalSessionScenario() {
  const projectRoot = makeProjectDir('memora-no-local-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });

  fs.rmSync(path.join(projectRoot, 'memory-bank/.local'), { recursive: true, force: true });

  const report = runValidateJson(projectRoot, ['--profile', 'core']);
  assert.equal(report.errors.length, 0, `Core profile should tolerate missing local session files. Actual errors: ${JSON.stringify(report.errors, null, 2)}`);
  assert.ok(
    !report.errors.some((entry) => entry.message.includes('.local/CURRENT.md') || entry.message.includes('.local/HANDOFF.md')),
    `Local session references should not be treated as broken links. Actual errors: ${JSON.stringify(report.errors, null, 2)}`
  );
}

// ── Step 9: YAML / frontmatter parser edge cases ──────────────────────────────

function runFrontmatterEdgeCasesScenario() {
  // quoted # inside value must NOT be treated as inline comment
  {
    const fm = extractFrontMatter('---\ntitle: "Section # not a comment"\n---\n');
    assert.strictEqual(
      fm.title, 'Section # not a comment',
      'Quoted # inside string value must not be stripped'
    );
  }

  // inline comment after unquoted scalar must be stripped
  {
    const fm = extractFrontMatter('---\nversion: 1 # inline comment\n---\n');
    assert.strictEqual(fm.version, 1, 'Inline # comment after scalar must be stripped');
  }

  // inline array with quoted comma must not split item at comma
  {
    const fm = extractFrontMatter('---\ntags: ["tag,one", "tag two"]\n---\n');
    assert.deepStrictEqual(
      fm.tags, ['tag,one', 'tag two'],
      'Quoted comma in inline array must not split item'
    );
  }

  // nested object for provenance must parse as object with sub-keys
  {
    const fm = extractFrontMatter(
      '---\nprovenance:\n  source: git-log\n  date: "2026-01-01"\n---\n'
    );
    assert.strictEqual(typeof fm.provenance, 'object', 'Nested object must parse as object');
    assert.strictEqual(fm.provenance.source, 'git-log', 'Nested key source must parse');
    assert.strictEqual(fm.provenance.date, '2026-01-01', 'Nested key date must parse');
  }

  // optional .local references do not produce broken-link errors in memory scope
  {
    const projectRoot = makeProjectDir('memora-local-refs-');
    initGitRepo(projectRoot);
    run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });
    fs.rmSync(path.join(projectRoot, 'memory-bank/.local'), { recursive: true, force: true });

    const report = runValidateJson(projectRoot, ['--scope', 'memory', '--profile', 'core']);
    assert.equal(
      report.errors.length, 0,
      `--scope memory must not produce errors for missing .local refs. Errors: ${JSON.stringify(report.errors, null, 2)}`
    );
  }
}

// ── Step 10: scope + source-policy model ──────────────────────────────────────

function writeBrokenReadme(projectRoot) {
  fs.writeFileSync(
    path.join(projectRoot, 'README.md'),
    '# Test\n\n[broken link](./docs/nonexistent-file.md)\n'
  );
}

function runScopeMemoryIgnoresRepodocsBrokenLinks() {
  // --scope memory must NOT report errors caused by a broken link in README.md
  const projectRoot = makeProjectDir('memora-scope-memory-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });
  writeBrokenReadme(projectRoot);

  const report = runValidateJson(projectRoot, ['--scope', 'memory', '--profile', 'core']);
  assert.equal(
    report.scope, 'memory',
    'Result must carry scope: memory'
  );
  assert.equal(
    report.errors.length, 0,
    `--scope memory must ignore README broken links. Errors: ${JSON.stringify(report.errors, null, 2)}`
  );
}

function runScopeRepoDocsCatchesBrokenLinks() {
  // --scope repo-docs must report the broken link in README.md
  const projectRoot = makeProjectDir('memora-scope-repodocs-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });
  writeBrokenReadme(projectRoot);

  const report = runValidateJson(projectRoot, ['--scope', 'repo-docs', '--profile', 'core'], 1);
  assert.equal(report.scope, 'repo-docs', 'Result must carry scope: repo-docs');
  assert.ok(
    report.errors.some((e) => e.file === 'README.md' && e.message.includes('nonexistent-file.md')),
    `--scope repo-docs must report broken link in README.md. Errors: ${JSON.stringify(report.errors, null, 2)}`
  );
  assert.ok(
    report.errors.every((e) => !e.file.startsWith('memory-bank/')),
    '--scope repo-docs must not report memory-bank errors'
  );
}

function runScopeAllCombinesBoth() {
  // --scope all must surface broken README link AND memory-bank errors together
  const projectRoot = makeProjectDir('memora-scope-all-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });
  writeBrokenReadme(projectRoot);

  // Inject a broken internal link into a memory-bank file as well
  const projectMd = path.join(projectRoot, 'memory-bank/PROJECT.md');
  const original = fs.readFileSync(projectMd, 'utf8');
  fs.writeFileSync(projectMd, original + '\n[bad mb link](./MISSING_MB_FILE.md)\n');

  const report = runValidateJson(projectRoot, ['--scope', 'all', '--profile', 'core'], 1);
  assert.equal(report.scope, 'all', 'Result must carry scope: all');
  assert.ok(
    report.errors.some((e) => e.file === 'README.md'),
    '--scope all must include README.md error'
  );
  assert.ok(
    report.errors.some((e) => e.file.startsWith('memory-bank/')),
    '--scope all must include memory-bank error'
  );
}

function runSourcePolicyAllowsPlaceholdersInScaffoldSource() {
  // scaffold-source repo: governance profile must NOT flag placeholders
  // in files covered by sourcePolicyAllowlist, but MUST still flag them
  // in files that are NOT in the allowlist.
  const projectRoot = makeProjectDir('memora-source-policy-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });

  // Mark this project as scaffold-source with allowlist for PROJECT.md only
  const pkg = { memora: { repoRole: 'scaffold-source', sourcePolicyAllowlist: ['memory-bank/PROJECT.md'] } };
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify(pkg, null, 2));

  // Use runResult — exit code can be non-zero because non-allowlisted files
  // still have placeholder errors under governance profile.
  const result = runResult(
    node,
    ['bin/memora.js', 'validate', projectRoot, '--profile', 'governance', '--scope', 'memory', '--format', 'json'],
    { cwd: repoRoot }
  );
  const report = JSON.parse(result.stdout);

  // Allowlisted file must have NO placeholder errors
  const allowlistedErrors = report.errors.filter(
    (e) => e.file === 'memory-bank/PROJECT.md' && e.message.includes('template placeholder')
  );
  assert.equal(
    allowlistedErrors.length, 0,
    `scaffold-source policy must suppress placeholder errors for allowlisted files. Errors: ${JSON.stringify(report.errors, null, 2)}`
  );

  // Non-allowlisted file (ARCHITECTURE.md) must STILL be flagged
  const nonAllowlistedErrors = report.errors.filter(
    (e) => e.file === 'memory-bank/ARCHITECTURE.md' && e.message.includes('template placeholder')
  );
  assert.ok(
    nonAllowlistedErrors.length > 0,
    'Files NOT in allowlist must still be flagged for placeholders under governance'
  );
}

function runFreshScaffoldStillCatchesPlaceholders() {
  // target project (no memora.repoRole): governance must still flag placeholders
  const projectRoot = makeProjectDir('memora-target-policy-');
  initGitRepo(projectRoot);
  run(node, ['bin/memora.js', 'init', projectRoot], { cwd: repoRoot });

  // No package.json → no source policy → governance should flag placeholders
  const report = runValidateJson(projectRoot, ['--profile', 'governance', '--scope', 'memory'], 1);
  assert.ok(
    report.errors.some((e) => e.message.includes('template placeholder')),
    `Target project without source policy must still flag placeholders under governance. Errors: ${JSON.stringify(report.errors, null, 2)}`
  );
}

function main() {
  runInitScenario({ includeAssets: false, includeServices: false });
  runInitScenario({ includeAssets: true, includeServices: true });
  runPostinstallScenario();
  runSchemaContractScenario();
  runMissingLocalSessionScenario();
  runFrontmatterEdgeCasesScenario();
  runScopeMemoryIgnoresRepodocsBrokenLinks();
  runScopeRepoDocsCatchesBrokenLinks();
  runScopeAllCombinesBoth();
  runSourcePolicyAllowsPlaceholdersInScaffoldSource();
  runFreshScaffoldStillCatchesPlaceholders();
  process.stdout.write('Smoke tests passed.\n');
}

main();
