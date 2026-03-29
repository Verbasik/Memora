#!/usr/bin/env node
/*
  Memora postinstall — runs automatically after `npm install memora-cli`.
  Unpacks the default Memora scaffold into the directory where npm was invoked (INIT_CWD).
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadManifest, collectEntries, copyEntries } = require('../lib/scaffold');

const INIT_CWD = process.env.INIT_CWD;
const PKG_ROOT = path.resolve(__dirname, '..');
const TARGET = INIT_CWD ? path.resolve(INIT_CWD) : null;

function log(message) {
  process.stdout.write('[memora] ' + message + '\n');
}

function warn(message) {
  process.stderr.write('[memora] ' + message + '\n');
}

if (!TARGET) process.exit(0);
if (process.env.npm_config_global === 'true') process.exit(0);
if (process.env.MEMORA_SKIP_INIT === '1') process.exit(0);
if (TARGET.includes('node_modules')) process.exit(0);

if (fs.existsSync(path.join(TARGET, 'memory-bank'))) {
  log('memory-bank/ already exists in this directory — skipping auto-init.');
  log('Run `memora init --force` to overwrite.');
  process.exit(0);
}

if (path.resolve(TARGET) === path.resolve(PKG_ROOT)) process.exit(0);

const manifest = loadManifest(PKG_ROOT);
const entries = collectEntries(manifest, {
  includeAssets: false,
  includeServices: false
});

log(`Initializing Memora scaffold into: ${TARGET}`);
log('');

try {
  const copied = copyEntries({
    pkgRoot: PKG_ROOT,
    targetRoot: TARGET,
    entries,
    force: false
  });

  for (const relativePath of copied) {
    log(`  + ${relativePath}`);
  }
} catch (error) {
  warn(`  ! ${error.message}`);
  process.exit(1);
}

const initSh = path.join(TARGET, 'init.sh');
if (fs.existsSync(initSh)) {
  log('');
  log('Running init.sh...');
  try {
    fs.chmodSync(initSh, 0o755);
    execSync('bash ./init.sh', { cwd: TARGET, stdio: 'inherit' });
  } catch {
    warn('init.sh failed — run `bash ./init.sh` manually.');
  }
}

log('');
log('✓ Done. Next steps:');
log('  1) Fill memory-bank/PROJECT.md, ARCHITECTURE.md, TESTING.md');
log('  2) Run `memory-bootstrap` through your preferred toolchain');
log('  3) Run `memora validate` and `memora doctor`');
log('');
log('Opt-out for future installs: MEMORA_SKIP_INIT=1 npm i memora-cli');
