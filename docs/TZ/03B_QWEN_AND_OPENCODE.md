# 03B. Qwen And OpenCode

## Qwen Code

### Event mapping — Qwen Code

| Событие | Факт / допущение | Runtime API | Где лучше разместить bridge-код |
|---|---|---|---|
| `SessionStart` | Fact | `loadContextFile()`, `initSession()`, `openTranscriptSession()`, provider init | Thin hook command в `.qwen/settings.json` → shared bridge module |
| `UserPromptSubmit` | Fact | `onTurnStart()`, `prefetchAll()` / `recallTranscripts()` | Thin hook command → shared bridge module |
| `PreToolUse` / `PostToolUse` | Fact | `checkMemoryWrite()`, `onMemoryWrite()`, transcript/tool diagnostics | Thin hook command → shared bridge module |
| `PreCompact` / `PostCompact` | Fact | `onPreCompress()` и optional post-compact sync | Thin hook command → shared bridge module |
| `SessionEnd` | Fact | `onSessionEnd()`, `shutdownAll()` | Thin hook command → shared bridge module |
| `Stop` | Fact | turn-level checkpoint only | Thin hook command |

### Implementation examples — Qwen Code

Статус примеров:

- **Fact:** event fields и `hookSpecificOutput` соответствуют официальной документации Qwen hooks
- **Recommendation:** Node.js handlers ниже — рекомендованный Memora bridge pattern

#### Пример 1. `SessionStart` → bootstrap context

Источник: официальная документация Qwen Code hooks описывает `SessionStart` с полями `permission_mode`, `source`, `model`, `agent_type` и допускает `hookSpecificOutput.additionalContext`.

```js
// .qwen/hooks/session-start.js
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
    toolchain: 'qwen',
    projectDir,
    title: `Qwen Code (${payload.source || 'startup'})`,
    contextFiles: startupFiles,
    snapshotSources: startupFiles,
    registerLocalProvider: false,
    initializeProviders: false,
    openTranscriptSession: true,
  });

  if (result.additionalContext) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: result.additionalContext,
      },
    }) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`[memora-runtime] ${err.message}\n`);
  process.exit(1);
});
```

#### Пример 2. `UserPromptSubmit` → pre-turn recall

Источник: официальная документация Qwen hooks описывает `UserPromptSubmit` с полем `prompt` и `hookSpecificOutput.additionalContext`.

```js
function handleUserPromptSubmit(payload = {}, deps = {}) {
  const runtimeBridge = deps.bridge || require('../../lib/runtime').bridge;

  const result = runtimeBridge.prepareTurn({
    turnNumber: 1,
    userMessage: payload.prompt || '',
    recallQuery: payload.prompt || '',
    useProviderPrefetch: true,
    useDirectTranscriptRecall: true,
    prefetchOptions: { source: 'qwen' },
    recallOptions: { source: 'qwen', maxSessions: 3 },
  }, deps);

  if (!result.additionalContext) return null;

  return {
    decision: 'allow',
    reason: 'Prompt enriched with runtime recall',
    hookSpecificOutput: {
      additionalContext: result.additionalContext,
    },
  };
}
```

#### Пример 3. `PreToolUse` → screening с `permissionDecision`

Источник: официальная документация Qwen hooks описывает `PreToolUse` output через `hookSpecificOutput.permissionDecision`, `permissionDecisionReason`, `updatedInput`, `additionalContext`.

```js
const runtime = require('../../lib/runtime');

function handlePreToolUse(payload = {}) {
  const filePath = payload.tool_input?.file_path || '';
  const content = payload.tool_input?.content || '';

  const writesCanonicalMemory =
    /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/.test(filePath);

  if (!writesCanonicalMemory) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Not a canonical memory write',
      },
    };
  }

  const check = runtime.checkMemoryWrite(content);
  if (check.allowed) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Memora screening passed',
      },
    };
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Memora blocked write (${check.patternId || 'unknown_pattern'})`,
      additionalContext: 'Canonical memory write rejected by Memora runtime security screening.',
    },
  };
}
```

#### Пример 4. `PostToolUse` → audit successful canonical write

Источник: официальная документация Qwen hooks описывает `PostToolUse` с полями `tool_name`, `tool_input`, `tool_response`, `tool_use_id`.

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
    decision: 'allow',
    reason: 'Runtime observer recorded successful canonical write',
    hookSpecificOutput: {
      additionalContext: `Memora observed canonical write: ${filePath}`,
    },
  };
}
```

#### Пример 5. `PostToolUseFailure` → log failed write/edit attempt

Источник: официальная документация Qwen hooks описывает `PostToolUseFailure` с полями `tool_use_id`, `tool_name`, `tool_input`, `error`, `is_interrupt`.

