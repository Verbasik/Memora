# 01. Context And Scope

## A. Executive Summary

Нужно разработать **bridge-интеграцию runtime layer Memora** для четырёх toolchain-сценариев:

- Claude Code
- Codex CLI
- Qwen Code
- OpenCode

Цель: сделать так, чтобы уже реализованный runtime layer реально использовался в агентных CLI-сессиях, а не оставался только библиотечным API в `lib/runtime/index.js`.

Проблема:

- runtime layer уже реализован: security screening, frozen snapshots, transcript recall, provider lifecycle;
- текущие adapter surfaces Claude/Codex/Qwen/OpenCode в репозитории в основном используют `AGENTS.md`, `memory-bank/INDEX.md`, skills/commands и maintenance hooks;
- runtime API сейчас не вызывается автоматически в живых сессиях.

Ожидаемый результат:

- для каждого toolchain определён lifecycle integration contract;
- задано: какие события есть, какой runtime API вызывать и где размещать bridge-код;
- сохранён additive характер runtime layer;
- `memory-bank` остаётся canonical source of truth;
- transcript memory и runtime recall не смешиваются с canonical memory.

Ключевые ограничения:

- нельзя ломать текущие markdown-first workflows;
- нельзя трактовать transcript recall как canonical memory;
- нельзя подменять canonical memory transcript history;
- нельзя полагаться на недокументированные lifecycle events.

Ключевые риски:

- неправильная трактовка Codex `Stop` как гарантированного `SessionEnd`;
- попытка реализовать основную bridge-логику в markdown skills вместо исполняемого кода;
- неправильное использование OpenCode `session.idle`, хотя в исходниках оно уже помечено как deprecated;
- отсутствие единого shared bridge layer приведёт к drift между adapters.

Ключевые допущения:

- для Claude Code и Qwen Code достаточно native hooks, wrapper не требуется;
- для OpenCode достаточно native plugin bridge;
- для Codex CLI wrapper не нужен для bootstrap/pre-turn, но может понадобиться только если Memora потребует строгий process-exit finalization;
- общий bridge-слой лучше размещать в новом модуле, а не дублировать логику по adapter-файлам.

## B. Основание для подготовки ТЗ

Использованные материалы:

- `docs/HERMES_RUNTIME_LAYER_TZ.md`
- `lib/runtime/index.js`
- `docs/SECURITY.md`
- `docs/RUNTIME.md`
- `.claude/settings.json`
- `.codex/config.toml`
- `.qwen/settings.json`
- `.opencode/plugins/*.js`
- официальная документация Claude Code hooks
- официальный репозиторий `openai/codex` по hook surface
- официальная документация Qwen Code hooks
- официальная документация и исходники OpenCode plugins/event model

Из контекста извлечены цели и ожидания:

- runtime layer уже реализован и должен использоваться в агентных сценариях;
- `memory-bank` должен остаться canonical layer;
- runtime должен быть additive;
- нужны отдельные схемы интеграции по toolchain;
- интересует именно: события, runtime API, размещение bridge-кода.

Полнота контекста:

- высокая для текущего состояния Memora runtime API;
- высокая для фактического lifecycle surface Claude Code;
- высокая для фактического lifecycle surface Codex CLI;
- высокая для фактического lifecycle surface Qwen Code;
- высокая для OpenCode plugin/event model;
- средняя для policy-вопросов Memora, не покрываемых vendor docs.

Уверенно определённые зоны:

- runtime API уже реализован;
- security layer opt-in, а не auto-intercept;
- Claude Code поддерживает `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `SessionEnd`, `PreCompact`, `InstructionsLoaded`;
- Codex CLI поддерживает `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, но не подтверждает `SessionEnd`;
- Qwen Code поддерживает `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SessionEnd`, `PreCompact`, `PostCompact`;
- OpenCode поддерживает `session.created`, `session.deleted`, `session.status`, `tool.execute.before`, `tool.execute.after`, `chat.message`, `experimental.chat.system.transform`;
- в OpenCode `session.idle` уже помечен как deprecated в исходниках.

Зоны неопределённости:

- нужен ли Memora public API `closeTranscriptSession()` или достаточно текущих low-level/`onSessionEnd()` путей;
- требуется ли для Codex строгая finalization semantics при фактическом завершении процесса;
- какая retention policy требуется для transcript store;
- должен ли blocked canonical write считаться hard-fail или soft-fail для пользовательского workflow.

## C. Цели и бизнес-контекст

Бизнес-цели:

- превратить runtime layer из library surface в реально используемую operational capability;
- обеспечить единый lifecycle integration contract для всех поддерживаемых toolchains;
- усилить безопасность prompt-adjacent операций через обязательный runtime screening;
- сохранить совместимость с существующими markdown workflows.

