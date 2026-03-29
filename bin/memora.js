#!/usr/bin/env node
/*
  Memora CLI: initialize, validate, and inspect Memora scaffold health.
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadManifest, collectEntries, ensureDir, copyEntries } = require('../lib/scaffold');
const { runDoctor } = require('../lib/doctor');
const { runValidation, VALIDATION_PROFILES } = require('../lib/validate');

function log(message) {
  process.stdout.write(message + '\n');
}

function err(message) {
  process.stderr.write(message + '\n');
}

function loadVersion(pkgRoot) {
  try {
    return require(path.join(pkgRoot, 'package.json')).version;
  } catch {
    try {
      return loadManifest(pkgRoot).toolVersion || 'dev';
    } catch {
      return 'dev';
    }
  }
}

function buildHelp(version) {
  return `Memora CLI v${version}
Usage:
  memora init [target-dir] [--force] [--no-init] [--include-assets] [--include-services]
  memora validate [target-dir] [--profile core|extended|governance] [--strict] [--format text|json] [--watch]
  memora doctor [target-dir] [--format text|json]

Commands:
  init      Initialize Memora scaffold in target directory
  validate  Validate schema contracts, integrity, and hygiene across memory-bank
  doctor    Check scaffold parity, operational health, and path consistency

Flags (init):
  --force             Overwrite existing files
  --no-init           Copy files only, skip init.sh
  --include-assets    Also copy assets/
  --include-services  Also copy services/_template/

Flags (validate):
  --profile name       Validation profile: core | extended | governance
  --strict            Treat recommended-field warnings as errors
  --format text|json  Output format (default: text)
  --watch             Live-reload: re-validate on every .md change

Flags (doctor):
  --format text|json  Output format (default: text)

Examples:
  memora init
  memora init ./myproj --force
  memora validate --strict
  memora validate --profile governance
  memora validate ./myproj --format json
  memora doctor
  memora doctor ./myproj --format json
`;
}

function parseArgs(argv) {
  const args = {
    cmd: 'help',
    target: process.cwd(),
    force: false,
    noInit: false,
    includeAssets: false,
    includeServices: false,
    profile: 'core',
    strict: false,
    format: 'text',
    watch: false
  };

  const rest = argv.slice(2);
  if (rest.length === 0) {
    return args;
  }

  const cmd = rest[0];

  if (cmd === 'init') {
    args.cmd = 'init';
    for (let i = 1; i < rest.length; i++) {
      const arg = rest[i];
      if (!arg) continue;
      if (arg === '--force') args.force = true;
      else if (arg === '--no-init') args.noInit = true;
      else if (arg === '--include-assets') args.includeAssets = true;
      else if (arg === '--include-services') args.includeServices = true;
      else if (!arg.startsWith('-')) args.target = path.resolve(arg);
      else err(`Unknown flag: ${arg}`);
    }
    return args;
  }

  if (cmd === 'validate') {
    args.cmd = 'validate';
    for (let i = 1; i < rest.length; i++) {
      const arg = rest[i];
      if (!arg) continue;
      if (arg === '--profile' && rest[i + 1]) args.profile = rest[++i];
      else if (arg === '--strict') args.strict = true;
      else if (arg === '--watch') args.watch = true;
      else if (arg === '--format' && rest[i + 1]) args.format = rest[++i];
      else if (!arg.startsWith('-')) args.target = path.resolve(arg);
      else err(`Unknown flag: ${arg}`);
    }
    return args;
  }

  if (cmd === 'doctor') {
    args.cmd = 'doctor';
    for (let i = 1; i < rest.length; i++) {
      const arg = rest[i];
      if (!arg) continue;
      if (arg === '--format' && rest[i + 1]) args.format = rest[++i];
      else if (!arg.startsWith('-')) args.target = path.resolve(arg);
      else err(`Unknown flag: ${arg}`);
    }
  }

  return args;
}

function runInitSh(target) {
  const initPath = path.join(target, 'init.sh');
  if (!fs.existsSync(initPath)) {
    err('init.sh not found in target; skipping init step.');
    return;
  }

  try {
    fs.chmodSync(initPath, 0o755);
  } catch {}

  try {
    execSync('bash ./init.sh', { cwd: target, stdio: 'inherit' });
  } catch {
    err('init.sh failed. You can run it manually: bash ./init.sh');
  }
}

function validateMemoryBank(target, opts) {
  const pkgRoot = path.resolve(__dirname, '..');
  let results;
  try {
    results = runValidation(target, pkgRoot, opts);
  } catch (error) {
    err(`✗ ${error.message}`);
    process.exit(error.exitCode || 2);
  }
  const total = results.errors.length + results.warnings.length + results.ok.length;

  if (opts.format === 'json') {
    log(JSON.stringify(results, null, 2));
    return results.errors.length;
  }

  if (results.errors.length > 0) {
    log('\nErrors:');
    for (const entry of results.errors) {
      log(`  ✗  ${entry.file}\n     → ${entry.message}`);
    }
  }

  if (results.warnings.length > 0) {
    log('\nWarnings:');
    for (const entry of results.warnings) {
      log(`  ⚠  ${entry.file}\n     → ${entry.message}`);
    }
  }

  if (results.ok.length > 0) {
    log('\nValid:');
    for (const entry of results.ok) {
      log(`  ✓  ${entry.file}`);
    }
  }

  if (results.skipped.length > 0) {
    log('\nSkipped:');
    for (const entry of results.skipped) {
      log(`  ·  ${entry.file}  (${entry.reason})`);
    }
  }

  log('');
  log('─────────────────────────────────────────────────────────');
  log(`Profile: ${results.profile}`);
  log(`Files: ${total}  │  Errors: ${results.errors.length}  │  Warnings: ${results.warnings.length}  │  Skipped: ${results.skipped.length}`);

  if (results.errors.length === 0) {
    log(results.warnings.length === 0
      ? '✓ All memory-bank files are valid.'
      : '✓ No errors. Run with --strict to promote warnings to errors.');
  }

  return results.errors.length;
}

function watchMemoryBank(target, opts) {
  const memoryBankDir = path.join(target, 'memory-bank');
  if (!fs.existsSync(memoryBankDir)) {
    err(`✗ memory-bank/ not found in: ${target}`);
    process.exit(2);
  }

  log(`👁  Watching ${path.relative(process.cwd(), memoryBankDir)} for changes… (Ctrl+C to stop)\n`);
  validateMemoryBank(target, opts);

  let debounceTimer = null;
  const debounceMs = 300;

  function onFileChange(_eventType, filename) {
    if (!filename || !filename.endsWith('.md')) {
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
      log(`\n[${ts}] Change detected: ${filename}`);
      validateMemoryBank(target, opts);
    }, debounceMs);
  }

  try {
    fs.watch(memoryBankDir, { recursive: true }, onFileChange);
  } catch {
    fs.watch(memoryBankDir, onFileChange);
    err('⚠  Recursive watch not supported — watching top-level only. Upgrade to Node 20+ for full coverage.');
  }

  process.on('SIGINT', () => {
    log('\n✓ Watch stopped.');
    process.exit(0);
  });
}

function printDoctorResults(results, format) {
  if (format === 'json') {
    log(JSON.stringify(results, null, 2));
    return results.errors.length;
  }

  if (results.errors.length > 0) {
    log('\nErrors:');
    for (const entry of results.errors) {
      log(`  ✗  [${entry.check}] ${entry.message}`);
    }
  }

  if (results.warnings.length > 0) {
    log('\nWarnings:');
    for (const entry of results.warnings) {
      log(`  ⚠  [${entry.check}] ${entry.message}`);
    }
  }

  if (results.ok.length > 0) {
    log('\nChecks passed:');
    for (const entry of results.ok) {
      log(`  ✓  [${entry.check}] ${entry.message}`);
    }
  }

  log('');
  log('─────────────────────────────────────────────────────────');
  log(`Doctor: Errors: ${results.errors.length}  │  Warnings: ${results.warnings.length}  │  OK: ${results.ok.length}`);

  if (results.errors.length === 0) {
    log(results.warnings.length === 0
      ? '✓ Scaffold health is good.'
      : '✓ No blocking issues. Review warnings above.');
  }

  return results.errors.length;
}

function main() {
  const pkgRoot = path.resolve(__dirname, '..');
  const version = loadVersion(pkgRoot);
  const args = parseArgs(process.argv);

  if (args.cmd === 'validate') {
    if (!VALIDATION_PROFILES.has(args.profile)) {
      err(`✗ Unknown validation profile: ${args.profile}`);
      process.exit(2);
      return;
    }

    const opts = { strict: args.strict, format: args.format, profile: args.profile };
    if (args.watch) {
      watchMemoryBank(args.target, opts);
      return;
    }

    const exitCode = validateMemoryBank(args.target, opts);
    process.exit(exitCode > 0 ? 1 : 0);
    return;
  }

  if (args.cmd === 'doctor') {
    const target = args.target || process.cwd();
    const manifestPath = path.join(target, 'scaffold.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      err(`✗ scaffold.manifest.json not found in: ${target}`);
      process.exit(2);
    }

    const results = runDoctor(target);
    const exitCode = printDoctorResults(results, args.format);
    process.exit(exitCode > 0 ? 1 : 0);
    return;
  }

  if (args.cmd !== 'init') {
    log(buildHelp(version));
    process.exit(0);
  }

  const manifest = loadManifest(pkgRoot);
  const entries = collectEntries(manifest, {
    includeAssets: args.includeAssets,
    includeServices: args.includeServices
  });

  const target = args.target || process.cwd();
  ensureDir(target);

  log(`→ Initializing Memora into: ${target}`);
  try {
    const copied = copyEntries({
      pkgRoot,
      targetRoot: target,
      entries,
      force: args.force
    });

    for (const relativePath of copied) {
      log(`  + ${relativePath}`);
    }
  } catch (error) {
    err(`  ! ${error.message}`);
    process.exit(1);
    return;
  }

  if (!args.noInit) {
    log('→ Running init.sh');
    runInitSh(target);
  } else {
    log('→ Skipping init.sh (per --no-init)');
  }

  log('✓ Done. Next steps:');
  log('  1) Fill memory-bank/PROJECT.md, ARCHITECTURE.md, TESTING.md');
  log('  2) Run: memora validate');
  log('  3) Run: memora doctor');
  log('  4) Review adapter files for your preferred toolchain');
}

main();
