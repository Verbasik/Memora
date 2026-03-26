#!/usr/bin/env node
/*
  Memora CLI: initialize and validate Memora memory-bank structure.

  Usage:
    memora init [target-dir] [--force] [--no-init] [--include-assets] [--include-services]
    memora validate [target-dir] [--strict] [--format text|json] [--watch]
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function log(msg) { process.stdout.write(msg + '\n'); }
function err(msg) { process.stderr.write(msg + '\n'); }

function parseArgs(argv) {
  const args = {
    cmd: 'help',
    target: process.cwd(),
    force: false,
    noInit: false,
    includeAssets: false,
    includeServices: false,
    strict: false,
    format: 'text',
    watch: false
  };
  const rest = argv.slice(2);
  if (rest.length === 0) return args;
  const cmd = rest[0];
  if (cmd === 'init') {
    args.cmd = 'init';
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i];
      if (!a) continue;
      if (a === '--force') args.force = true;
      else if (a === '--no-init') args.noInit = true;
      else if (a === '--include-assets') args.includeAssets = true;
      else if (a === '--include-services') args.includeServices = true;
      else if (!a.startsWith('-')) args.target = path.resolve(a);
      else err(`Unknown flag: ${a}`);
    }
  } else if (cmd === 'validate') {
    args.cmd = 'validate';
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i];
      if (!a) continue;
      if (a === '--strict') args.strict = true;
      else if (a === '--watch') args.watch = true;
      else if (a === '--format' && rest[i + 1]) { args.format = rest[++i]; }
      else if (!a.startsWith('-')) args.target = path.resolve(a);
      else err(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyItem(src, dst, { force }) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dst);
    for (const name of fs.readdirSync(src)) {
      copyItem(path.join(src, name), path.join(dst, name), { force });
    }
  } else if (stat.isFile()) {
    if (fs.existsSync(dst) && !force) {
      throw new Error(`Exists: ${path.relative(process.cwd(), dst)} (use --force to overwrite)`);
    }
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
  }
}

function runInitSh(target) {
  const initPath = path.join(target, 'init.sh');
  if (!fs.existsSync(initPath)) {
    err('init.sh not found in target; skipping init step.');
    return;
  }
  try { fs.chmodSync(initPath, 0o755); } catch {}
  try {
    execSync(`bash ./init.sh`, { cwd: target, stdio: 'inherit' });
  } catch (e) {
    err('init.sh failed. You can run it manually: bash ./init.sh');
  }
}

// ── Validate ──────────────────────────────────────────────────────────────────

const REQUIRED_BASE     = ['title', 'authority', 'status'];
const RECOMMENDED_NEW   = ['id', 'type', 'version', 'pii_risk', 'ttl', 'tags'];
const PII_RISK_VALUES   = ['none', 'low', 'medium', 'high'];
const AUTHORITY_VALUES  = ['controlled', 'immutable', 'free'];
const STATUS_VALUES     = ['active', 'draft', 'deprecated', 'proposed', 'accepted', 'superseded'];
const SKIP_DIRS         = ['.local', 'ARCHIVE', 'scripts'];
const SKIP_NAME_PARTS   = ['template', 'Template'];

/** Minimal YAML front-matter parser — handles simple key: value pairs */
function extractFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)/);
    if (!m) continue;
    const val = m[2].trim();
    if      (val === 'null' || val === '~') fields[m[1]] = null;
    else if (val === 'true')                fields[m[1]] = true;
    else if (val === 'false')               fields[m[1]] = false;
    else if (val === '[]')                  fields[m[1]] = [];
    else                                    fields[m[1]] = val.replace(/^["']|["']$/g, '');
  }
  return fields;
}

