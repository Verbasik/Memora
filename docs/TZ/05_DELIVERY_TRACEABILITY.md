# 05. Delivery And Traceability

## N. Бизнес-правила и ограничения

- **BR-001:** `memory-bank` остаётся canonical source of truth.
- **BR-002:** transcript memory не считается canonical knowledge.
- **BR-003:** recalled transcript content должно инжектиться только как fenced background context.
- **BR-004:** canonical writes через bridge должны проходить security screening до записи.
- **BR-005:** post-write provider hooks вызываются только после успешной записи.
- **BR-006:** runtime integration должна быть additive и совместимой с markdown-only workflows.
- **BR-007:** idle event не должен трактоваться как session end без подтверждённой semantics.
- **BR-008:** thin adapters не должны дублировать shared orchestration logic.
- **BR-009:** Claude/Qwen/OpenCode должны использовать documented native lifecycle surfaces прежде, чем рассматривать wrappers.

- **Constraint-001:** текущие Claude/Codex/Qwen adapter surfaces в repo различаются по lifecycle completeness.
- **Constraint-002:** runtime layer не intercepts writes автоматически; bridge обязан вызывать API явно.
- **Constraint-003:** default path должен оставаться zero-dependency и local-only.
- **Constraint-004:** OpenCode `session.idle` нельзя использовать как primary end-of-session signal.
- **Constraint-005:** Codex `PreToolUse`/`PostToolUse` нельзя считать универсальным replacement для explicit write helper.

## O. Допущения

1. **OpenCode plugin bridge можно делать first-class integration path.**
   Почему: в репозитории и provider docs уже есть JS plugin surface.
   Влияние: OpenCode становится первым кандидатом для production bridge.

2. **Codex hard-close strategy остаётся отдельным решением.**
   Почему: provider не подтверждает native `SessionEnd`.
   Влияние: `Stop` трактуется как checkpoint, а не guaranteed close.

3. **Shared bridge лучше держать в `lib/runtime/bridge/`.**
   Почему: уменьшает drift и дублирование.
   Влияние: задаёт каркас для adapters и tests.

4. **Bridge failure должен включать markdown-only fallback.**
   Почему: это safest backward-compatible mode.
   Влияние: нужны fallback logic и acceptance tests.

## P. Риски

| Risk | Вероятность | Влияние | Почему возникает | Митигация |
|---|---|---|---|---|
| Wrapper-based fallback для Codex окажется всё же нужен | Средняя | Высокое | нет native `SessionEnd` | держать optional hard-close strategy отдельно |
| OpenCode `session.idle` будет ошибочно использоваться как `session.end` | Средняя | Высокое | event visually похож на завершение | разделить checkpoint и final close |
| Bridge-логика попадёт в markdown skills и станет неуправляемой | Высокая | Среднее | skills уже используются как workflow surface | держать core bridge только в исполняемом коде |
| Runtime errors начнут ломать user sessions | Средняя | Высокое | bridge на critical path | обязательный graceful fallback |
| Unsafe writes будут проверяться только post-factum | Средняя | Высокое | temptation использовать только after-hooks | требовать pre-write helper / pre-tool gate |

## Q. Критерии приемки

На уровне системы:

- runtime bridge определён как отдельный shared executable layer;
- `memory-bank` не заменяется и не переписывается runtime layer;
- runtime integration сохраняет markdown-only fallback.

На уровне ключевых функций:

- bootstrap path вызывает `loadContextFile()`, `initSession()`, `openTranscriptSession()` и provider init;
- pre-turn path вызывает `onTurnStart()` и recall/prefetch;
- canonical writes проходят через `checkMemoryWrite()` до записи;
- post-write path вызывает `onMemoryWrite()` после успешного write;
- finalize path вызывает `onSessionEnd()` и `shutdownAll()` или documented checkpoint path.

На уровне интеграций:

