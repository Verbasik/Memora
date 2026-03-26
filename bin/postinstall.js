#!/usr/bin/env node
/*
  Memora postinstall — runs automatically after `npm install memora-cli`.
  Unpacks the full Memora scaffold into the directory where npm was invoked (INIT_CWD).

  Guards (skip silently if any match):
    - INIT_CWD not set (old npm)
    - Global install (npm_config_global=true)
    - MEMORA_SKIP_INIT=1 (user opt-out)
    - Installed as a transitive dep (INIT_CWD contains node_modules)
    - memory-bank/ already exists in target (already initialized)
*/

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INIT_CWD  = process.env.INIT_CWD;
const PKG_ROOT  = path.resolve(__dirname, '..');
const TARGET    = INIT_CWD ? path.resolve(INIT_CWD) : null;

function log(msg) { process.stdout.write('[memora] ' + msg + '\n'); }
function warn(msg) { process.stderr.write('[memora] ' + msg + '\n'); }

// ── Guards ──────────────────────────────────────────────────────────────────

if (!TARGET) process.exit(0);
if (process.env.npm_config_global === 'true') process.exit(0);
if (process.env.MEMORA_SKIP_INIT === '1') process.exit(0);
if (TARGET.includes('node_modules')) process.exit(0);

// Already initialized — don't overwrite silently
if (fs.existsSync(path.join(TARGET, 'memory-bank'))) {
  log('memory-bank/ already exists in this directory — skipping auto-init.');
  log('Run `memora init --force` to overwrite.');
  process.exit(0);
}

// Don't copy into the package itself
if (path.resolve(TARGET) === path.resolve(PKG_ROOT)) process.exit(0);

// ── File copy ───────────────────────────────────────────────────────────────

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyItem(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dst);
    for (const name of fs.readdirSync(src)) {
      copyItem(path.join(src, name), path.join(dst, name));
    }
  } else if (stat.isFile()) {
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
  }
}

const SCAFFOLD = [
  'AGENTS.md',
  'CLAUDE.md',
  'MANIFESTO.md',
  'README.md',
  'init.sh',
  'memory-bank',
  '.claude',
  '.codex',
  '.qwen',
  '.opencode',
  '.agents',
];

// ── Run ─────────────────────────────────────────────────────────────────────

log(`Initializing Memora scaffold into: ${TARGET}`);
log('');

const copied = [];
const skipped = [];

for (const rel of SCAFFOLD) {
  const src = path.join(PKG_ROOT, rel);
  if (!fs.existsSync(src)) {
    skipped.push(rel);
    continue;
  }
  const dst = path.join(TARGET, rel);
  try {
    copyItem(src, dst);
    copied.push(rel);
    log(`  + ${rel}`);
  } catch (e) {
    warn(`  ! ${rel}: ${e.message}`);
    process.exitCode = 1;
    return;
  }
}

// ── init.sh ─────────────────────────────────────────────────────────────────

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

// ── Done ─────────────────────────────────────────────────────────────────────

log('');
log('✓ Done. Next steps:');
log('  1) Fill memory-bank/PROJECT.md, ARCHITECTURE.md, TESTING.md');
log('  2) Run `memory-bootstrap` skill to auto-populate from codebase');
log('  3) git add . && git commit -m "init: add memora memory-bank"');
log('');
log('Opt-out for future installs: MEMORA_SKIP_INIT=1 npm i memora-cli');