```js
function handlePostToolUseFailure(payload = {}) {
  return {
    hookSpecificOutput: {
      additionalContext: `Memora observed failed ${payload.tool_name}: ${payload.error}`,
    },
  };
}
```

#### Пример 6. `PreCompact` → prepare compaction checkpoint

Источник: официальная документация Qwen hooks описывает `PreCompact` с полями `trigger`, `custom_instructions`.

```js
const runtime = require('../../lib/runtime');

function handlePreCompact(payload = {}) {
  runtime.onPreCompress([]);

  return {
    hookSpecificOutput: {
      additionalContext: `Memora pre-compact checkpoint (${payload.trigger})`,
    },
  };
}
```

#### Пример 7. `PostCompact` → archive generated summary

Источник: официальная документация Qwen hooks описывает `PostCompact` с полями `trigger`, `compact_summary`.

```js
function handlePostCompact(payload = {}) {
  return {
    hookSpecificOutput: {
      additionalContext: `Memora archived compact summary for ${payload.session_id}`,
    },
  };
}
```

#### Пример 8. `SessionEnd` → finalization

Источник: официальная документация Qwen hooks описывает `SessionEnd` с `reason = clear | logout | prompt_input_exit | bypass_permissions_disabled | other`.

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
      additionalContext: `Memora runtime finalized for Qwen session ${payload.session_id}`,
    },
  };
}
```

#### Пример 9. `Stop` → turn-level checkpoint only

Источник: официальная документация Qwen hooks описывает `Stop` с полями `stop_hook_active`, `last_assistant_message`.

```js
function handleStop(payload = {}) {
  if (payload.stop_hook_active) return null;

  return {
    decision: 'allow',
    reason: 'Stop checkpoint observed',
    hookSpecificOutput: {
      additionalContext: `Memora turn checkpoint for ${payload.session_id}`,
    },
  };
}
```

#### Пример 10. Конфигурация hook в `.qwen/settings.json`

Источник: официальная документация Qwen hooks показывает конфигурацию вида `hooks -> EventName -> matcher -> hooks -> command`.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/.qwen/hooks/session-start.js\"",
            "name": "memora-runtime-bootstrap",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

### Qwen FR

- **ID:** FR-301
- **Название:** Qwen native bootstrap bridge
- **Описание:** Для Qwen Code bootstrap runtime должен выполняться через native `SessionStart`, а не через launcher wrapper.
- **Источник / обоснование:** официальная документация Qwen Code hooks подтверждает `SessionStart`.
- **Приоритет:** Must
- **Критерий приемки:** запуск Qwen session инициирует runtime bootstrap и transcript source tagging `qwen` без wrapper.
- **Примечания:** `SessionStart` в Qwen документирован как session lifecycle event.
- **Статус уверенности:** Fact

- **ID:** FR-302
- **Название:** Qwen pre-turn recall bridge
- **Описание:** Для Qwen Code pre-turn recall должен выполняться через native `UserPromptSubmit`.
- **Источник / обоснование:** официальная документация Qwen Code hooks подтверждает `UserPromptSubmit` и `hookSpecificOutput.additionalContext`.
- **Приоритет:** Must
- **Критерий приемки:** recall block инжектируется до model call.
- **Примечания:** `UserPromptSubmit` допускает validate/enrich path.
- **Статус уверенности:** Fact

- **ID:** FR-303
- **Название:** Qwen true session finalization
- **Описание:** Для Qwen Code финализация runtime должна выполняться через `SessionEnd`, а не через `Stop`.
- **Источник / обоснование:** официальная документация Qwen Code hooks подтверждает `SessionEnd`.
- **Приоритет:** Must
- **Критерий приемки:** по завершении Qwen session runtime state корректно закрывается через `onSessionEnd()` и `shutdownAll()`.
- **Примечания:** `Stop` может использоваться только как turn-level checkpoint.
- **Статус уверенности:** Fact

- **ID:** FR-304
- **Название:** Qwen write interception
- **Описание:** Canonical write workflow в Qwen должен использовать `PreToolUse` для screening и `PostToolUse` для post-write hook/sync.
- **Источник / обоснование:** официальная документация Qwen Code hooks подтверждает tool input/output interception.
- **Приоритет:** Must
- **Критерий приемки:** canonical write через Qwen workflow выполняет screening до записи и post-write hook после записи.
- **Примечания:** helper path может оставаться как backup path, но не как единственный механизм.
- **Статус уверенности:** Fact

## OpenCode

### Event mapping — OpenCode

| Событие | Факт / допущение | Runtime API | Где лучше разместить bridge-код |
|---|---|---|---|
| `session.created` | Fact | `loadContextFile()`, `initSession()`, `openTranscriptSession()`, provider init | `.opencode/plugins/runtime-bridge.ts` → shared bridge module |
| `chat.message` | Fact | `onTurnStart()`, `prefetchAll()` / `recallTranscripts()` | `.opencode/plugins/runtime-bridge.ts` |
| `experimental.chat.system.transform` | Fact | static/system-level context injection from runtime snapshot if needed | `.opencode/plugins/runtime-bridge.ts` |
| `tool.execute.before` | Fact | `checkMemoryWrite()` и tool-aware screening | `.opencode/plugins/runtime-bridge.ts` |
| `tool.execute.after` | Fact | `onMemoryWrite()`, transcript/tool diagnostics sync | `.opencode/plugins/runtime-bridge.ts` |
| `experimental.session.compacting` | Fact | `onPreCompress()` или compaction-context injection | `.opencode/plugins/runtime-bridge.ts` |
| `session.status` | Fact | checkpoint flush, busy/idle diagnostics | `.opencode/plugins/runtime-bridge.ts` |
| `session.deleted` | Fact | `onSessionEnd()`, `shutdownAll()` | `.opencode/plugins/runtime-bridge.ts` |
| `session.idle` | Fact | deprecated legacy event; не primary lifecycle anchor | Только backward-compat fallback |

### Implementation examples — OpenCode

Статус примеров:

- **Fact:** события `session.created`, `session.deleted`, `tool.execute.before`, `tool.execute.after` перечислены в официальной plugins documentation; `session.status` и deprecated `session.idle` подтверждены в официальном `session/status.ts`
- **Recommendation:** Memora plugin wiring ниже — рекомендуемая адаптация этих contracts под runtime bridge

#### Пример 1. `session.created` → bootstrap side effects

Источник: официальная документация OpenCode plugins перечисляет `session.created` как session event.

```ts
// .opencode/plugins/runtime-bridge.ts
import runtime from "../../lib/runtime/index.js"

