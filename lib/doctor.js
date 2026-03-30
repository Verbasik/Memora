const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadManifest } = require('./scaffold');

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const HOOK_SCRIPT_RE = /memory-bank\/scripts\/[A-Za-z0-9-]+\.sh/g;
const ABSOLUTE_PATH_RE = /(?:\/Users\/|\/home\/|[A-Za-z]:\\)/;

function walkFiles(rootDir, predicate) {
  const files = [];

  if (!fs.existsSync(rootDir)) {
    return files;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate));
      continue;
    }

    if (!predicate || predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function addResult(results, level, check, message, extra = {}) {
  results[level].push({ check, message, ...extra });
}

function isExecutable(filePath) {
  try {
    return (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveHookReferences(targetRoot, configFile) {
  const content = fs.readFileSync(configFile, 'utf8');
  const matches = content.match(HOOK_SCRIPT_RE) || [];
  const refs = new Set();

  for (const match of matches) {
    refs.add(match);
  }

  return [...refs].map((ref) => path.join(targetRoot, ref));
}

function checkExpectedEntries(targetRoot, manifest, results) {
  for (const entry of manifest.defaultEntries) {
    const targetPath = path.join(targetRoot, entry.target);
    if (fs.existsSync(targetPath)) {
      addResult(results, 'ok', 'scaffold', `Found ${entry.target}`);
    } else {
      addResult(results, 'errors', 'scaffold', `Missing scaffold entry: ${entry.target}`);
    }
  }
}

function checkGitHooks(targetRoot, manifest, results) {
  const githookPath = path.join(targetRoot, manifest.doctor.githookFile);
  if (!fs.existsSync(githookPath)) {
    addResult(results, 'errors', 'githooks', `Missing ${manifest.doctor.githookFile}`);
    return;
  }

  if (!isExecutable(githookPath)) {
    addResult(results, 'errors', 'githooks', `${manifest.doctor.githookFile} is not executable.`);
  } else {
    addResult(results, 'ok', 'githooks', `${manifest.doctor.githookFile} is executable.`);
  }

  let insideRepo = false;
  try {
    insideRepo = execSync('git rev-parse --is-inside-work-tree', {
      cwd: targetRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() === 'true';
  } catch {}

  if (!insideRepo) {
    addResult(results, 'warnings', 'githooks', 'Cannot verify active hooks: target is not a git working tree.');
    return;
  }

  let hooksPath = '';
  try {
    hooksPath = execSync('git config --get core.hooksPath', {
      cwd: targetRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {}

  if (!hooksPath) {
    addResult(results, 'warnings', 'githooks', 'Git hooks are not activated. Expected core.hooksPath=.githooks.');
    return;
  }

  const resolvedHooksPath = path.resolve(targetRoot, hooksPath);
  const expectedHooksPath = path.resolve(targetRoot, '.githooks');

  if (hooksPath === '.githooks' || resolvedHooksPath === expectedHooksPath) {
    addResult(results, 'ok', 'githooks', 'Git hooks are active.');
  } else {
    addResult(results, 'warnings', 'githooks', `Git hooks path is ${hooksPath}; expected .githooks.`);
  }
}

function checkCIWorkflow(targetRoot, manifest, results) {
  const workflowPath = path.join(targetRoot, manifest.doctor.ciWorkflow);
  if (fs.existsSync(workflowPath)) {
    addResult(results, 'ok', 'ci', `Found CI workflow: ${manifest.doctor.ciWorkflow}`);
  } else {
    addResult(results, 'errors', 'ci', `Missing CI workflow: ${manifest.doctor.ciWorkflow}`);
  }
}

function checkAdapters(targetRoot, manifest, results) {
  for (const relativePath of manifest.doctor.adapterFiles) {
    const fullPath = path.join(targetRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      addResult(results, 'ok', 'adapters', `Found adapter surface: ${relativePath}`);
    } else {
      addResult(results, 'errors', 'adapters', `Missing adapter surface: ${relativePath}`);
    }
  }
}

function checkHookPaths(targetRoot, manifest, results) {
  for (const hookScript of manifest.doctor.hookConfigFiles) {
    const configPath = path.join(targetRoot, hookScript);
    if (!fs.existsSync(configPath)) {
      addResult(results, 'errors', 'hooks', `Missing hook config: ${hookScript}`);
      continue;
    }

    const refs = resolveHookReferences(targetRoot, configPath);
    if (refs.length === 0) {
      addResult(results, 'warnings', 'hooks', `No hook script references found in ${hookScript}`);
      continue;
    }

    for (const ref of refs) {
      const relPath = path.relative(targetRoot, ref);
      if (fs.existsSync(ref)) {
        addResult(results, 'ok', 'hooks', `Hook path is valid: ${relPath}`);
      } else {
        addResult(results, 'errors', 'hooks', `Broken hook path reference: ${relPath}`);
      }
    }
  }
}

function checkQwenEntry(targetRoot, results) {
  const qwenSettingsPath = path.join(targetRoot, '.qwen/settings.json');
  if (!fs.existsSync(qwenSettingsPath)) {
    return;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(qwenSettingsPath, 'utf8'));
    const files = settings.context && Array.isArray(settings.context.fileName)
      ? settings.context.fileName
      : [];

    for (const fileName of files) {
      const fullPath = path.join(targetRoot, fileName);
      if (fs.existsSync(fullPath)) {
        addResult(results, 'ok', 'qwen', `Qwen context file is present: ${fileName}`);
      } else {
        addResult(results, 'errors', 'qwen', `Qwen references missing entry file: ${fileName}`);
      }
    }
  } catch (error) {
    addResult(results, 'errors', 'qwen', `Failed to parse .qwen/settings.json: ${error.message}`);
  }
}

function checkClaudePaths(targetRoot, results) {
  const claudeSettingsPath = path.join(targetRoot, '.claude/settings.json');
  if (!fs.existsSync(claudeSettingsPath)) {
    return;
  }

  const content = fs.readFileSync(claudeSettingsPath, 'utf8');
  if (ABSOLUTE_PATH_RE.test(content)) {
    addResult(results, 'warnings', 'claude', 'Absolute host-specific paths found in .claude/settings.json.');
  } else {
    addResult(results, 'ok', 'claude', '.claude/settings.json is free of obvious host-specific absolute paths.');
  }
}

function checkCriticalPlaceholders(targetRoot, manifest, results) {
  for (const relativePath of manifest.doctor.criticalFiles) {
    const fullPath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      addResult(results, 'errors', 'placeholders', `Missing critical file: ${relativePath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = manifest.doctor.placeholderMarkers.filter((marker) => content.includes(marker));

    if (matches.length > 0) {
      addResult(
        results,
        'warnings',
        'placeholders',
        `Template placeholders remain in ${relativePath}: ${matches.join(', ')}`
      );
    } else {
      addResult(results, 'ok', 'placeholders', `No obvious template placeholders in ${relativePath}`);
    }
  }
}

function checkInternalLinks(targetRoot, results) {
  const markdownFiles = walkFiles(targetRoot, (filePath) => filePath.endsWith('.md'));

  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, 'utf8');
    const relFile = path.relative(targetRoot, markdownFile);
    let match;

    while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
      const rawTarget = match[1].trim();
      if (!rawTarget || rawTarget.startsWith('#')) {
        continue;
      }

      if (/^(https?:|mailto:|file:|app:|plugin:)/i.test(rawTarget)) {
        continue;
      }

      const cleanTarget = rawTarget.split('#')[0];
      if (!cleanTarget) {
        continue;
      }

      const resolved = path.resolve(path.dirname(markdownFile), cleanTarget);
      if (!fs.existsSync(resolved)) {
        addResult(results, 'errors', 'links', `Broken internal link in ${relFile}: ${rawTarget}`);
      }
    }
  }

  if (!results.errors.some((entry) => entry.check === 'links')) {
    addResult(results, 'ok', 'links', 'No broken internal markdown links found.');
  }
}

function runDoctor(targetRoot) {
  const manifest = loadManifest(targetRoot);
  const results = { ok: [], warnings: [], errors: [] };

  checkExpectedEntries(targetRoot, manifest, results);
  checkGitHooks(targetRoot, manifest, results);
  checkCIWorkflow(targetRoot, manifest, results);
  checkAdapters(targetRoot, manifest, results);
  checkHookPaths(targetRoot, manifest, results);
  checkQwenEntry(targetRoot, results);
  checkClaudePaths(targetRoot, results);
  checkCriticalPlaceholders(targetRoot, manifest, results);
  checkInternalLinks(targetRoot, results);

  return results;
}

module.exports = {
  runDoctor
};
