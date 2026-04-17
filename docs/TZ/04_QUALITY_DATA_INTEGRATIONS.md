# 04. Quality, Data And Integrations

## J. Нефункциональные требования

### J1. Производительность

- **ID:** NFR-001
- **Категория:** Производительность
- **Описание:** Default bridge path не должен добавлять сетевые зависимости; bootstrap и transcript operations должны использовать локальный filesystem path.
- **Приоритет:** Must
- **Метрика / критерий:** в default configuration bridge не выполняет network calls; используется local JSONL backend.
- **Статус уверенности:** Fact

- **ID:** NFR-002
- **Категория:** Производительность
- **Описание:** Recall должен выполняться через уже реализованный zero-dep transcript path без обязательного внешнего summarizer.
- **Приоритет:** Must
- **Метрика / критерий:** `recallTranscripts()` работает без внешнего LLM/backend.
- **Статус уверенности:** Fact

### J2. Надежность и доступность

- **ID:** NFR-003
- **Категория:** Надежность и доступность
- **Описание:** Failure одного provider или bridge-step не должен аварийно завершать CLI session.
- **Приоритет:** Must
- **Метрика / критерий:** runtime failure переводит toolchain в fallback mode и логирует diagnostics.
- **Статус уверенности:** Assumption

- **ID:** NFR-004
- **Категория:** Надежность и доступность
- **Описание:** Transcript writes должны сохранять atomicity semantics уже реализованного JSONL store.
- **Приоритет:** Must
- **Метрика / критерий:** запись session metadata и messageCount использует существующие atomic write guarantees.
- **Статус уверенности:** Fact

### J3. Безопасность

- **ID:** NFR-005
- **Категория:** Безопасность
- **Описание:** Все bridge-driven canonical writes должны проходить через runtime screening.
- **Приоритет:** Must
- **Метрика / критерий:** malicious payload блокируется до write.
- **Статус уверенности:** Fact

- **ID:** NFR-006
- **Категория:** Безопасность
- **Описание:** Все bridge-driven prompt-adjacent file loads должны проходить через `loadContextFile()`.
- **Приоритет:** Must
- **Метрика / критерий:** blocked context file подменяется safe placeholder.
- **Статус уверенности:** Fact

### J4. Масштабируемость

- **ID:** NFR-007
- **Категория:** Масштабируемость
- **Описание:** Архитектура bridge должна поддерживать добавление новых toolchain adapters без копирования общей orchestration logic.
- **Приоритет:** Must
- **Метрика / критерий:** общий bridge-слой переиспользуется минимум двумя toolchains без fork логики.
- **Статус уверенности:** Assumption

### J5. Наблюдаемость и логирование

- **ID:** NFR-008
- **Категория:** Наблюдаемость и логирование
- **Описание:** Все bridge-операции должны возвращать или логировать diagnostics runtime API.
- **Приоритет:** Must
- **Метрика / критерий:** bootstrap, screening, transcript sync, finalize имеют диагностические сообщения.
- **Статус уверенности:** Fact

### J6. Совместимость

- **ID:** NFR-009
- **Категория:** Совместимость
- **Описание:** Интеграция должна быть совместима с Node.js >=16 и текущим no-external-dependencies подходом runtime layer.
- **Приоритет:** Must
- **Метрика / критерий:** bridge использует Node built-ins и existing runtime modules.
- **Статус уверенности:** Fact

- **ID:** NFR-010
- **Категория:** Совместимость
- **Описание:** Bridge не должен ломать текущие memory workflows, даже если runtime bridge отключён.
- **Приоритет:** Must
- **Метрика / критерий:** без bridge toolchain продолжает работать в текущем markdown-first режиме.
- **Статус уверенности:** Assumption

### J7. UX/UI

- **ID:** NFR-011
- **Категория:** UX/UI
- **Описание:** При blocked write или blocked context load пользователь/агент должен видеть краткое и однозначное diagnostics message.
- **Приоритет:** Must
- **Метрика / критерий:** сообщение содержит причину и не допускает silent failure.
- **Статус уверенности:** Fact

### J8. Поддерживаемость

