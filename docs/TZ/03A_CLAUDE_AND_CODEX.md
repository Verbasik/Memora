# 03A. Claude And Codex

## Claude Code

### Event mapping — Claude Code

| Событие | Факт / допущение | Runtime API | Где лучше разместить bridge-код |
|---|---|---|---|
| `SessionStart` | Fact | `loadContextFile()`, `initSession()`, `openTranscriptSession()`; provider init остаётся следующим шагом | Реализовано: thin hook command в `.claude/settings.json` → `lib/runtime/bridge/claude.js` |
| `InstructionsLoaded` | Fact | observability only; optional diagnostics around instruction loads | Отдельный thin audit hook, без core orchestration |
| `UserPromptSubmit` | Fact | `onTurnStart()`, `prefetchAll()` / `recallTranscripts()` | Thin hook command → shared bridge module |
| `PreToolUse` для `Write|Edit|mcp__*` | Fact | `checkMemoryWrite()` и tool-aware screening | Thin hook command → shared bridge module |
| `PostToolUse` | Fact | `onMemoryWrite()` и transcript/tool diagnostics sync | Thin hook command → shared bridge module |
| `PreCompact` / `PostCompact` | Fact | `onPreCompress()` и optional post-compact diagnostics | Thin hook command → shared bridge module |
| `SessionEnd` | Fact | `onSessionEnd()`, `shutdownAll()` | Thin hook command → shared bridge module |
| `Stop` | Fact | turn-level checkpoint only, не final close | Thin hook command или existing maintenance wrapper |

### Implementation examples — Claude Code

Статус примеров:

- **Fact:** shape hook events, `stdin` JSON contract и `hookSpecificOutput` соответствуют официальной документации Claude Code hooks
- **Recommendation:** Node.js-реализация ниже адаптирована под структуру Memora и показывает рекомендованный bridge pattern

#### Пример 1. `SessionStart` → bootstrap context

Источник: официальная документация Claude Code hooks описывает общий input contract (`session_id`, `cwd`, `transcript_path`, `hook_event_name`) и разрешает возвращать `hookSpecificOutput.additionalContext` для `SessionStart`.

```js
// .claude/hooks/session-start.js
#!/usr/bin/env node
'use strict';

const { handleSessionStart } = require('../../lib/runtime/bridge/claude');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const { output } = handleSessionStart(payload);
  if (output) process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 2. `UserPromptSubmit` → pre-turn recall

Источник: официальная документация Claude Code hooks описывает `UserPromptSubmit` как pre-model hook и показывает JSON output с `hookSpecificOutput.additionalContext`.

```js
function handleUserPromptSubmit(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || require('../../lib/runtime').bridge;

  const result = runtimeBridge.prepareTurn({
    turnNumber: 1,
    userMessage: payload.prompt || '',
    recallQuery: payload.prompt || '',
    useProviderPrefetch: true,
    useDirectTranscriptRecall: true,
    prefetchOptions: { source: 'claude' },
    recallOptions: { source: 'claude', maxSessions: 3 },
  }, deps);

  if (!result.additionalContext) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: result.additionalContext,
    },
  };
}
```

#### Пример 3. `PreToolUse` → pre-write screening

Источник: официальная документация Claude Code hooks описывает `PreToolUse` input с `tool_name` и `tool_input`, а также JSON control через `hookSpecificOutput.permissionDecision`.

```js
const runtime = require('../../lib/runtime');

