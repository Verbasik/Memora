const fs = require('fs');
const path = require('path');

const VALIDATION_PROFILES = new Set(['core', 'extended', 'governance']);
const VALIDATION_SCOPES = new Set(['memory', 'repo-docs', 'all']);
const FRONTMATTER_SKIP_DIRS = new Set(['.local', 'ARCHIVE', 'scripts']);
const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const CODE_PATH_RE = /`([^`\n]+)`/g;
const SECRET_RE = /(api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9]/i;
const PRIVACY_TAG_RE = /<\/?(private|ephemeral)\b[^>]*>/i;
const CORE_FILES = [
  'memory-bank/INDEX.md',
  'memory-bank/CONSTITUTION.md',
  'memory-bank/PROJECT.md',
  'memory-bank/ARCHITECTURE.md',
  'memory-bank/CONVENTIONS.md',
  'memory-bank/TESTING.md',
  'memory-bank/DECISIONS.md'
];
const SESSION_FILE_LIMIT = 20;
const SESSION_LINE_LIMITS = {
  'memory-bank/.local/CURRENT.md': 80,
  'memory-bank/.local/HANDOFF.md': 40
};
const DEFAULT_VERIFICATION_TTL_DAYS = 60;
const RECOMMENDED_NEW = ['id', 'type', 'version', 'pii_risk', 'ttl', 'tags'];
const STABLE_PRIVACY_EXEMPTIONS = [
  /^memory-bank\/PATTERNS\//,
  /^memory-bank\/POLICIES\//,
  /^memory-bank\/CHANGELOG\.md$/,
  /^memory-bank\/ADR\//,
  /^memory-bank\/AGENTS\//,
  /^memory-bank\/AREAS\//,
  /^memory-bank\/TESTS\//
];
const OPTIONAL_LOCAL_REFERENCES = new Set([
  '.local/CURRENT.md',
  '.local/HANDOFF.md',
  '.local/SESSIONS',
  '.local/SESSIONS/*',
  'memory-bank/.local/CURRENT.md',
  'memory-bank/.local/HANDOFF.md',
  'memory-bank/.local/SESSIONS',
  'memory-bank/.local/SESSIONS/*'
]);

function walkFiles(rootDir, predicate, options = {}) {
  const files = [];
  const skipDirs = options.skipDirs || new Set();

  if (!fs.existsSync(rootDir)) {
    return files;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate, options));
      continue;
    }

    if (!predicate || predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '#') {
      return value.slice(0, i).trimEnd();
    }
  }

  return value.trimEnd();
}

function splitInlineArray(content) {
  const items = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quote) {
      current += char;
      if (char === quote && content[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseScalar(value) {
  const trimmed = stripInlineComment(value).trim();
  if (trimmed === '') return '';
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map(parseScalar);
  }

  return trimmed;
}

function normalizeFrontMatterLines(content) {
  return content
    .split('\n')
    .map((raw) => {
      const indent = raw.match(/^ */)[0].length;
      return { indent, text: raw.trim() };
    })
    .filter((line) => line.text !== '' && !line.text.startsWith('#') && !line.text.startsWith('<!--'));
}

function parseArray(lines, startIndex, indent) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || line.indent !== indent || !line.text.startsWith('- ')) {
      break;
    }

    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const next = lines[index + 1];
      if (!next || next.indent <= line.indent) {
        items.push(null);
        index++;
        continue;
      }

      const parsed = next.text.startsWith('- ')
        ? parseArray(lines, index + 1, next.indent)
        : parseObject(lines, index + 1, next.indent);
      items.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }

    items.push(parseScalar(itemText));
    index++;
  }

  return { value: items, nextIndex: index };
}

function parseObject(lines, startIndex, indent) {
  const object = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || line.indent !== indent || line.text.startsWith('- ')) {
      break;
    }

    const match = line.text.match(/^([A-Za-z0-9_.-]+):(.*)$/);
    if (!match) {
      index++;
      continue;
    }

    const key = match[1];
    const remainder = match[2].trim();
    if (remainder) {
      object[key] = parseScalar(remainder);
      index++;
      continue;
    }

    const next = lines[index + 1];
    if (!next || next.indent <= line.indent) {
      object[key] = null;
      index++;
      continue;
    }

    const parsed = next.text.startsWith('- ')
      ? parseArray(lines, index + 1, next.indent)
      : parseObject(lines, index + 1, next.indent);
    object[key] = parsed.value;
    index = parsed.nextIndex;
  }

  return { value: object, nextIndex: index };
}

function extractFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  const lines = normalizeFrontMatterLines(match[1]);
  return parseObject(lines, 0, 0).value;
}

function isTemplateLikeString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return /^\[.*\]$/.test(value)
    || value.includes('[ГГГГ')
    || value.includes('[Название')
    || value.includes('[project-slug]')
    || value.includes('[slug]')
    || value.includes('[date]')
    || value.includes('[name]')
    || value.includes('[module]')
    || value.includes('[URL]')
    || value.includes('[Описание')
    || value.includes('[запрет')
    || value.includes('[разрешение')
    || value.includes('[что ');
}

function isTemplateLikeValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(isTemplateLikeValue);
  if (typeof value === 'object') return Object.values(value).some(isTemplateLikeValue);
  return isTemplateLikeString(value);
}

function loadSourcePolicy(targetRoot) {
  const pkgPath = path.join(targetRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }

  const memora = pkg && pkg.memora;
  if (!memora || memora.repoRole !== 'scaffold-source') {
    return null;
  }

  const allowlist = Array.isArray(memora.sourcePolicyAllowlist) ? memora.sourcePolicyAllowlist : [];
  return new Set(allowlist);
}

function addResult(results, level, file, message, check) {
  results[level].push({ file, message, check });
}

function profileAtLeast(profile, minimum) {
  const order = { core: 0, extended: 1, governance: 2 };
  return order[profile] >= order[minimum];
}

function escalateWarning(results, file, message, check, opts, minimumProfile = 'governance') {
  if (opts.strict || profileAtLeast(opts.profile, minimumProfile)) {
    addResult(results, 'errors', file, message, check);
  } else {
    addResult(results, 'warnings', file, message, check);
  }
}

function getValidationOptions(opts) {
  return {
    profile: VALIDATION_PROFILES.has(opts.profile) ? opts.profile : 'core',
    strict: Boolean(opts.strict),
    format: opts.format || 'text',
    scope: VALIDATION_SCOPES.has(opts.scope) ? opts.scope : 'all'
  };
}

function loadSchemas(targetRoot, pkgRoot) {
  const schemaRoot = fs.existsSync(path.join(targetRoot, 'schemas'))
    ? path.join(targetRoot, 'schemas')
    : path.join(pkgRoot, 'schemas');
  const schemas = {};

  if (!fs.existsSync(schemaRoot)) {
    return schemas;
  }

  for (const fileName of fs.readdirSync(schemaRoot)) {
    if (!fileName.endsWith('.json')) continue;
    const fullPath = path.join(schemaRoot, fileName);
    schemas[fileName] = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  }

  return schemas;
}

function resolveSchema(relPath, fields, schemas) {
  const type = fields.type;
  const schemaMap = {
    PROJECT: 'project.schema.json',
    ARCHITECTURE: 'architecture.schema.json',
    CONSTITUTION: 'constitution.schema.json',
    DECISIONS: 'decision.schema.json',
    ADR: 'decision.schema.json',
    FACT: 'fact.schema.json',
    EPISODE: 'episode.schema.json',
    POLICY: 'policy.schema.json',
    AGENT: 'agent.schema.json',
    TEST: 'test.schema.json'
  };

  const byType = type && schemaMap[type] ? schemas[schemaMap[type]] : null;
  if (byType) return byType;

  if (relPath === 'memory-bank/PROJECT.md') return schemas['project.schema.json'] || schemas['base.schema.json'];
  if (relPath === 'memory-bank/ARCHITECTURE.md') return schemas['architecture.schema.json'] || schemas['base.schema.json'];
  if (relPath === 'memory-bank/CONSTITUTION.md') return schemas['constitution.schema.json'] || schemas['base.schema.json'];
  if (relPath === 'memory-bank/DECISIONS.md' || relPath.startsWith('memory-bank/ADR/')) return schemas['decision.schema.json'] || schemas['base.schema.json'];
  if (relPath.startsWith('memory-bank/FACTS/')) return schemas['fact.schema.json'] || schemas['base.schema.json'];
  if (relPath.startsWith('memory-bank/EPISODES/')) return schemas['episode.schema.json'] || schemas['base.schema.json'];
  if (relPath.startsWith('memory-bank/POLICIES/')) return schemas['policy.schema.json'] || schemas['base.schema.json'];
  if (relPath.startsWith('memory-bank/AGENTS/')) return schemas['agent.schema.json'] || schemas['base.schema.json'];
  if (relPath.startsWith('memory-bank/TESTS/')) return schemas['test.schema.json'] || schemas['base.schema.json'];

  return schemas['base.schema.json'] || null;
}

function inferValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function validateSchemaValue(value, schema, fieldPath, errors, warnings, opts) {
  if (!schema) return;

  if (schema.oneOf) {
    const oneOfMatches = schema.oneOf.some((candidate) => {
      const nestedErrors = [];
      validateSchemaValue(value, candidate, fieldPath, nestedErrors, [], opts);
      return nestedErrors.length === 0;
    });

    if (!oneOfMatches) {
      errors.push(`field "${fieldPath}" does not match any allowed schema variant`);
    }
    return;
  }

  if (isTemplateLikeValue(value)) {
    if (!opts.skipPlaceholderCheck && profileAtLeast(opts.profile, 'extended')) {
      const target = (opts.strict || profileAtLeast(opts.profile, 'governance')) ? errors : warnings;
      target.push(`field "${fieldPath}" still contains unresolved template placeholders`);
    }
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`field "${fieldPath}" must equal "${schema.const}"`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`field "${fieldPath}" must be one of: ${schema.enum.join(' | ')}`);
    return;
  }

  if (schema.type) {
    const actualType = inferValueType(value);
    if (schema.type === 'integer' && actualType !== 'integer') {
      errors.push(`field "${fieldPath}" must be an integer`);
      return;
    }

    if (schema.type !== 'integer' && actualType !== schema.type) {
      errors.push(`field "${fieldPath}" must be of type "${schema.type}"`);
      return;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`field "${fieldPath}" must be at least ${schema.minLength} characters long`);
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push(`field "${fieldPath}" does not match required format`);
      }
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`field "${fieldPath}" must be >= ${schema.minimum}`);
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`field "${fieldPath}" must be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`field "${fieldPath}" must contain at least ${schema.minItems} item(s)`);
    }

    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`field "${fieldPath}" must contain at most ${schema.maxItems} item(s)`);
    }

    if (schema.uniqueItems) {
      const serialized = new Set(value.map((item) => JSON.stringify(item)));
      if (serialized.size !== value.length) {
        errors.push(`field "${fieldPath}" must not contain duplicate items`);
      }
    }

    if (schema.items) {
      value.forEach((item, index) => {
        validateSchemaValue(item, schema.items, `${fieldPath}[${index}]`, errors, warnings, opts);
      });
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`field "${fieldPath}.${key}" is required`);
      }
    }

    if (schema.properties) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateSchemaValue(value[key], propertySchema, `${fieldPath}.${key}`, errors, warnings, opts);
        }
      }
    }
  }
}