function validateFile(filePath, relPath, results, opts) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fields  = extractFrontMatter(content);

  if (!fields) {
    results.skipped.push({ file: relPath, reason: 'no YAML front-matter' });
    return;
  }

  const errors   = [];
  const warnings = [];

  // Required base fields
  for (const f of REQUIRED_BASE) {
    if (!fields[f]) errors.push(`missing required field: "${f}"`);
  }

  // authority must be a known value
  if (fields.authority && !AUTHORITY_VALUES.includes(fields.authority)) {
    errors.push(`authority "${fields.authority}" must be one of: ${AUTHORITY_VALUES.join(' | ')}`);
  }

  // status must be a known value (allow placeholder "[...]" format without error)
  if (fields.status && !STATUS_VALUES.includes(fields.status) && !/^\[.+\]$/.test(fields.status)) {
    errors.push(`status "${fields.status}" must be one of: ${STATUS_VALUES.join(' | ')}`);
  }

  // pii_risk must be a known value if present
  if (fields.pii_risk !== undefined && fields.pii_risk !== null &&
      !PII_RISK_VALUES.includes(fields.pii_risk)) {
    errors.push(`pii_risk "${fields.pii_risk}" must be one of: ${PII_RISK_VALUES.join(' | ')}`);
  }

  // Recommended new fields — warnings by default, errors in --strict mode
  const newFieldTarget = opts.strict ? errors : warnings;
  for (const f of RECOMMENDED_NEW) {
    if (!(f in fields)) newFieldTarget.push(`recommended field missing: "${f}"`);
  }

  if (errors.length > 0) {
    for (const e of errors)   results.errors.push({ file: relPath, message: e });
  } else if (warnings.length > 0) {
    for (const w of warnings) results.warnings.push({ file: relPath, message: w });
  } else {
    results.ok.push({ file: relPath });
  }
}

function scanDir(dir, results, opts) {
  let items;
  try { items = fs.readdirSync(dir); } catch { return; }

  for (const item of items) {
    if (SKIP_DIRS.includes(item)) continue;

    const full = path.join(dir, item);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }

    if (stat.isDirectory()) {
      scanDir(full, results, opts);
    } else if (item.endsWith('.md')) {
      if (SKIP_NAME_PARTS.some(s => item.includes(s)) || item.startsWith('_')) {
        results.skipped.push({ file: path.relative(process.cwd(), full), reason: 'template file' });
        continue;
      }
      validateFile(full, path.relative(process.cwd(), full), results, opts);
    }
  }
}

function validateMemoryBank(target, opts) {
  const mbDir = path.join(target, 'memory-bank');
  if (!fs.existsSync(mbDir)) {
    err(`✗ memory-bank/ not found in: ${target}`);
    process.exit(2);
  }

  const results = { errors: [], warnings: [], ok: [], skipped: [] };
  scanDir(mbDir, results, opts);

  const total = results.errors.length + results.warnings.length + results.ok.length;

  if (opts.format === 'json') {
    log(JSON.stringify(results, null, 2));
  } else {
    if (results.errors.length > 0) {
      log('\nErrors:');
      for (const e of results.errors)   log(`  ✗  ${e.file}\n     → ${e.message}`);
    }
    if (results.warnings.length > 0) {
      log('\nWarnings:');
      for (const w of results.warnings) log(`  ⚠  ${w.file}\n     → ${w.message}`);
    }
    if (results.ok.length > 0) {
      log('\nValid:');
      for (const o of results.ok)       log(`  ✓  ${o.file}`);
    }
    if (results.skipped.length > 0) {
      log('\nSkipped:');
      for (const s of results.skipped)  log(`  ·  ${s.file}  (${s.reason})`);
    }
    log('');
    log(`─────────────────────────────────────────────────────────`);
    log(`Files: ${total}  │  Errors: ${results.errors.length}  │  Warnings: ${results.warnings.length}  │  Skipped: ${results.skipped.length}`);
    if (results.errors.length === 0) {
      log(results.warnings.length === 0
        ? '✓ All memory-bank files are valid.'
        : '✓ No errors. Run with --strict to promote warnings to errors.');
    }
  }

  return results.errors.length;
}

// ── Watch mode ────────────────────────────────────────────────────────────────