Пользовательские цели:

- стартовать сессию с frozen snapshot, а не с “живого” mutable context;
- получать transcript recall внутри сессии без ручного чтения session files;
- не допускать небезопасных memory writes и небезопасной инъекции context files;
- завершать сессии с корректным flush transcript/provider state.

Ожидаемая ценность:

- выше предсказуемость поведения агентов;
- меньше потерь контекста между сессиями;
- ниже риск prompt injection через memory/context files;
- проще дальнейшее подключение внешних memory providers.

Критерии успеха проекта / функции:

- **Fact:** интеграция считается успешной, если каждый toolchain имеет документированный bridge lifecycle: bootstrap, pre-turn, memory write, compaction, stop/finalize.
- **Assumption:** для Codex CLI достаточно best-effort `Stop`-finalization, если не будет отдельного требования на process-exit cleanup.
  Влияние: определяет необходимость wrapper только для Codex.
  Как проверить: POC с реальными Codex session lifecycle сценариями.
- **Assumption:** OpenCode следует использовать как plugin-first integration path, а не как shell-wrapper path.
  Влияние: влияет на порядок реализации.
  Как проверить: pilot implementation в `.opencode/plugins/`.

## D. Scope

### D1. In Scope

- описание общего runtime bridge contract для Memora;
- описание интеграции по каждому toolchain:
  - Claude Code
  - Codex CLI
  - Qwen Code
  - OpenCode
- mapping `event -> runtime API -> bridge placement`;
- требования к общему shared bridge layer;
- требования к transcript/session lifecycle;
- требования к screening перед canonical writes и context injection;
- требования к graceful fallback при недоступности runtime;
- требования к тестированию и приёмке интеграции.

### D2. Out of Scope

- реализация нового runtime API внутри `lib/runtime/`;
- redesign `memory-bank` model;
- внедрение vector DB / FTS5 backend / external SaaS providers;
- изменение business logic existing skills beyond bridge integration;
- UI-дизайн вне CLI/plugin interaction;
- принятие policy-решения по transcript retention.

## E. Stakeholders и роли

| Роль / Стейкхолдер | Интерес | Что ожидает от системы | Уровень влияния |
|---|---|---|---|
| Maintainer Memora | Архитектурная целостность | Additive bridge без ломки current workflows | Высокий |
| Toolchain Adapter Maintainer | Совместимость adapters | Понятное место и способ подключения bridge-кода | Высокий |
| Runtime Integrator | Реализация bridge | Чёткий lifecycle contract и API mapping | Высокий |
| Security Reviewer | Защита prompt-adjacent surfaces | Обязательный screening перед writes/injection | Высокий |
| QA Engineer | Проверяемость | Testable acceptance criteria по каждому toolchain | Средний |
| CLI Agent User | Надёжность сессий | Recall, snapshot stability, безопасные memory writes | Средний |

## F. Термины и определения

- **Runtime Layer** — программный слой `lib/runtime/`, реализующий screening, snapshots, recall и providers.
- **Bridge-код** — исполняемый слой между toolchain lifecycle и runtime API.
- **Toolchain Adapter** — конфигурация и вспомогательные surfaces для конкретного инструмента: Claude/Codex/Qwen/OpenCode.
- **Canonical Memory** — `memory-bank/` как источник истины.
- **Transcript Memory** — runtime transcript store, отделённый от canonical memory.
- **Frozen Session Snapshot** — зафиксированный context state на старте сессии.
- **Prompt-adjacent file** — `AGENTS.md`, `CLAUDE.md` и аналогичные файлы, инжектируемые в prompt.
- **Canonical Write Event** — запись в `CURRENT.md`, `HANDOFF.md`, `DECISIONS.md`, `PATTERNS/` и т.д.
- **Bridge Placement** — место в кодовой базе, где лучше реализовать lifecycle integration.
- **Plugin Bridge** — нативный JS/plugin integration layer внутри toolchain ecosystem.
- **Checkpoint Event** — событие, подходящее для flush/diagnostics, но не гарантирующее окончательное завершение сессии.

## G. Пользователи и роли в системе

### G1. Maintainer Memora

- Кто это: владелец архитектуры Memora.
- Задачи: согласовать модель интеграции, не допустить деградации memory model.
- Права/ограничения: принимает архитектурные решения; не должен смешивать transcript и canonical memory.

### G2. Runtime Integrator

- Кто это: инженер, который внедряет bridge-логику.
- Задачи: связать lifecycle toolchain с `lib/runtime/index.js`.
- Права/ограничения: может добавлять hook adapters/plugins; не должен переносить bridge-логику в markdown skills как единственный механизм.

### G3. Adapter Maintainer