function countLines(content) {
  if (content === '') return 0;
  const normalized = content.replace(/\r/g, '');
  const withoutTrailingNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (withoutTrailingNewline === '') return 0;
  return withoutTrailingNewline.split('\n').length;
}

function getVerificationTtlDays(indexFields) {
  const freshnessPolicy = indexFields && typeof indexFields.freshness_policy === 'object'
    ? indexFields.freshness_policy
    : null;
  const ttl = freshnessPolicy && typeof freshnessPolicy.verification_ttl_days === 'number'
    ? freshnessPolicy.verification_ttl_days
    : DEFAULT_VERIFICATION_TTL_DAYS;
  return ttl;
}

function daysSince(dateValue) {
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function shouldScanStablePrivacyTags(relPath) {
  if (!relPath.startsWith('memory-bank/')) return false;
  if (relPath.startsWith('memory-bank/.local/')) return false;
  if (relPath.includes('/_template') || relPath.includes('template')) return false;
  return !STABLE_PRIVACY_EXEMPTIONS.some((pattern) => pattern.test(relPath));
}

function extractMarkdownTargets(content) {
  const targets = [];
  let match;

  while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
    targets.push(match[1].trim());
  }

  return targets;
}

function extractIndexedPathRefs(content) {
  const refs = new Set();
  let match;

  while ((match = CODE_PATH_RE.exec(content)) !== null) {
    const candidate = match[1].trim();
    if (/\s/.test(candidate)) {
      continue;
    }
    if (candidate.includes('.md') || candidate.includes('memory-bank/') || candidate.includes('ADR/*') || candidate.includes('SESSIONS/*')) {
      refs.add(candidate);
    }
  }

  return [...refs];
}