function watchMemoryBank(target, opts) {
  const mbDir = path.join(target, 'memory-bank');
  if (!fs.existsSync(mbDir)) {
    err(`✗ memory-bank/ not found in: ${target}`);
    process.exit(2);
  }

  log(`👁  Watching ${path.relative(process.cwd(), mbDir)} for changes… (Ctrl+C to stop)\n`);

  // Run once immediately
  validateMemoryBank(target, opts);

  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  function onFileChange(eventType, filename) {
    if (!filename || !filename.endsWith('.md')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
      log(`\n[${ts}] Change detected: ${filename}`);
      validateMemoryBank(target, opts);
    }, DEBOUNCE_MS);
  }

  // Watch recursively (Node ≥ 20 supports recursive natively; fallback for older)
  try {
    fs.watch(mbDir, { recursive: true }, onFileChange);
  } catch {
    // Fallback: watch top-level only (Node < 20 on Linux may not support recursive)
    fs.watch(mbDir, onFileChange);
    err('⚠  Recursive watch not supported — watching top-level only. Upgrade to Node 20+ for full coverage.');
  }

  process.on('SIGINT', () => {
    log('\n✓ Watch stopped.');
    process.exit(0);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const HELP = `Memora CLI v0.3.0
Usage:
  memora init [target-dir] [--force] [--no-init] [--include-assets] [--include-services]
  memora validate [target-dir] [--strict] [--format text|json] [--watch]

Commands:
  init      Initialize Memora memory-bank structure in target directory
  validate  Validate front-matter in all memory-bank/*.md files

Flags (init):
  --force             Overwrite existing files
  --no-init           Copy files only, skip init.sh
  --include-assets    Also copy assets/
  --include-services  Also copy services/_template/

Flags (validate):
  --strict            Treat recommended-field warnings as errors
  --format text|json  Output format (default: text)
  --watch             Live-reload: re-validate on every .md change (dev mode)

Examples:
  memora init                        initialize in current directory
  memora init ./myproj               initialize in ./myproj
  memora validate                    validate memory-bank in current directory
  memora validate ./myproj --strict  strict validation with all fields required
  memora validate --format json      machine-readable output
  memora validate --watch            live-reload validation in dev mode
`;

function main() {
  const args    = parseArgs(process.argv);
  const PKG_ROOT = path.resolve(__dirname, '..');

  if (args.cmd === 'validate') {
    const opts = { strict: args.strict, format: args.format };
    if (args.watch) {
      watchMemoryBank(args.target, opts);
      return; // keeps process alive
    }
    const exitCode = validateMemoryBank(args.target, opts);
    process.exit(exitCode > 0 ? 1 : 0);
    return;
  }

  if (args.cmd !== 'init') {
    log(HELP);
    process.exit(0);
  }

  const selections = [
    'AGENTS.md',
    'CLAUDE.md',
    'init.sh',
    'memory-bank',
    'schemas',
    '.claude',
    '.codex',
    '.qwen',
    '.opencode',
    '.agents'
  ];
  if (args.includeAssets)   selections.push('assets');
  if (args.includeServices) selections.push(path.join('services', '_template'));

  const target = args.target || process.cwd();
  ensureDir(target);

  log(`→ Initializing Memora into: ${target}`);
  for (const rel of selections) {
    const src = path.join(PKG_ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(target, rel.replace('services/_template', 'services/_template'));
    try {
      copyItem(src, dst, { force: args.force });
      log(`  + ${rel}`);
    } catch (e) {
      err(`  ! ${rel}: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!args.noInit) {
    log('→ Running init.sh');
    runInitSh(target);
  } else {
    log('→ Skipping init.sh (per --no-init)');
  }

  log('✓ Done. Next steps:');
  log('  1) Fill memory-bank/PROJECT.md, ARCHITECTURE.md, TESTING.md');
  log('  2) Review .claude/.codex/.qwen/.opencode adapters');
  log('  3) Run: memora validate    to check front-matter');
  log('  4) git init && git add . && git commit -m "init memora" (optional)');
}

main();