function handlePreToolUse(payload = {}) {
  const filePath = payload.tool_input?.file_path || '';
  const content = payload.tool_input?.content || '';

  const writesCanonicalMemory =
    /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/.test(filePath);

  if (!writesCanonicalMemory) return null;

  const check = runtime.checkMemoryWrite(content);
  if (check.allowed) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Memora runtime blocked write (${check.patternId || 'unknown_pattern'})`,
    },
  };
}
```

#### Пример 4. `PostToolUse` → post-write notification

Источник: официальная документация Claude Code hooks описывает `PostToolUse` input с `tool_name`, `tool_input`, `tool_response`, `tool_use_id` и разрешает возвращать `hookSpecificOutput.additionalContext`.

```js
const runtime = require('../../lib/runtime');

function handlePostToolUse(payload = {}) {
  const filePath = payload.tool_input?.file_path || '';
  const content = payload.tool_input?.content || '';

  const writesCanonicalMemory =
    /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/.test(filePath);

  if (!writesCanonicalMemory) return null;

  runtime.onMemoryWrite('replace', filePath, content);

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `Memora observed canonical write: ${filePath}`,
    },
  };
}
```

#### Пример 5. `PreCompact` → pre-compact checkpoint

Источник: официальная документация Claude Code hooks описывает `PreCompact` с полями `trigger` и `custom_instructions`.

```js
const runtime = require('../../lib/runtime');

function handlePreCompact(payload = {}) {
  runtime.onPreCompress([]);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext: `Memora pre-compact checkpoint (${payload.trigger})`,
    },
  };
}
```

#### Пример 6. `SessionEnd` → finalization

Источник: официальная документация Claude Code hooks описывает `SessionEnd` и перечисляет `reason` (`clear`, `logout`, `prompt_input_exit`, `other`).

```js
const runtime = require('../../lib/runtime');

function handleSessionEnd(payload = {}) {
  try {
    runtime.onSessionEnd([]);
  } finally {
    runtime.getProviderRegistry().shutdownAll();
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'SessionEnd',
      additionalContext: `Memora runtime finalized for Claude session ${payload.session_id}`,
    },
  };
}
```

#### Пример 7. `Stop` → turn-level checkpoint only

Источник: официальная документация Claude Code hooks описывает `Stop` с полями `stop_hook_active` и `last_assistant_message`.

```js
function handleStop(payload = {}) {
  if (payload.stop_hook_active) return null;

  process.stderr.write(
    `[memora-runtime] Claude turn checkpoint: ${payload.session_id}\n`
  );

  return null;
}
```

#### Пример 8. Конфигурация hook в `.claude/settings.json`

Источник: официальная документация Claude Code hooks показывает структуру `hooks -> EventName -> matcher -> hooks -> command`.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/.claude/hooks/session-start.js\""
          }
        ]
      }
    ]
  }
}
```

### Claude FR

- **ID:** FR-101
- **Название:** Claude native bootstrap bridge
- **Описание:** Для Claude Code bootstrap runtime должен выполняться через native `SessionStart`, а не через launcher wrapper.
- **Источник / обоснование:** официальная документация Claude Code hooks подтверждает `SessionStart` и `additionalContext`.
- **Приоритет:** Must
- **Критерий приемки:** запуск Claude session инициирует runtime bootstrap до первого model turn без внешнего wrapper.
- **Примечания:** Статус в репозитории: bootstrap уже реализован.
- **Статус уверенности:** Fact

- **ID:** FR-102
- **Название:** Claude pre-turn recall bridge
- **Описание:** Для Claude Code pre-turn recall должен выполняться через native `UserPromptSubmit`.
- **Источник / обоснование:** официальная документация Claude Code hooks подтверждает `UserPromptSubmit` и `additionalContext`.
- **Приоритет:** Must
- **Критерий приемки:** recall block может быть инжектирован в Claude context до обработки пользовательского prompt.
- **Примечания:** `UserPromptSubmit` также может блокировать опасные prompts при необходимости.
- **Статус уверенности:** Fact

- **ID:** FR-103
- **Название:** Claude true session finalization
- **Описание:** Для Claude Code финализация runtime должна выполняться через `SessionEnd`, а не через `Stop`.
- **Источник / обоснование:** официальная документация Claude Code hooks подтверждает `SessionEnd`; `Stop` относится к завершению ответа, а не обязательно всей сессии.
- **Приоритет:** Must
- **Критерий приемки:** при завершении Claude session вызываются `onSessionEnd()` и `shutdownAll()`, а `Stop` не используется как единственный session-close механизм.
- **Примечания:** существующие maintenance scripts можно вызывать после runtime finalization.
- **Статус уверенности:** Fact

- **ID:** FR-104
- **Название:** Claude canonical write interception
- **Описание:** Операции памяти в Claude workflows должны использовать `PreToolUse` для pre-write screening и `PostToolUse` для post-write runtime notifications.
- **Источник / обоснование:** официальная документация Claude Code hooks подтверждает interception для `Write`, `Edit` и других tool names.
- **Приоритет:** Must
- **Критерий приемки:** unsafe write через Claude tool path блокируется до изменения файла.
- **Примечания:** explicit helper path допускается как дополнительный safeguard.
- **Статус уверенности:** Fact

## Codex CLI

### Event mapping — Codex CLI

| Событие | Факт / допущение | Runtime API | Где лучше разместить bridge-код |
|---|---|---|---|
| `SessionStart` | Fact | `loadContextFile()`, `initSession()`, `openTranscriptSession()`, provider init | Thin hook command в `.codex/config.toml` → shared bridge module |
| `UserPromptSubmit` | Fact | `onTurnStart()`, `prefetchAll()` / `recallTranscripts()` | Thin hook command → shared bridge module |
| `PreToolUse` / `PostToolUse` | Fact | shell-oriented interception only; не основной universal write gate | Thin hook command, только для Bash-oriented checks |
| `Stop` | Fact | checkpoint flush, transcript sync, maintenance | Thin hook command → shared bridge module |
| true session close | Assumption | optional `onSessionEnd()` via wrapper or explicit end strategy | Only if strict final close required |

### Implementation examples — Codex CLI

Статус примеров:

- **Fact:** поля request payload и различия между `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop` соответствуют исходникам `codex-rs/hooks/src/events/*.rs`
- **Recommendation:** Node.js wiring ниже — рекомендованный Memora bridge pattern поверх этих source contracts

#### Пример 1. `SessionStart` → bootstrap context

Источник: `session_start.rs` в `openai/codex` подтверждает `SessionStartRequest` с полями `session_id`, `cwd`, `transcript_path`, `model`, `permission_mode`.

```js
// .codex/hooks/session-start.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const runtime = require('../../lib/runtime');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const projectDir = path.resolve(payload.cwd || process.cwd());
  const startupFiles = [
    'memory-bank/.local/CURRENT.md',
    'memory-bank/.local/HANDOFF.md',
  ]
    .map((rel) => path.join(projectDir, rel))
    .filter((abs) => fs.existsSync(abs));

  const result = runtime.bridge.bootstrapSession({
    sessionId: payload.session_id,
    toolchain: 'codex',
    projectDir,
    title: `Codex CLI (${payload.model || 'unknown-model'})`,
    contextFiles: startupFiles,
    snapshotSources: startupFiles,
    registerLocalProvider: false,
    initializeProviders: false,
    openTranscriptSession: true,
  });

  if (result.additionalContext) {
    process.stdout.write(JSON.stringify({
      additional_context: result.additionalContext,
    }) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 2. `UserPromptSubmit` → pre-turn recall

Источник: `user_prompt_submit.rs` в `openai/codex` показывает, что для `UserPromptSubmit` plain `stdout` трактуется как additional context, а JSON на stdout считается invalid output для этого hook.

```js
// .codex/hooks/user-prompt-submit.js
#!/usr/bin/env node
'use strict';

const runtime = require('../../lib/runtime');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const result = runtime.bridge.prepareTurn({
    turnNumber: 1,
    userMessage: payload.prompt || '',
    recallQuery: payload.prompt || '',
    useProviderPrefetch: true,
    useDirectTranscriptRecall: true,
    prefetchOptions: { source: 'codex' },
    recallOptions: { source: 'codex', maxSessions: 3 },
  });

  if (result.additionalContext) {
    process.stdout.write(result.additionalContext + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 3. `PreToolUse` → Bash-oriented command guard

Источник: `pre_tool_use.rs` в `openai/codex` показывает, что `PreToolUseRequest` сериализуется как `tool_name = "Bash"` и `tool_input.command = request.command`.

```js
// .codex/hooks/pre-tool-use.js
#!/usr/bin/env node
'use strict';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const command = payload.tool_input?.command || '';
  if (/^git push\b/.test(command)) {
    process.stderr.write('Memora blocked direct git push from Codex Bash hook\n');
    process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 4. Explicit write helper вместо универсального `PreToolUse`

Источник: `pre_tool_use.rs` и `post_tool_use.rs` подтверждают наличие hook surface, но текущий design Codex не должен использоваться как единственный middleware для canonical file writes.

```js
// .codex/hooks/memory-write-helper.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const runtime = require('../../lib/runtime');

function writeCanonicalFile(filePath, content) {
  const check = runtime.checkMemoryWrite(content);
  if (!check.allowed) {
    throw new Error(`Memora blocked write (${check.patternId || 'unknown_pattern'})`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  runtime.onMemoryWrite('replace', filePath, content);
}
```

#### Пример 5. `Stop` → checkpoint, а не true close

Источник: `stop.rs` в `openai/codex` подтверждает `StopRequest` с полями `session_id`, `turn_id`, `cwd`, `transcript_path`, `model`, `permission_mode`, `stop_hook_active`, `last_assistant_message`.

```js
// .codex/hooks/stop-checkpoint.js
#!/usr/bin/env node
'use strict';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  process.stderr.write(
    `[memora-runtime] Codex stop checkpoint for ${payload.session_id} (${payload.turn_id})\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 6. Конфигурация в `.codex/config.toml`

Источник: текущий публичный Codex hook surface experimental; shape request/response подтверждён source files, а TOML wiring следует держать минимальным и совместимым с текущей конфигурацией Memora.

```toml
[hooks.Stop]
command = "bash \"$(git rev-parse --show-toplevel)/memory-bank/scripts/run-stop-hooks.sh\""
```

### Codex FR

- **ID:** FR-201
- **Название:** Codex native bootstrap bridge
- **Описание:** Для Codex CLI bootstrap runtime должен выполняться через native `SessionStart`, а не через launcher wrapper.
- **Источник / обоснование:** официальный репозиторий `openai/codex` подтверждает `SessionStartRequest`.
- **Приоритет:** Must
- **Критерий приемки:** запуск Codex session создаёт runtime session и transcript session с `source=codex` без внешнего wrapper.
- **Примечания:** `SessionStartRequest` включает `session_id`, `cwd`, `transcript_path`, `model`, `permission_mode`.
- **Статус уверенности:** Fact

- **ID:** FR-202
- **Название:** Codex pre-turn recall bridge
- **Описание:** Для Codex CLI pre-turn recall должен выполняться через native `UserPromptSubmit`.
- **Источник / обоснование:** официальный репозиторий `openai/codex` подтверждает `UserPromptSubmitRequest` и `additional_contexts`.
- **Приоритет:** Must
- **Критерий приемки:** recall block инжектируется до обработки пользовательского prompt.
- **Примечания:** wrapper для этого не требуется.
- **Статус уверенности:** Fact

- **ID:** FR-203
- **Название:** Codex shell-only hook constraint
- **Описание:** Для Codex CLI `PreToolUse` и `PostToolUse` не должны считаться универсальным middleware для file-edit/canonical-write interception, потому что текущая hook implementation сериализует Bash-oriented payload.
- **Источник / обоснование:** официальный репозиторий `openai/codex` (`pre_tool_use.rs`, `post_tool_use.rs`) и tests suite.
- **Приоритет:** Must
- **Критерий приемки:** design не полагается на `PreToolUse`/`PostToolUse` как единственный gate для non-Bash writes.
- **Примечания:** explicit runtime-aware helper обязателен для canonical memory writes.
- **Статус уверенности:** Fact

- **ID:** FR-204
- **Название:** Codex checkpoint finalization
- **Описание:** Для Codex CLI `Stop` должен использоваться как end-of-turn checkpoint/flush, а не как гарантированный true session close.
- **Источник / обоснование:** в public hook config Codex подтверждены `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, но не `SessionEnd`.
- **Приоритет:** Must
- **Критерий приемки:** `Stop` path не объявляется истинным эквивалентом `SessionEnd`; документация явно помечает его как checkpoint.
- **Примечания:** если Memora потребует строгий process-exit cleanup, допускается optional thin wrapper только для Codex.
- **Статус уверенности:** Fact

- **ID:** FR-205
- **Название:** Codex optional hard-close strategy
- **Описание:** Если для Memora обязательно требуется вызов true session finalizer при завершении процесса Codex, система должна предусмотреть отдельную optional strategy: launcher wrapper или explicit end command.
- **Источник / обоснование:** отсутствие подтверждённого native `SessionEnd`.
- **Приоритет:** Should
- **Критерий приемки:** задокументирован выбранный путь hard-close для Codex либо формально зафиксировано, что `Stop` считается достаточным checkpoint-only behavior.
- **Примечания:** это не блокирует bootstrap/pre-turn integration.
- **Статус уверенности:** Assumption