- Кто это: инженер, отвечающий за `.claude/`, `.codex/`, `.qwen/`, `.opencode/`.
- Задачи: встроить thin adapter hooks/plugins и связать их с shared bridge layer.
- Права/ограничения: не должен дублировать shared runtime orchestration в каждом adapter вручную.

### G4. QA / Security Reviewer

- Кто это: инженер проверки качества и безопасности.
- Задачи: проверять screening, fallback, transcript separation, event mapping.
- Права/ограничения: не определяет бизнес-архитектуру, но может блокировать опасную реализацию.

### G5. CLI Agent Runtime Consumer

- Кто это: сам агентный runtime в рамках toolchain.
- Задачи: читать context через bridge, писать transcript, вызывать recall.
- Права/ограничения: не должен писать в canonical memory без screening; не должен считать recalled transcript canonical truth.

## H. Основные пользовательские сценарии

Список ключевых сценариев:

- UC-01: bootstrap runtime при старте сессии
- UC-02: pre-turn recall и provider prefetch
- UC-03: безопасная запись canonical memory
- UC-04: transcript sync после хода
- UC-05: завершение/flush runtime session
- UC-06: compaction-aware runtime processing

### UC-01. Bootstrap runtime session

- Инициатор: `SessionStart` / `session.created`
- Предусловия: существует `AGENTS.md`, `memory-bank/`, доступен `lib/runtime/`
- Основной поток:
  1. Bridge читает/валидирует prompt-adjacent files через `runtime.loadContextFile()`.
  2. Bridge собирает sources для snapshot.
  3. Bridge вызывает `runtime.initSession()`.
  4. Bridge открывает transcript session через `runtime.openTranscriptSession()`.
  5. Bridge инициализирует provider registry.
- Альтернативные потоки:
  1. Runtime недоступен → логируется diagnostics → session идёт в markdown-only mode.
  2. Контекстный файл заблокирован → в prompt попадает safe placeholder.
- Результат: активна runtime session или включён safe fallback.

### UC-02. Pre-turn recall

- Инициатор: `UserPromptSubmit` / `chat.message`
- Предусловия: runtime session уже инициализирована
- Основной поток:
  1. Bridge вызывает `runtime.onTurnStart()`.
  2. Bridge получает recall через `registry.prefetchAll(query)` или `runtime.recallTranscripts(query)`.
  3. Recall block инжектится как background context.
- Альтернативные потоки:
  1. Нет совпадений → сессия продолжается без recall block.
  2. Provider error → diagnostics, ход продолжается.
- Результат: агент получает релевантный recalled context или пустой recall.

### UC-03. Canonical write с screening

- Инициатор: `update-memory`, `memory-bootstrap`, `memory-consolidate`, `memory-reflect`
- Предусловия: есть контент для записи в canonical memory
- Основной поток:
  1. Bridge вызывает `runtime.checkMemoryWrite(content)`.
  2. Если `allowed=true`, запись выполняется.
  3. После успеха вызывается `runtime.onMemoryWrite(action, target, content)`.
- Альтернативные потоки:
  1. Screening block → запись не выполняется; агент получает причину.
  2. Provider sync error → canonical write считается успешным, provider failure логируется отдельно.
- Результат: безопасная запись и синхронизация runtime observers.

### UC-04. Transcript sync после хода

- Инициатор: завершение model turn или tool execution
- Предусловия: transcript session открыта
- Основной поток:
  1. Bridge пишет user/assistant exchange через `appendTranscriptMessage()` или `registry.syncAll()`.
- Альтернативные потоки:
  1. Ошибка transcript store → diagnostics; основная сессия не прерывается.
- Результат: transcript history сохранена.

### UC-05. Session finalize

- Инициатор:
  - Claude/Qwen: `SessionEnd`
  - OpenCode: `session.deleted`
  - Codex: `Stop` как checkpoint, а не гарантированный close
- Предусловия: runtime session активна
- Основной поток:
  1. Bridge вызывает `runtime.onSessionEnd(messages)` на true end events.
  2. Bridge вызывает `registry.shutdownAll()`.
- Альтернативные потоки:
  1. Toolchain не даёт true end event → bridge выполняет flush checkpoint, но не final close.
- Результат: provider/session state корректно закрыт или сохранён checkpoint.

### UC-06. Compaction-aware runtime processing

- Инициатор: `PreCompact`, `PostCompact`, `experimental.session.compacting`
- Предусловия: session достигла compaction condition
- Основной поток:
  1. Bridge вызывает `runtime.onPreCompress(messages)` или compaction-aware equivalent.
  2. Toolchain продолжает compaction с injected context.
- Альтернативные потоки:
  1. Нет compaction support → runtime ничего не делает.
- Результат: runtime участвует в compaction без нарушения canonical memory model.

