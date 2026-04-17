# 02. Runtime Core Requirements

## I1. Общий bridge contract

- **ID:** FR-001
- **Название:** Shared runtime bridge layer
- **Описание:** Система должна иметь общий исполняемый bridge-слой для orchestration runtime API, отделённый от markdown skills/commands и от vendor-specific adapter configs.
- **Источник / обоснование:** runtime API уже общий; дублирование по adapters повышает drift risk.
- **Приоритет:** Must
- **Критерий приемки:** существует единое место общего bridge orchestration; toolchain-specific code является thin adapter.
- **Примечания:** Рекомендуемое размещение: `lib/runtime/bridge/` или `lib/runtime/integrations/`.
- **Статус уверенности:** Assumption

- **ID:** FR-002
- **Название:** Session bootstrap orchestration
- **Описание:** Bridge должен уметь на старте runtime session вызывать `loadContextFile()`, `initSession()`, `openTranscriptSession()` и `ProviderRegistry.initializeAll()`.
- **Источник / обоснование:** `lib/runtime/index.js`
- **Приоритет:** Must
- **Критерий приемки:** integration test подтверждает ровно один bootstrap sequence per session.
- **Примечания:** `LocalMemoryProvider` должен использоваться как baseline provider.
- **Статус уверенности:** Fact

- **ID:** FR-003
- **Название:** Turn lifecycle orchestration
- **Описание:** Bridge должен уметь обрабатывать события начала и завершения хода, вызывая `onTurnStart()` и transcript sync (`appendTranscriptMessage()` или `syncAll()`).
- **Источник / обоснование:** lifecycle hooks и transcript API.
- **Приоритет:** Must
- **Критерий приемки:** по завершении тестового диалога transcript store содержит user/assistant pairs и provider diagnostics.
- **Примечания:** pre-turn recall должен идти через documented event surfaces.
- **Статус уверенности:** Fact

- **ID:** FR-004
- **Название:** Canonical write gate
- **Описание:** Любая bridge-интегрированная запись в canonical memory должна проходить через `checkMemoryWrite()` до выполнения записи и через `onMemoryWrite()` после успешной записи.
- **Источник / обоснование:** `docs/SECURITY.md`
- **Приоритет:** Must
- **Критерий приемки:** malicious payload блокируется до записи; safe payload пишет файл и вызывает post-write hook.
- **Примечания:** касается `update-memory`, `memory-bootstrap`, `memory-consolidate`, `memory-reflect`.
- **Статус уверенности:** Fact

- **ID:** FR-005
- **Название:** Graceful fallback
- **Описание:** При ошибке runtime bridge сессия должна продолжаться в markdown-only mode без аварийного завершения CLI агента.
- **Источник / обоснование:** failure isolation — одна из целей runtime.
- **Приоритет:** Must
- **Критерий приемки:** искусственная ошибка в bridge не завершает session process; пользователю показывается diagnostics.
- **Примечания:** fallback обязателен для всех toolchains.
- **Статус уверенности:** Assumption

- **ID:** FR-006
- **Название:** Toolchain source tagging
- **Описание:** Transcript sessions, созданные bridge, должны маркироваться `source` значением соответствующего toolchain: `claude`, `codex`, `qwen`, `opencode`.
- **Источник / обоснование:** schema `SessionRecord.source`.
- **Приоритет:** Must
- **Критерий приемки:** записи transcript sessions создаются с корректным `source`.
- **Примечания:** если toolchain id недоступен, используется fallback `unknown` и diagnostics.
- **Статус уверенности:** Fact

- **ID:** FR-007
- **Название:** Finalize strategy split between checkpoint and true close
- **Описание:** Спецификация должна явно разделять turn-level checkpoint events и true session close events; для каждого toolchain должен быть указан допустимый finalization path.
- **Источник / обоснование:** Claude/Qwen/OpenCode имеют true end events; Codex — нет.
- **Приоритет:** Should
- **Критерий приемки:** в design docs и adapter implementation нет подмены `Stop`/`idle` событием полноценного `SessionEnd`, если provider этого не гарантирует.
- **Примечания:** особенно важно для Codex CLI и OpenCode.
- **Статус уверенности:** Fact

## Связь с кодовой базой

На момент подготовки split-ТЗ в репозитории уже присутствуют:

- `lib/runtime/bridge/index.js`
- `test/runtime/bridge.test.js`

Это означает:

- FR-001 уже частично закрыт кодом и тестами;
- FR-002 и FR-003 имеют общую реализацию shared layer, но ещё не полностью wired во все toolchains;
- FR-004, FR-005, FR-006 и FR-007 требуют дальнейшего adapter-specific доведения.

## Следующий связанный документ

После этого файла следует читать:

- toolchain-specific integration sections;
- карту покрытия в [90_FR_COVERAGE.md](./90_FR_COVERAGE.md), если нужно быстро понять статус по FR-ID.