- Claude имеет documented native hook design;
- Codex имеет documented native bootstrap/pre-turn design и explicit helper path;
- Qwen имеет documented native hook design;
- OpenCode имеет documented plugin-based bridge design.

## R. Open Questions

### Критические

- Поддерживает ли целевой production workflow Codex strict hard-close requirement или checkpoint semantics достаточно?
- Нужен ли Memora public API `closeTranscriptSession()`?
- Какая retention policy требуется для transcript store?

### Важные

- Нужно ли считать blocked canonical write hard-fail для user workflow?
- Нужен ли unified runtime diagnostics log file?
- Нужен ли mapping `external session id -> runtime session id` как отдельная persisted сущность?

## S. Предлагаемая структура этапов реализации

### Этап 1 — Shared Bridge MVP

- общий bridge module;
- общий write helper;
- stop/finalize helper;
- integration tests вокруг runtime API.

### Этап 2 — Native Hook Integration для Claude и Qwen

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse` / `PostToolUse`
- `SessionEnd`

### Этап 3 — OpenCode Plugin Integration

- plugin runtime bridge;
- `chat.message`
- `tool.execute.before/after`
- `session.status`
- `session.deleted`

### Этап 4 — Codex Finalization Strategy

- checkpoint semantics через `Stop`;
- при необходимости optional hard-close strategy.

### Этап 5 — Production Maturity

- parity tests;
- observability;
- adapter hardening;
- optional runtime API refinements.

## T. Матрица трассируемости

| ID требования | Связано с целью / проблемой | Связано с ролью пользователя | Приоритет | Критерий приемки |
|---|---|---|---|---|
| FR-001 | нужен единый runtime integration contract | Maintainer, Integrator | Must | существует shared bridge layer |
| FR-002 | runtime API сейчас не используется на старте сессии | Integrator, CLI Agent User | Must | bootstrap sequence выполняется один раз |
| FR-003 | нужен recall и transcript lifecycle в ходе сессии | CLI Agent User | Must | transcript sync и pre-turn recall работают |
| FR-004 | security layer opt-in и должен реально использоваться | Security Reviewer, Integrator | Must | unsafe write блокируется до записи |
| FR-101 | Claude поддерживает native SessionStart | Adapter Maintainer | Must | wrapper не требуется для bootstrap |
| FR-201 | Codex поддерживает native SessionStart | Adapter Maintainer | Must | wrapper не требуется для bootstrap |
| FR-205 | Codex hard-close strategy может потребоваться отдельно | Maintainer, Integrator | Should | chosen strategy documented |
| FR-301 | Qwen поддерживает native SessionStart | Adapter Maintainer | Must | wrapper не требуется для bootstrap |
| FR-401 | OpenCode имеет полноценный plugin bridge surface | Maintainer, Integrator | Must | plugin bridge реализован в `.opencode/plugins/` |
| FR-404 | OpenCode `session.status` primary, `session.idle` legacy | QA, Integrator | Must | idle не закрывает session prematurely |

## U. Итоговая оценка полноты ТЗ

Хорошо определено:

- текущее состояние runtime layer;
- текущее состояние adapters;
- event mapping для всех четырёх toolchains;
- provider-specific implementation examples;
- общая стратегия bridge placement.

Определено частично:

- Codex hard-close strategy;
- transcript retention policy;
- окончательная observability strategy;
- exact persistent session-id mapping.

Достаточно ли информации для старта разработки:

- **Да**, для shared bridge, Claude, Qwen и OpenCode.
- **Да, с оговоркой**, для Codex CLI: checkpoint semantics достаточно для старта, hard-close остаётся отдельным решением.

## Самопроверка

- ✅ требования сформулированы проверяемо
- ✅ факты и assumptions разделены
- ✅ scope / out of scope определены
- ✅ критерии приемки присутствуют
- ✅ интеграции и ограничения покрыты
- ⚠️ Codex hard-close semantics остаётся отдельным архитектурным вопросом

