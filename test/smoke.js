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
  runDoctor(projectRoot);
}

function main() {
  runInitScenario({ includeAssets: false, includeServices: false });
  runInitScenario({ includeAssets: true, includeServices: true });
  runPostinstallScenario();
  process.stdout.write('Smoke tests passed.\n');
}

main();