- **ID:** NFR-012
- **Категория:** Поддерживаемость
- **Описание:** Toolchain-specific code должен быть thin adapter; runtime orchestration и write gating должны находиться в shared module.
- **Приоритет:** Must
- **Метрика / критерий:** в adapter-specific files отсутствует дублирование core lifecycle logic.
- **Статус уверенности:** Assumption

## K. Требования к данным

| Сущность | Назначение | Ключевые поля | Ограничения / валидация | Источник |
|---|---|---|---|---|
| RuntimeSessionContext | Сопоставление toolchain session и runtime session | `runtimeSessionId`, `toolchain`, `sources[]`, `startedAt`, `state` | `runtimeSessionId` обязателен; `toolchain` из allowlist | Bridge |
| Transcript SessionRecord | Метаданные transcript session | `sessionId`, `projectDir`, `source`, `startedAt`, `endedAt`, `messageCount`, `title` | `source ∈ {claude,codex,qwen,opencode,cli,test,unknown}` | `TranscriptStore` |
| Transcript MessageRecord | История ходов | `id`, `sessionId`, `role`, `content`, `toolName`, `toolCalls`, `timestamp`, `tokenCount` | `role ∈ {user,assistant,tool,system}` | `TranscriptStore` |
| CanonicalWriteEvent | Post-write notification | `action`, `target`, `content`, `allowed`, `patternId`, `reason` | write только при `allowed=true` | Bridge + runtime |
| RecallBlockMetadata | Метаданные recall injection | `type`, `source`, `query`, `createdAt`, `note` | fenced block обязателен | `buildRecallBlock()` |
| ProviderDiagnostics | Наблюдаемость | `provider`, `operation`, `message`, `severity`, `timestamp` | не должен ломать session flow | ProviderRegistry / Bridge |

Основные правила:

- context files загружаются через `loadContextFile()`;
- write content проходит через `checkMemoryWrite()`;
- transcript messages валидируются по роли и session id;
- recalled content должно быть fenced и sanitized;
- canonical memory и transcript memory хранятся раздельно.

## L. Интеграции и внешние зависимости

| ID | Система / сервис | Назначение | Направление обмена | Формат / протокол | Ограничения | Статус уверенности |
|---|---|---|---|---|---|---|
| INT-001 | Claude Code | CLI agent runtime | Bridge ↔ toolchain | hooks + local process | `SessionEnd` есть; wrapper не требуется | Fact |
| INT-002 | Codex CLI | CLI agent runtime | Bridge ↔ toolchain | TOML hooks + local process | нет подтверждённого `SessionEnd`; `PreToolUse`/`PostToolUse` фактически Bash-oriented | Fact |
| INT-003 | Qwen Code | CLI/IDE agent runtime | Bridge ↔ toolchain | hooks + local process | `SessionEnd` и pre-turn hooks подтверждены | Fact |
| INT-004 | OpenCode | Plugin-driven agent runtime | Plugin bridge ↔ runtime | JS plugin hooks/events | `session.idle` deprecated; final close надо строить от `session.deleted` | Fact |
| INT-005 | Local filesystem | Snapshot, transcript, canonical writes | двусторонний | Node fs / JSONL / Markdown | no-external-deps path | Fact |
| INT-006 | ProviderRegistry / LocalMemoryProvider | Runtime orchestration | bridge ↔ runtime | in-process JS API | требует явной инициализации | Fact |

## M. Интерфейсы и взаимодействие с пользователем

Ключевые точки взаимодействия:

- запуск toolchain через wrapper или plugin bridge;
- runtime bootstrap diagnostics;
- recall block injection как background context;
- blocked write / blocked context messages;
- stop/idle maintenance and finalize messages.

Важные состояния:

- `runtime active`
- `runtime fallback`
- `context file blocked`
- `memory write blocked`
- `transcript sync failed but session alive`
- `session finalized`
- `idle checkpoint only`

Ожидания к UX:

- runtime integration не должна менять привычный основной UX toolchain;
- при недоступности runtime сессия должна продолжаться;
- bridge diagnostics должны быть короткими и технически понятными.

