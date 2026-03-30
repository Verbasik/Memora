const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = 'scaffold.manifest.json';

function loadManifest(pkgRoot) {
  const manifestPath = path.join(pkgRoot, MANIFEST_FILE);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyItem(src, dst, { force }) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    ensureDir(dst);
    for (const name of fs.readdirSync(src)) {
      copyItem(path.join(src, name), path.join(dst, name), { force });
    }
    return;
  }

  if (!stat.isFile()) {
    throw new Error(`Unsupported scaffold item: ${src}`);
  }

  if (fs.existsSync(dst) && !force) {
    throw new Error(`Exists: ${dst}`);
  }

  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, stat.mode);
}

function collectEntries(manifest, options = {}) {
  const entries = [...manifest.defaultEntries];

  if (options.includeAssets) {
    entries.push(...(manifest.optionalEntries.assets || []));
  }

  if (options.includeServices) {
    entries.push(...(manifest.optionalEntries.services || []));
  }

  return entries;
}

function copyEntries({ pkgRoot, targetRoot, entries, force }) {
  const copied = [];

  for (const entry of entries) {
    const src = path.join(pkgRoot, entry.source);
    const dst = path.join(targetRoot, entry.target);

    if (!fs.existsSync(src)) {
      throw new Error(`Missing scaffold source: ${entry.source}`);
    }

    copyItem(src, dst, { force });
    copied.push(entry.target);
  }

  return copied;
}

module.exports = {
  MANIFEST_FILE,
  loadManifest,
  ensureDir,
  collectEntries,
  copyEntries
};
