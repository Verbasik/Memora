# Memora — Полное руководство по сервису

Документ описывает функциональные возможности Memora: CLI-инструменты, runtime/recall layer и его публичный API.

---

## Содержание

- [Обзор](#обзор)
- [Установка и быстрый старт](#установка-и-быстрый-старт)
- [CLI-команды](#cli-команды)
- [Архитектура runtime layer](#архитектура-runtime-layer)
- [Phase 1 — Security API](#phase-1--security-api)
- [Phase 2 — Transcript API](#phase-2--transcript-api)
- [Phase 3 — Provider Registry API](#phase-3--provider-registry-api)
- [LocalMemoryProvider](#localmemorprovider)
- [Написание собственного MemoryProvider](#написание-собственного-memoryprovider)
- [Полные примеры](#полные-примеры)
- [Форматы данных](#форматы-данных)

---

## Обзор

Memora — это инструментарий для организации структурированной памяти AI-агентов. Он состоит из двух слоёв:

1. **Knowledge layer** (`memory-bank/`) — canonical markdown-файлы: PROJECT.md, ARCHITECTURE.md, DECISIONS.md и другие. Это источник истины о проекте.
2. **Runtime layer** (`lib/runtime/`) — программный слой поверх knowledge layer. Отвечает за безопасность записей в память, хранение транскриптов сессий, поиск по прошлым сессиям и lifecycle-оркестрацию провайдеров.

```
┌────────────────────────────────────────────────┐
│ knowledge layer  (memory-bank/)                │
│   PROJECT.md · ARCHITECTURE.md · DECISIONS.md  │
│   CONVENTIONS.md · TESTING.md · .local/        │
├────────────────────────────────────────────────┤
│ runtime layer  (lib/runtime/)                  │
│   Security screening   — Phase 1               │
│   Transcript store     — Phase 2               │
│   Provider registry    — Phase 3               │
└────────────────────────────────────────────────┘
```

Два слоя строго разделены: runtime layer не пишет в `memory-bank/` и не подменяет promotion pipeline.

---

## Установка и быстрый старт

### Требования

| Зависимость | Версия |
|---|---|
| Node.js | >= 16 |
| npm | 6+ |

Runtime layer использует только встроенные модули Node.js — внешних зависимостей нет.

### Установка CLI

```bash
# из пакета
npm install -g ./memora-cli-X.X.X.tgz

# из исходников
git clone <repo-url> && cd memora && npm link
```

### Инициализация проекта

```bash
memora init ./my-project
cd ./my-project
memora validate
memora doctor
```

### Подключение runtime layer в коде

```js
const runtime = require('memora/lib/runtime');
// или из репозитория:
const runtime = require('./lib/runtime');
```

---

## CLI-команды

### `memora init <dir>`

Создаёт scaffolded `memory-bank/` в целевой директории. Копирует все core-файлы, adapter-конфигурации (`.claude/`, `.agents/`, `.qwen/`, `.opencode/`) и pre-commit hooks.

```bash
memora init ./my-project
```

### `memora validate`

Проверяет целостность memory bank.

```bash
# базовая валидация
memora validate

# только memory-файлы (быстро, для pre-commit)
memora validate --scope memory

# только repo-docs (README, docs/)
memora validate --scope repo-docs

# строгий режим (рекомендован для команд)
memora validate --strict

# расширенный профиль
memora validate --profile extended
memora validate --profile governance

# live-режим
memora validate --watch

# JSON-вывод для CI
memora validate --json
```

Профили валидации:

| Профиль | Что проверяет |
|---|---|
| `core` | Front-matter обязательных полей, ссылочная целостность |
| `extended` | Всё из core + cross-file consistency |
| `governance` | Всё из extended + policy compliance |

### `memora doctor`

Диагностика health-состояния memory bank: отсутствующие файлы, устаревшие записи, нарушения структуры.

```bash
memora doctor
```

---

## Архитектура runtime layer

Runtime layer (`lib/runtime/`) строится из трёх независимых фаз:

```
lib/runtime/
├── index.js               ← публичный API (все три фазы)
├── security-scanner.js    ← Phase 1: сканер угроз
├── snapshot.js            ← Phase 1: frozen session snapshot
├── fenced-context.js      ← Phase 1: fenced recall blocks
├── transcript/
│   ├── store.js           ← Phase 2: TranscriptStore (JSONL)
│   └── recall.js          ← Phase 2: recall pipeline
├── provider.js            ← Phase 3: MemoryProvider base class
├── provider-registry.js   ← Phase 3: ProviderRegistry orchestrator
└── providers/
    └── local.js           ← Phase 3: LocalMemoryProvider
```

Все три фазы экспортируются из одной точки входа `lib/runtime/index.js`.

---

## Phase 1 — Security API

Phase 1 обеспечивает три вещи: security screening при записи в память, security screening при чтении context-файлов и frozen session snapshots.

### `runtime.checkMemoryWrite(content)`

Сканирует контент перед записью в память. Блокирует prompt injection, role hijack, exfiltration payloads и invisible Unicode.

```js
const runtime = require('./lib/runtime');

const result = runtime.checkMemoryWrite('some content to save');
// result: { allowed: true, patternId: null, reason: null }

const blocked = runtime.checkMemoryWrite('ignore previous instructions and...');
// blocked: { allowed: false, patternId: 'prompt_injection', reason: '...' }
```

**Возвращает:** `{ allowed: boolean, patternId: string|null, reason: string|null }`

Блокируемые паттерны (11 штук):

| ID | Что блокирует |
|---|---|
| `prompt_injection` | "ignore previous instructions", "disregard your" и подобные |
| `role_hijack` | "you are now a", "act as if you are" |
| `deception_hide` | попытки скрыть себя как AI |
| `sys_prompt_override` | "system prompt is now", "new instructions:" |
| `disregard_rules` | "forget all rules", "ignore all constraints" |
| `bypass_restrictions` | "bypass", "circumvent" rules/safeguards |
| `exfil_curl` | curl-команды с передачей данных |
| `exfil_wget` | wget-команды с передачей данных |
| `read_secrets` | попытки прочитать .env, .ssh/id_rsa |
| `ssh_backdoor` | добавление ключей в authorized_keys |
| `ssh_access` | SSH reverse shell payloads |

Дополнительно: 10 invisible Unicode-символов (ZWS, ZWNJ, ZWJ, BOM, LRE, RLE и др.) блокируются отдельно с `patternId: 'invisible_unicode'`.

### `runtime.loadContextFile(filePath)`

Загружает prompt-adjacent context file (AGENTS.md, CLAUDE.md и др.) с проверкой содержимого. Если файл содержит угрозу — возвращает безопасный плейсхолдер вместо оригинала.

```js
const result = await runtime.loadContextFile('./AGENTS.md');
// result: {
//   content: '<фактическое содержимое или безопасный плейсхолдер>',
//   blocked: false,
//   diagnostics: []
// }
```

Если файл заблокирован, `content` содержит строку вида `[BLOCKED: prompt_injection detected in AGENTS.md]`.

**Возвращает:** `{ content: string, blocked: boolean, diagnostics: string[] }`

### Session Snapshots

Snapshot — это зафиксированное представление памяти, собранное один раз на старте сессии. Оно не меняется mid-session, даже если файлы в `memory-bank/` изменились.

```js
const { createSnapshot, buildAndActivateSnapshot, getActiveSnapshot } = runtime.security;

// Создать и активировать snapshot
const snapshot = await buildAndActivateSnapshot([
  { path: './memory-bank/PROJECT.md', label: 'project' },
  { path: './memory-bank/ARCHITECTURE.md', label: 'architecture' }
]);

// Получить активный snapshot в любой момент сессии
const active = getActiveSnapshot();
// active.sessionId — уникальный ID сессии (формат: "20260416T143022-a3f1c9")
// active.sources — список загруженных файлов с содержимым
// active.createdAt — ISO timestamp

// Сброс (для тестов / следующей сессии)
runtime.security.resetActiveSnapshot();
```

`generateSessionId()` создаёт уникальный ID в формате `YYYYMMDDTHHMMSS-xxxxxx`.

### `runtime.buildRecallBlock(content, metadata)`

Оборачивает recalled content в канонический fenced block, предотвращая путаницу с user input.

```js
const block = runtime.buildRecallBlock(
  'Deployment process: run npm deploy.',
  { query: 'deployment', sessionCount: 2 }
);
// Возвращает:
// <memory_context type="recall" query="deployment" sessionCount="2">
// Deployment process: run npm deploy.
// </memory_context>
```

---

## Phase 2 — Transcript API

Phase 2 предоставляет JSONL-бекенд для хранения транскриптов сессий и recall pipeline.

### `runtime.openTranscriptSession(sessionId, meta?)`

Открывает новую сессию в transcript store.

```js
const session = runtime.openTranscriptSession('sess-001', {
  source: 'claude',       // 'claude'|'codex'|'qwen'|'opencode'|'cli'|'test'|'unknown'
  projectDir: '/path/to/project'
});
// session: { sessionId: 'sess-001', startedAt: '...', endedAt: null, ... }
```

### `runtime.appendTranscriptMessage(sessionId, message)`

Добавляет сообщение в сессию.

```js
runtime.appendTranscriptMessage('sess-001', {
  role: 'user',           // 'user'|'assistant'|'tool'|'system'
  content: 'How do I configure the runtime?'
});

runtime.appendTranscriptMessage('sess-001', {
  role: 'assistant',
  content: 'Read the RUNTIME.md documentation.'
});
```

### `runtime.recallTranscripts(query, options?)`

Поиск по прошлым сессиям. Возвращает релевантные фрагменты в fenced block.

```js
const result = runtime.recallTranscripts('runtime configuration', {
  maxSessions: 5,       // максимум сессий в результате (default: 5)
  source: 'claude'      // фильтр по toolchain (опционально)
});

// result: {
//   found: true,
//   block: '<memory_context type="recall" ...>...</memory_context>',
//   sessionCount: 2,
//   query: 'runtime configuration',
//   diagnostics: []
// }

if (result.found) {
  console.log(result.block); // готов к инъекции в system prompt
}
```

### Прямое использование TranscriptStore

```js
const { TranscriptStore } = runtime.transcriptStore;

const store = new TranscriptStore({
  dataDir: './my-data-dir'  // default: <cwd>/memory-bank/.local
});

// Открыть сессию
store.openSession('sess-001', { source: 'cli', projectDir: '/tmp' });

// Добавить сообщения
store.appendMessage('sess-001', { role: 'user', content: 'Hello' });
store.appendMessage('sess-001', { role: 'assistant', content: 'Hi!' });

// Прочитать
const messages = store.getMessages('sess-001');
const session = store.getSession('sess-001');

// Поиск
const hits = store.search('deployment process', { maxSessions: 3 });
// hits: [{ session: {...}, messages: [...] }, ...]

// Закрыть сессию
store.closeSession('sess-001');

// Список всех сессий
const all = store.listSessions();
```

Файлы данных создаются автоматически в `dataDir`:
- `transcript-sessions.jsonl` — метаданные сессий
- `transcript-messages.jsonl` — сообщения

Все записи используют атомарный write (tempfile + `os.rename`), защищённый от partial writes.

### Singleton управление

```js
// Получить синглтон TranscriptStore (lazy init)
const store = runtime.getTranscriptStore();

// Заменить синглтон (полезно в тестах)
runtime.resetTranscriptStore(customStore);
// или сбросить к null (следующий getTranscriptStore создаст новый)
runtime.resetTranscriptStore();
```

---

## Phase 3 — Provider Registry API

Phase 3 вводит архитектуру расширяемых провайдеров памяти с lifecycle оркестрацией.

### ProviderRegistry

Оркестратор, управляющий коллекцией провайдеров. Все операции защищены failure isolation — ошибка одного провайдера не прерывает остальных.

```js
const registry = runtime.getProviderRegistry();

// Добавить провайдер
registry.addProvider(myProvider);

// Инициализировать все провайдеры
const result = registry.initializeAll('session-id', {
  projectDir: '/path/to/project',
  source: 'claude'
});
// result: { initialized: ['local-transcript'], skipped: [], failed: [] }

// Синхронизировать turn со всеми провайдерами
registry.syncAll('user message', 'assistant reply');

// Завершить все сессии
registry.shutdownAll();

// Диагностика ошибок
console.log(registry.diagnostics); // массив строк с non-fatal ошибками
```

### Lifecycle hook wrappers (convenience API)

Удобные обёртки поверх registry, вызывающие хуки на всех зарегистрированных провайдерах:

```js
// Начало хода (turn N, последнее сообщение пользователя)
runtime.onTurnStart(3, 'user message text');

// Конец сессии
runtime.onSessionEnd(allMessages);

// Перед компрессией контекста (возвращает строку с важными данными)
const summary = runtime.onPreCompress(messages);
// summary: строки от всех провайдеров, объединённые "\n\n"

// При записи в память
runtime.onMemoryWrite('add', 'memory-bank/FACTS/foo.md', 'content');

// При делегировании субагенту
runtime.onDelegation('run tests', 'tests passed', { childSessionId: 'child-001' });
```

### Singleton управление

```js
// Получить синглтон ProviderRegistry
const reg = runtime.getProviderRegistry();

// Заменить синглтон (тесты / hot reload)
runtime.resetProviderRegistry(customRegistry);
// или сбросить к null
runtime.resetProviderRegistry();
```

---

## LocalMemoryProvider

Встроенный провайдер, соединяющий TranscriptStore и ProviderRegistry в единый автоматический lifecycle.

```js
const { LocalMemoryProvider } = runtime.localProvider;
const { TranscriptStore }     = runtime.transcriptStore;

// С инъецированным store (рекомендован для тестов)
const store = new TranscriptStore({ dataDir: './data' });
const provider = new LocalMemoryProvider({ store });

// С dataDir (store создаётся лениво при initialize)
const provider2 = new LocalMemoryProvider({ dataDir: './data' });

// Без аргументов (store использует default dataDir)
const provider3 = new LocalMemoryProvider();
```

### Интеграция в registry

```js
const registry = runtime.getProviderRegistry();
registry.addProvider(new LocalMemoryProvider({ store }));

// Инициализация открывает сессию в TranscriptStore
registry.initializeAll('sess-001', { projectDir: process.cwd(), source: 'claude' });

// syncAll автоматически пишет turns в store
registry.syncAll('user query', 'assistant response');

// onSessionEnd закрывает сессию в store
runtime.onSessionEnd([]);
```

### prefetch — автоматический recall

Когда агент инициализирован, `prefetch` автоматически ищет по прошлым сессиям:

```js
// Называется автоматически через registry.prefetchAll(query)
const block = provider.prefetch('deployment process');
// Возвращает fenced block если найдено, иначе ''
```

---

## Написание собственного MemoryProvider

`MemoryProvider` — базовый класс для создания custom провайдеров. Все методы имеют no-op defaults и могут быть выборочно переопределены.

```js
const { MemoryProvider } = require('./lib/runtime/provider');

class MyCustomProvider extends MemoryProvider {
  // Идентификатор провайдера (обязательно)
  get name() { return 'my-custom-provider'; }

  // Проверка доступности (default: true)
  isAvailable() {
    return Boolean(process.env.MY_BACKEND_URL);
  }

  // Инициализация при старте сессии (default: no-op)
  initialize(sessionId, opts) {
    this._sessionId = sessionId;
    this._client = createClient(process.env.MY_BACKEND_URL);
  }

  // Синхронизация turn (default: no-op)
  syncTurn(userContent, assistantContent, opts) {
    if (this._client) {
      this._client.appendTurn({ user: userContent, assistant: assistantContent });
    }
  }

  // Recall контекста (default: '')
  prefetch(query, opts) {
    if (!this._client) return '';
    const results = this._client.search(query);
    if (!results.length) return '';
    return buildRecallBlock(results.join('\n'), { query });
  }

  // Хук начала хода (default: no-op)
  onTurnStart(turnNumber, lastMessage) {
    console.log(`Turn ${turnNumber} started`);
  }

  // Хук конца сессии (default: no-op)
  onSessionEnd(messages) {
    if (this._client) {
      this._client.close(this._sessionId);
      this._sessionId = null;
    }
  }

  // Вклад в pre-compress summary (default: '')
  onPreCompress(messages) {
    return `[${this.name}] ${messages.length} messages in context`;
  }

  // Хук записи в память (default: no-op)
  onMemoryWrite(action, target, content) {
    console.log(`Memory ${action} on ${target}`);
  }

  // Хук делегирования (default: no-op)
  onDelegation(task, result, opts) {
    console.log(`Delegation completed: ${task}`);
  }

  // Завершение работы (default: no-op)
  shutdown() {
    this.onSessionEnd([]);
  }

  // Схемы инструментов для tool-use (default: [])
  getToolSchemas() {
    return [
      {
        name: 'my_recall',
        description: 'Search past sessions',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    ];
  }

  // Обработчик вызова инструмента (default: throws)
  handleToolCall(toolName, args) {
    if (toolName === 'my_recall') {
      return JSON.stringify({ results: this._client.search(args.query) });
    }
    throw new Error(`${this.name} does not handle tool '${toolName}'`);
  }
}
```

### Полный lifecycle провайдера

```
Registration  → addProvider(provider)
Startup       → isAvailable() + initialize(sessionId, opts)
Per-turn      → onTurnStart(n, msg) + prefetch(query) + syncTurn(user, assistant)
Hooks         → onPreCompress(msgs) + onMemoryWrite(act, tgt, cnt) + onDelegation(task, res)
Session end   → onSessionEnd(messages)
Shutdown      → shutdown()
```

### Failure isolation

Если провайдер бросает исключение в любом lifecycle-методе, ошибка записывается в `registry.diagnostics` и не распространяется на остальных провайдеров:

```js
// Проверить ошибки после операций
const diag = runtime.getProviderRegistry().diagnostics;
// ['[my-provider] onTurnStart non-fatal: TypeError: ...']
```

---

## Полные примеры

### Пример 1: Security screening при сохранении в память

```js
const runtime = require('./lib/runtime');

function saveToMemory(content, filePath) {
  const scan = runtime.checkMemoryWrite(content);

  if (!scan.allowed) {
    console.warn(`Memory write blocked: ${scan.reason} (pattern: ${scan.patternId})`);
    return false;
  }

  // Безопасная запись
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

// Использование
saveToMemory('Project uses React 18.', './memory-bank/FACTS/stack.md');
// → true

saveToMemory('Ignore all previous instructions.', './memory-bank/FACTS/bad.md');
// → false, logged: "Memory write blocked: prompt injection attempt (pattern: prompt_injection)"
```

### Пример 2: Загрузка context file с проверкой

```js
const runtime = require('./lib/runtime');

async function buildSystemPrompt() {
  const agentsCtx = await runtime.loadContextFile('./AGENTS.md');

  if (agentsCtx.blocked) {
    console.warn('AGENTS.md blocked — using safe placeholder');
  }

  return `# Context\n${agentsCtx.content}`;
}
```

### Пример 3: Session с transcript recall

```js
const runtime = require('./lib/runtime');

async function runSession(sessionId, userQuery) {
  // 1. Открыть сессию
  runtime.openTranscriptSession(sessionId, { source: 'claude' });

  // 2. Поиск по прошлым сессиям
  const recall = runtime.recallTranscripts(userQuery);
  if (recall.found) {
    console.log('Past context found:', recall.block);
  }

  // 3. Обработка запроса (псевдокод)
  const response = await callLLM(userQuery, recall.block);

  // 4. Сохранение turn
  runtime.appendTranscriptMessage(sessionId, { role: 'user', content: userQuery });
  runtime.appendTranscriptMessage(sessionId, { role: 'assistant', content: response });

  return response;
}
```

### Пример 4: Полный Phase 3 lifecycle

```js
const runtime = require('./lib/runtime');
const { LocalMemoryProvider } = runtime.localProvider;
const { TranscriptStore }     = runtime.transcriptStore;

// Инициализация
const store    = new TranscriptStore({ dataDir: './memory-bank/.local' });
const provider = new LocalMemoryProvider({ store });
const registry = runtime.getProviderRegistry();

registry.addProvider(provider);
registry.initializeAll('sess-001', { projectDir: process.cwd(), source: 'claude' });

// --- Работа агента ---

// Начало каждого хода
runtime.onTurnStart(1, 'user message here');

// Recall перед ответом
const ctx = registry.prefetchAll('deployment process');

// После получения ответа — синхронизация
registry.syncAll('user message here', 'assistant reply here');

// При записи в память
runtime.onMemoryWrite('add', 'memory-bank/FACTS/deploy.md', 'deploy: npm run deploy');

// При делегировании субагенту
runtime.onDelegation('run tests', 'all tests passed', { childSessionId: 'child-001' });

// Перед компрессией контекста
const summary = runtime.onPreCompress(messages);
// summary будет включён в компрессированный контекст

// --- Конец сессии ---
runtime.onSessionEnd(allMessages);
```

### Пример 5: Тестовая изоляция

```js
const runtime  = require('./lib/runtime');
const os       = require('os');
const path     = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
const store  = new (runtime.transcriptStore.TranscriptStore)({ dataDir: tmpDir });

// Изолированный registry для теста
runtime.resetProviderRegistry();
runtime.resetTranscriptStore(store);

// ... тест ...

// Сброс после теста
runtime.resetProviderRegistry();
runtime.resetTranscriptStore();
fs.rmSync(tmpDir, { recursive: true, force: true });
```

---

## Форматы данных

### SessionRecord

```js
{
  sessionId:    string,   // уникальный ID сессии
  projectDir:   string,   // рабочая директория
  source:       string,   // 'claude'|'codex'|'qwen'|'opencode'|'cli'|'test'|'unknown'
  startedAt:    string,   // ISO 8601 timestamp
  endedAt:      string|null, // null если сессия ещё открыта
  messageCount: number,   // количество сообщений
  title:        string|null  // опциональный заголовок
}
```

### MessageRecord

```js
{
  id:         string,   // UUID сообщения
  sessionId:  string,   // ID сессии
  role:       string,   // 'user'|'assistant'|'tool'|'system'
  content:    string,   // текст сообщения
  toolName:   string|null,  // имя инструмента (для tool messages)
  toolCalls:  object|null,  // JSON tool calls
  timestamp:  string,   // ISO 8601
  tokenCount: number|null   // опциональный счётчик токенов
}
```

### RecallResult

```js
{
  found:        boolean,  // найдены ли результаты
  block:        string,   // fenced block для инъекции ('' если не найдено)
  sessionCount: number,   // количество найденных сессий
  query:        string,   // исходный запрос
  diagnostics:  string[]  // non-fatal предупреждения
}
```

### SecurityScanResult

```js
// checkMemoryWrite / scanMemoryContent
{
  blocked:   boolean,
  patternId: string|null,  // ID паттерна из таблицы угроз
  reason:    string|null   // человекочитаемое описание
}

// loadContextFile / scanContextContent
{
  blocked:   boolean,
  patternId: string|null,
  reason:    string|null,
  sanitized: string        // безопасная версия контента
}
```

### Fenced recall block format

```
<memory_context type="recall" query="..." sessionCount="N">
[Session: sess-001 | 2026-04-15 | source: claude]
────────────────────────────────────────────────
User: How do I configure the runtime?
Assistant: Read the RUNTIME.md documentation.
────────────────────────────────────────────────
</memory_context>
```

---

## Ограничения и known degraded modes

| Ситуация | Поведение |
|---|---|
| Transcript store недоступен | `recallTranscripts` возвращает `{ found: false, block: '' }` |
| Провайдер бросает исключение | Ошибка в `registry.diagnostics`, остальные провайдеры продолжают работу |
| Context file заблокирован | `loadContextFile` возвращает безопасный плейсхолдер, `blocked: true` |
| Memory write заблокирован | `checkMemoryWrite` возвращает `{ allowed: false }`, запись не происходит |
| Recall без совпадений | `recallTranscripts` возвращает `{ found: false, block: '' }` |
| LLM summarization | Не реализована (zero-dep constraint) — возвращаются structured excerpts |
| SQLite backend | Не реализован (zero-dep constraint) — используется JSONL |

---

## Публичный API — сводная таблица

| Функция | Фаза | Описание |
|---|---|---|
| `checkMemoryWrite(content)` | 1 | Security scan перед записью в память |
| `loadContextFile(filePath)` | 1 | Загрузка context file с security проверкой |
| `buildRecallBlock(content, meta)` | 1 | Обернуть контент в fenced block |
| `initSession(sessionId?, sources?)` | 1 | Создать frozen session snapshot |
| `getSession()` | 1 | Получить активный snapshot |
| `resetSession()` | 1 | Сбросить активный snapshot |
| `openTranscriptSession(id, meta?)` | 2 | Открыть сессию в TranscriptStore |
| `appendTranscriptMessage(id, msg)` | 2 | Добавить сообщение в сессию |
| `recallTranscripts(query, opts?)` | 2 | Поиск по transcript store |
| `getTranscriptStore()` | 2 | Получить singleton TranscriptStore |
| `resetTranscriptStore(store?)` | 2 | Заменить/сбросить singleton TranscriptStore |
| `getProviderRegistry()` | 3 | Получить singleton ProviderRegistry |
| `resetProviderRegistry(reg?)` | 3 | Заменить/сбросить singleton ProviderRegistry |
| `onTurnStart(n, msg, opts?)` | 3 | Fan-out хук начала хода |
| `onSessionEnd(messages)` | 3 | Fan-out хук конца сессии |
| `onPreCompress(messages)` | 3 | Fan-out + collect строк от провайдеров |
| `onMemoryWrite(act, tgt, cnt)` | 3 | Fan-out хук записи в память |
| `onDelegation(task, res, opts?)` | 3 | Fan-out хук делегирования |

---

*Последнее обновление: 2026-04-16 — Phase 3 complete, все три фазы задокументированы.*