export const MemoraRuntimePlugin = async (ctx: any) => {
  return {
    event: async ({ event }: any) => {
      if (event.type !== "session.created") return

      const projectDir = ctx.project?.worktree || ctx.directory || process.cwd()

      runtime.bridge.bootstrapSession({
        sessionId: event.properties?.sessionID || `opencode-${Date.now()}`,
        toolchain: "opencode",
        projectDir,
        title: "OpenCode session",
        contextFiles: [
          `${projectDir}/memory-bank/.local/CURRENT.md`,
          `${projectDir}/memory-bank/.local/HANDOFF.md`,
        ],
        snapshotSources: [
          `${projectDir}/memory-bank/.local/CURRENT.md`,
          `${projectDir}/memory-bank/.local/HANDOFF.md`,
        ],
        registerLocalProvider: true,
        initializeProviders: true,
        openTranscriptSession: false,
      })
    },
  }
}
```

#### Пример 2. `chat.message` → pre-turn recall

Источник: официальные plugin examples / type definitions OpenCode показывают hook `'chat.message': async ({}, { message, parts }) => { ... }`.

```ts
export const MemoraRuntimePlugin = async (_ctx: any) => {
  return {
    "chat.message": async ({}, output: any) => {
      const text = output?.message?.content || ""
      if (!text) return

      const result = runtime.bridge.prepareTurn({
        turnNumber: 1,
        userMessage: text,
        recallQuery: text,
        useProviderPrefetch: true,
        useDirectTranscriptRecall: true,
        prefetchOptions: { source: "opencode" },
        recallOptions: { source: "opencode", maxSessions: 3 },
      })

      if (!result.additionalContext) return

      output.parts = output.parts || []
      output.parts.unshift({
        type: "text",
        text: result.additionalContext,
      })
    },
  }
}
```

#### Пример 3. `tool.execute.before` → canonical write screening

Источник: официальная documentation и plugin examples показывают `tool.execute.before` с сигнатурой вида `async ({ tool }, { args }) => { ... }`.

```ts
export const MemoraRuntimePlugin = async () => {
  return {
    "tool.execute.before": async ({ tool }: any, output: any) => {
      const filePath = output?.args?.filePath || output?.args?.path || ""
      const content = output?.args?.content || ""

      const writesCanonicalMemory =
        /memory-bank\/(\.local\/CURRENT\.md|\.local\/HANDOFF\.md|DECISIONS\.md|ADR\/|PATTERNS\/)/.test(filePath)

      if (!writesCanonicalMemory) return

      const check = runtime.checkMemoryWrite(content)
      if (check.allowed) return

      throw new Error(`Memora blocked ${tool} (${check.patternId || "unknown_pattern"})`)
    },
  }
}
```

#### Пример 4. `tool.execute.after` → observe patch-based canonical writes

Источник:
- официальная plugins documentation перечисляет `tool.execute.after`
- официальная tools documentation отдельно фиксирует, что в `tool.execute.before` и `tool.execute.after` для `apply_patch` нужно проверять `input.tool === "apply_patch"` и использовать `output.args.patchText`

```ts
export const MemoraRuntimePlugin = async () => {
  return {
    "tool.execute.after": async (input: any, output: any) => {
      if (input.tool !== "apply_patch") return

      const patchText = output?.args?.patchText || ""
      if (!/memory-bank\//.test(patchText)) return

      runtime.onMemoryWrite("apply_patch", "memory-bank", patchText)
    },
  }
}
```

#### Пример 5. `experimental.session.compacting` → inject preserved runtime context

Источник: официальная plugins documentation показывает рабочие примеры `experimental.session.compacting` и отдельно документирует `output.context.push(...)`.

```ts
export const MemoraRuntimePlugin = async () => {
  return {
    "experimental.session.compacting": async (_input: any, output: any) => {
      output.context = output.context || []
      output.context.push(`
## Memora Runtime
- Canonical memory lives in memory-bank/
- Transcript recall is non-canonical
- Preserve current runtime-bridge progress and active files
`)
    },
  }
}
```

#### Пример 6. `session.status` и `session.deleted`

Источник:
- официальная plugins documentation перечисляет `session.deleted` и `session.status`
- официальный source file `packages/opencode/src/session/status.ts` публикует `session.status` и отдельно помечает `session.idle` как deprecated legacy event

```ts
export const MemoraRuntimePlugin = async () => {
  return {
    event: async ({ event }: any) => {
      if (event.type === "session.status") {
        const statusType = event.properties?.status?.type
        if (statusType === "idle") {
          console.log("[memora-runtime] OpenCode idle checkpoint")
        }
      }

      if (event.type === "session.deleted") {
        try {
          runtime.onSessionEnd([])
        } finally {
          runtime.getProviderRegistry().shutdownAll()
        }
      }
    },
  }
}
```

#### Пример 7. `session.idle` → legacy fallback only

Источник:
- официальная plugins documentation перечисляет `session.idle` среди session events
- официальный source file `packages/opencode/src/session/status.ts` помечает `session.idle` как deprecated и публикует `session.status` как primary status event

```ts
export const MemoraRuntimePlugin = async () => {
  return {
    event: async ({ event }: any) => {
      if (event.type !== "session.idle") return

      console.log("[memora-runtime] legacy idle signal observed")
    },
  }
}
```

### OpenCode FR

- **ID:** FR-401
- **Название:** OpenCode native plugin bridge
- **Описание:** Для OpenCode должен быть реализован first-class plugin bridge в `.opencode/plugins/`, использующий documented plugin hooks и session events.
- **Источник / обоснование:** официальная документация OpenCode plugins и plugin type definitions.
- **Приоритет:** Must
- **Критерий приемки:** plugin bridge обрабатывает поддерживаемые event payloads и вызывает shared runtime bridge без shell-wrapper dependency.
- **Примечания:** OpenCode является plugin-first integration path.
- **Статус уверенности:** Fact

- **ID:** FR-402
- **Название:** OpenCode pre-turn integration
- **Описание:** Для OpenCode pre-turn recall должен выполняться через `chat.message`; `experimental.chat.system.transform` должен использоваться только для system-level injection, а не как единственный источник prompt-dependent recall.
- **Источник / обоснование:** официальный plugin type surface OpenCode.
- **Приоритет:** Must
- **Критерий приемки:** recall block формируется на основе текущего пользовательского сообщения до model processing.
- **Примечания:** `experimental.chat.system.transform` уместен для session-global runtime context.
- **Статус уверенности:** Fact

- **ID:** FR-403
- **Название:** OpenCode true session finalization
- **Описание:** Для OpenCode финализация runtime должна выполняться через `session.deleted`, а не через `session.idle`.
- **Источник / обоснование:** официальная документация OpenCode перечисляет `session.deleted`; исходники подтверждают `session.status` как основной статусный event и помечают `session.idle` deprecated.
- **Приоритет:** Must
- **Критерий приемки:** plugin bridge использует `session.deleted` как final close event; `session.idle` не используется как единственный equivalent `onSessionEnd()`.
- **Примечания:** `session.status` и `session.idle` допустимы только для checkpoint/observability.
- **Статус уверенности:** Fact

- **ID:** FR-404
- **Название:** OpenCode checkpoint policy
- **Описание:** `session.status` должен быть primary checkpoint event для busy/idle transition handling; `session.idle` допускается только как backward-compatible legacy signal.
- **Источник / обоснование:** исходники OpenCode `SessionStatus` публикуют `session.status` и отдельно помечают `session.idle` deprecated.
- **Приоритет:** Must
- **Критерий приемки:** idle transition processing строится на `session.status`; использование `session.idle` не является обязательным для корректной работы.
- **Статус уверенности:** Fact