function isOptionalLocalReference(rawTarget) {
  const normalized = rawTarget.replace(/\\/g, '/');
  if (OPTIONAL_LOCAL_REFERENCES.has(normalized)) {
    return true;
  }

  return normalized.startsWith('.local/SESSIONS/')
    || normalized.startsWith('memory-bank/.local/SESSIONS/');
}

function pathReferenceExists(targetRoot, baseFile, rawTarget) {
  const cleanTarget = rawTarget.split('#')[0];
  if (!cleanTarget || /^(https?:|mailto:|file:|app:|plugin:)/i.test(cleanTarget)) {
    return true;
  }

  if (cleanTarget.includes('<') || cleanTarget.includes('[')) {
    return true;
  }

  if (isOptionalLocalReference(cleanTarget)) {
    return true;
  }

  if (!cleanTarget.includes('*')) {
    const localPath = path.resolve(path.dirname(baseFile), cleanTarget);
    const rootPath = path.resolve(targetRoot, cleanTarget);
    return fs.existsSync(localPath) || fs.existsSync(rootPath);
  }

  const absolutePattern = path.resolve(path.dirname(baseFile), cleanTarget);
  const directory = path.dirname(absolutePattern);
  const basePattern = path.basename(cleanTarget);
  if (!fs.existsSync(directory)) {
    return false;
  }

  if (basePattern === '*') {
    return true;
  }

  const regexSource = basePattern
    .split('')
    .map((char) => (char === '*' ? '[^/]*' : char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const regex = new RegExp(`^${regexSource}$`);
  return fs.readdirSync(directory).some((entry) => regex.test(entry));
}

function validateMarkdownFile(fullPath, targetRoot, schemas, opts, results, fileRecords) {
  const relPath = path.relative(targetRoot, fullPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const fields = extractFrontMatter(content);
  const lineCount = countLines(content);

  fileRecords.set(relPath, { relPath, fullPath, content, fields, lineCount });

  const effectiveOpts = opts.placeholderAllowlist && opts.placeholderAllowlist.has(relPath)
    ? { ...opts, skipPlaceholderCheck: true }
    : opts;

  if (!fields) {
    results.skipped.push({ file: relPath, reason: 'no YAML front-matter' });
    return;
  }

  const errors = [];
  const warnings = [];
  const schema = resolveSchema(relPath, fields, schemas);
  const pushLocalWarning = (message) => {
    const target = (effectiveOpts.strict || profileAtLeast(effectiveOpts.profile, 'governance')) ? errors : warnings;
    target.push(message);
  };

  if (!schema) {
    warnings.push('schema-driven validation is unavailable because no schema was found');
  } else {
    const requiredFields = schema.required || [];
    for (const field of requiredFields) {
      if (!(field in fields)) {
        errors.push(`missing required field: "${field}"`);
      }
    }

    validateSchemaValue(fields, schema, 'frontmatter', errors, warnings, effectiveOpts);
  }

  for (const field of RECOMMENDED_NEW) {
    if (!(field in fields)) {
      pushLocalWarning(`recommended field missing: "${field}"`);
    }
  }

  if (typeof fields.max_lines === 'number' && lineCount > fields.max_lines) {
    pushLocalWarning(`file exceeds max_lines: ${lineCount} > ${fields.max_lines}`);
  }

  if (typeof fields.last_verified === 'string' && !isTemplateLikeString(fields.last_verified)) {
    const ttlDays = getVerificationTtlDays(fileRecords.get('memory-bank/INDEX.md') && fileRecords.get('memory-bank/INDEX.md').fields);
    const ageDays = daysSince(fields.last_verified);
    if (ageDays !== null && ageDays > ttlDays) {
      pushLocalWarning(`last_verified is stale: ${ageDays}d old (limit ${ttlDays}d)`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    results.ok.push({ file: relPath });
    return;
  }

  errors.forEach((message) => addResult(results, 'errors', relPath, message, 'schema'));
  warnings.forEach((message) => addResult(results, effectiveOpts.strict ? 'errors' : 'warnings', relPath, message, 'schema'));
}

function checkCoreFiles(targetRoot, results) {
  for (const relativePath of CORE_FILES) {
    if (!fs.existsSync(path.join(targetRoot, relativePath))) {
      addResult(results, 'errors', relativePath, 'missing required core file', 'integrity');
    }
  }
}

function checkSessionFiles(targetRoot, results, opts) {
  for (const [relativePath, maxLines] of Object.entries(SESSION_LINE_LIMITS)) {
    const fullPath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const lineCount = countLines(fs.readFileSync(fullPath, 'utf8'));
    if (lineCount > maxLines) {
      escalateWarning(results, relativePath, `file exceeds session line limit: ${lineCount} > ${maxLines}`, 'operations', opts, 'governance');
    }
  }

  const sessionsDir = path.join(targetRoot, 'memory-bank/.local/SESSIONS');
  const sessionCount = walkFiles(sessionsDir, (filePath) => filePath.endsWith('.md') && !filePath.endsWith('_template.md')).length;
  if (sessionCount > SESSION_FILE_LIMIT) {
    escalateWarning(
      results,
      'memory-bank/.local/SESSIONS',
      `session bloat detected: ${sessionCount} files (limit ${SESSION_FILE_LIMIT})`,
      'operations',
      opts,
      'governance'
    );
  }
}

function checkSecretPatterns(fileRecords, results) {
  for (const record of fileRecords.values()) {
    if (!record.relPath.startsWith('memory-bank/')) continue;
    if (record.relPath.startsWith('memory-bank/scripts/')) continue;
    if (record.relPath.includes('_template')) continue;
    if (SECRET_RE.test(record.content)) {
      addResult(results, 'errors', record.relPath, 'possible secret-like assignment detected', 'operations');
    }
  }
}

function checkStablePrivacyTags(fileRecords, results, opts) {
  for (const record of fileRecords.values()) {
    if (!shouldScanStablePrivacyTags(record.relPath)) continue;
    const sanitizedContent = record.content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]+`/g, '');
    if (PRIVACY_TAG_RE.test(sanitizedContent)) {
      escalateWarning(results, record.relPath, 'stable file contains <private> or <ephemeral> tags', 'operations', opts, 'governance');
    }
  }
}

function checkMarkdownLinks(targetRoot, fileRecords, results, scopeRoots) {
  const roots = scopeRoots || ['memory-bank', 'docs', 'README.md'];
  const markdownRoots = roots
    .map((entry) => path.join(targetRoot, entry))
    .filter((fullPath) => fs.existsSync(fullPath));

  const markdownFiles = new Set();
  for (const root of markdownRoots) {
    const stat = fs.statSync(root);
    if (stat.isDirectory()) {
      walkFiles(root, (filePath) => filePath.endsWith('.md')).forEach((file) => markdownFiles.add(file));
    } else if (stat.isFile()) {
      markdownFiles.add(root);
    }
  }

  for (const markdownFile of markdownFiles) {
    const relPath = path.relative(targetRoot, markdownFile);
    const content = fs.readFileSync(markdownFile, 'utf8');
    const refs = [...new Set([
      ...extractMarkdownTargets(content),
      ...(relPath === 'memory-bank/INDEX.md' ? extractIndexedPathRefs(content) : [])
    ])];

    for (const ref of refs) {
      if (!pathReferenceExists(targetRoot, markdownFile, ref)) {
        addResult(results, 'errors', relPath, `broken internal reference: ${ref}`, 'integrity');
      }
    }
  }
}

function checkAdrIntegrity(targetRoot, fileRecords, results, opts) {
  if (!profileAtLeast(opts.profile, 'extended')) {
    return;
  }

  const decisionsRecord = fileRecords.get('memory-bank/DECISIONS.md');
  if (!decisionsRecord) {
    return;
  }

  const decisionsContent = decisionsRecord.content;
  const adrFiles = [...fileRecords.values()].filter((record) => record.relPath.startsWith('memory-bank/ADR/') && !record.relPath.includes('template'));

  for (const adrRecord of adrFiles) {
    const basename = path.basename(adrRecord.relPath, '.md');
    const adrId = adrRecord.fields && adrRecord.fields.id ? adrRecord.fields.id : basename;
    if (!decisionsContent.includes(basename) && !decisionsContent.includes(adrId)) {
      escalateWarning(results, adrRecord.relPath, 'ADR file is not referenced in DECISIONS.md', 'integrity', opts, 'governance');
    }
  }

  const referencedAdrs = [...new Set(decisionsContent.match(/ADR-\d{3}[A-Za-z0-9-]*/g) || [])];
  for (const adrRef of referencedAdrs) {
    const exists = adrFiles.some((record) => path.basename(record.relPath, '.md') === adrRef || record.fields.id === adrRef);
    if (!exists) {
      escalateWarning(results, 'memory-bank/DECISIONS.md', `DECISIONS.md references missing ADR: ${adrRef}`, 'integrity', opts, 'governance');
    }
  }
}

function checkIndexRoutingReferences(fileRecords, results, opts) {
  if (!profileAtLeast(opts.profile, 'extended')) {
    return;
  }

  const indexRecord = fileRecords.get('memory-bank/INDEX.md');
  if (!indexRecord) return;

  const refs = extractIndexedPathRefs(indexRecord.content)
    .filter((ref) => ref.startsWith('memory-bank/') || ref.endsWith('.md') || ref.includes('*.md') || ref.includes('/*'));

  for (const ref of refs) {
    if (!pathReferenceExists(path.dirname(path.dirname(indexRecord.fullPath)), indexRecord.fullPath, ref)) {
      escalateWarning(results, 'memory-bank/INDEX.md', `INDEX.md references missing path: ${ref}`, 'integrity', opts, 'governance');
    }
  }
}

function dedupeResults(results) {
  const unique = (arr) => {
    const seen = new Set();
    return arr.filter((entry) => {
      const key = `${entry.check || ''}::${entry.file || ''}::${entry.message || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  results.errors = unique(results.errors);
  results.warnings = unique(results.warnings);
  results.ok = unique(results.ok);
}

function sortResults(results) {
  const byFile = (left, right) => {
    if (left.file === right.file) {
      return left.message.localeCompare(right.message);
    }
    return left.file.localeCompare(right.file);
  };

  results.errors.sort(byFile);
  results.warnings.sort(byFile);
  results.ok.sort((left, right) => left.file.localeCompare(right.file));
  results.skipped.sort((left, right) => left.file.localeCompare(right.file));
}

function runValidation(targetRoot, pkgRoot, rawOptions = {}) {
  const opts = getValidationOptions(rawOptions);
  const memoryBankDir = path.join(targetRoot, 'memory-bank');

  if (!fs.existsSync(memoryBankDir)) {
    const error = new Error(`memory-bank/ not found in: ${targetRoot}`);
    error.exitCode = 2;
    throw error;
  }

  const sourcePolicy = loadSourcePolicy(targetRoot);
  if (sourcePolicy) {
    opts.placeholderAllowlist = sourcePolicy;
  }

  const schemas = loadSchemas(targetRoot, pkgRoot);
  const results = { profile: opts.profile, scope: opts.scope, errors: [], warnings: [], ok: [], skipped: [] };
  const fileRecords = new Map();

  // ── memory scope ────────────────────────────────────────────────────────────
  if (opts.scope !== 'repo-docs') {
    const markdownFiles = walkFiles(memoryBankDir, (filePath) => filePath.endsWith('.md'), { skipDirs: new Set(['ARCHIVE']) });

    checkCoreFiles(targetRoot, results);

    for (const fullPath of markdownFiles) {
      const relPath = path.relative(targetRoot, fullPath);
      if (relPath.startsWith('memory-bank/.local/')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        fileRecords.set(relPath, { relPath, fullPath, content, fields: extractFrontMatter(content), lineCount: countLines(content) });
        if (!relPath.includes('_template')) {
          results.skipped.push({ file: relPath, reason: 'session file' });
        }
        continue;
      }

      if (relPath.startsWith('memory-bank/scripts/')) {
        continue;
      }

      const baseName = path.basename(relPath);
      if (baseName.startsWith('_') || relPath.includes('template')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        fileRecords.set(relPath, { relPath, fullPath, content, fields: extractFrontMatter(content), lineCount: countLines(content) });
        results.skipped.push({ file: relPath, reason: 'template file' });
        continue;
      }

      validateMarkdownFile(fullPath, targetRoot, schemas, opts, results, fileRecords);
    }

    checkSessionFiles(targetRoot, results, opts);
    checkSecretPatterns(fileRecords, results);
    checkStablePrivacyTags(fileRecords, results, opts);
    checkMarkdownLinks(targetRoot, fileRecords, results, ['memory-bank']);
    checkAdrIntegrity(targetRoot, fileRecords, results, opts);
    checkIndexRoutingReferences(fileRecords, results, opts);
  }

  // ── repo-docs scope ─────────────────────────────────────────────────────────
  if (opts.scope !== 'memory') {
    checkMarkdownLinks(targetRoot, fileRecords, results, ['docs', 'README.md']);
  }

  dedupeResults(results);
  sortResults(results);
  return results;
}

module.exports = {
  VALIDATION_PROFILES,
  VALIDATION_SCOPES,
  extractFrontMatter,
  runValidation
};
