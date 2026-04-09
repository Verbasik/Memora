---
title: "CURRENT — текущее состояние работы"
type: "LOCAL"
authority: "free"
status: "active"
max_lines: 80
---

# CURRENT

> Лимит: 80 строк. Добавляй timestamped блоки, не перезаписывай чужие записи.

<!-- Блок: 2026-04-08 12:30 claude -->

Последнее обновление: 2026-04-08 — claude (update-memory)

## Статус
Ветка `feat/mempalace-integration` — Фазы 1 и 2 реализованы, запушены.
PR ожидает создания (gh CLI не установлен, нужно создать вручную).
Stop hook подтверждён в работе — блокировка при ≥ 20 exchanges работает корректно.

## Завершено в этой сессии
- [x] Анализ mempalace v3.0.0 → AREAS/mempalace-integration.md
- [x] Фаза 1: Layer 1.5 Essential Story в memory-restore + check-save-trigger.sh
- [x] Фаза 2: Wing/Hall/Room таксономия + entity-detect.py
- [x] Инфраструктура .local/ (CURRENT, HANDOFF, SESSIONS/_template, entities.json)
- [x] Портабельные пути хуков (CLAUDE_PROJECT_DIR вместо git rev-parse)
- [x] Fix: .gitignore паттерн .local/* для трекинга шаблонов

## Следующие шаги
1. Создать PR вручную: https://github.com/Verbasik/Memora/compare/develop...feat/mempalace-integration
2. Фаза 3 (опционально): Temporal KG (SQLite) для multi-agent state tracking
3. Запустить /memory-bootstrap для инициализации PROJECT.md, ARCHITECTURE.md

## Активные файлы
feat/mempalace-integration: .claude/settings.json, memory-bank/scripts/check-save-trigger.sh,
memory-bank/scripts/entity-detect.py, memory-bank/PATTERNS/wing-hall-room.md,
.claude/skills/memory-restore/SKILL.md, .claude/skills/update-memory/SKILL.md

## Checkpoint
2026-04-08

<!-- Блок: 2026-04-08 15:05 codex -->

Последнее обновление: 2026-04-08 15:05 — codex (context-restore по 5 коммитам)

## Статус
Ветка `feat/mempalace-integration` содержит более свежую активность, чем описано выше:
последние 5 коммитов сместили фокус на `memora_longmemeval` и benchmark/evaluation pipeline.

## Завершено в этой сессии
- [x] Восстановлен контекст по `memory-bank` и последним 5 git-коммитам
- [x] Выявлено расхождение: `CURRENT.md`/`HANDOFF.md` отстают от истории git
- [x] Подтверждено текущее направление: LongMemEval benchmark + verify Memora usage

## Актуальные изменения из git
- [x] `7a7d6c6` — двухфазный Memora pipeline: ingestion → memory-restore → answer
- [x] `3cb8750` — CLI judge (`evaluate.py`) и инкрементальная запись результатов
- [x] `83a18a8` — trace/verification Memora usage через JSON output
- [x] `c0b1b25` — переход Claude verification на `stream-json` + `Read,Glob,Bash`
- [x] `95c6a03` — fix judge command: убран `--allowedTools ""`, чтобы Claude judge не ломался

## Следующие шаги
1. Синхронизировать каноническую память проекта с benchmark-направлением, если оно становится основным треком
2. Прогнать benchmark/evaluate на реальных данных и зафиксировать результаты в memory-bank
3. Отдельно решить, промотировать ли benchmark-решения в `DECISIONS.md`/`PATTERNS/`

## Активные файлы
`memora_longmemeval/bench.py`, `memora_longmemeval/evaluate.py`,
`memora_longmemeval/agents/claude_cli.py`, `memora_longmemeval/agents/codex_cli.py`,
`memora_longmemeval/ingestor.py`, `memora_longmemeval/workspace.py`

## Риски
- `CURRENT.md` содержит исторический контекст про mempalace integration, но не покрывает benchmark-коммиты
- В рабочем дереве есть незакоммиченные изменения в `memory-bank/.local/*` и untracked `data/`, `mempalace/`, `results/`

## Анализ benchmark
- `longmemeval_oracle.json`: oracle retrieval, все `haystack_session_ids == answer_session_ids` (500/500), avg 1.9 сессии
- `session_adapter.py` протекает benchmark labels в agent-visible формат: `# evidence session` + `⭐` для `has_answer`
- `workspace.py` не копирует `memory-bank/scripts/knowledge_graph.py`, поэтому KG не участвует в runtime retrieval агента
- `memora_used` — нестабильная proxy-метрика; `stats.py` некорректно считает `-1` как отрицательную accuracy

<!-- Блок: 2026-04-09 01:35 codex -->

Последнее обновление: 2026-04-09 01:35 — codex (longmemeval implementation)

## Завершено в этой сессии
- [x] Убран leakage из `memora_longmemeval/session_adapter.py` (`answer_*`, `# evidence session`, `⭐`)
- [x] В `ingestor.py` добавлены хронологическая сортировка и нейтральный `CURRENT.md`
- [x] Добавлены benchmark modes: `flat-baseline`, `memora-min`, `memora-full`, `oracle`
- [x] `workspace.py` стал mode-aware; `memora-full` копирует runtime scripts
- [x] `evaluate.py` и `stats.py` отделяют `judge_error` от accuracy; отрицательная accuracy устранена
- [x] Логируются `retrieved_session_ids`; `stats.py` считает retrieval metrics если они доступны
- [x] Добавлен pytest-набор `memora_longmemeval/tests` — 11 tests passed

## Следующие шаги
1. Сделать judge calibration (`Codex o4-mini` vs official evaluator)
2. Скачать/подготовить `longmemeval_s_cleaned.json` и прогнать smoke-run на `flat-baseline` и `memora-min`
3. Только после этого запускать полный paired benchmark на 500 вопросах

<!-- Блок: 2026-04-09 09:55 codex -->

Последнее обновление: 2026-04-09 09:55 — codex (judge calibration)

## Завершено в этой сессии
- [x] Добавлен `memora_longmemeval/calibrate_judge.py` с командами `sample` и `compare`
- [x] Реализована стратифицированная выборка по типам вопросов, включая `abstention`
- [x] Реализовано сравнение `reference` vs `candidate` логов с agreement-report и disagreement list
- [x] Добавлен runbook `docs/JUDGE_CALIBRATION.md` и ссылки из `docs/INDEX.md`/`LONGMEMEVAL_EXPERIMENT.md`
- [x] Добавлены тесты `memora_longmemeval/tests/test_calibrate_judge.py`
- [x] Smoke: `calibrate_judge.py sample data/longmemeval_oracle.json --sample-size 20` отработал успешно
- [x] Полная валидация: `python3 -m pytest memora_longmemeval/tests -q` → 14 passed

## Следующие шаги
1. Получить `data/longmemeval_s_cleaned.json` в рабочее дерево
2. Сгенерировать calibration sample на `s_cleaned` и сравнить `Codex o4-mini` против reference evaluator
3. После acceptance decision прогнать smoke-run `flat-baseline` vs `memora-min` на `s_cleaned`

## Ограничения
- Primary calibration пока не запускалась: в репозитории отсутствует `data/longmemeval_s_cleaned.json`
- Official evaluator / reference log пока не подготовлен, поэтому `compare` реализован, но не применён к реальным verdict-логам

<!-- Блок: 2026-04-09 10:10 codex -->

Последнее обновление: 2026-04-09 10:10 — codex (s_cleaned smoke + codex exec fix)

## Завершено в этой сессии
- [x] Скачан `data/longmemeval_s_cleaned.json` с HuggingFace
- [x] Сгенерирован calibration sample: `results/s_cleaned_judge_calibration_sample_150.json`
- [x] Исправлен `Codex` non-interactive path в `agents/codex_cli.py` и `evaluate.py`: теперь используется `codex exec`, а не интерактивный `codex`
- [x] End-to-end smoke на `s_cleaned` для `Codex o4-mini`:
  `flat-baseline` → `evaluate.py` → `stats.py --compare`
- [x] Подтверждено, что `Codex` judge теперь возвращает распознаваемый verdict вместо `unparsed_verdict`

## Следующие шаги
1. Подготовить reference evaluator log для calibration compare на `results/s_cleaned_judge_calibration_sample_150.json`
2. После calibration decision запустить paired smoke/full run на `Claude Haiku`
3. Отдельно решить trace/instrumentation для `Codex`, потому что `reads=0` и `memora_used=null` не позволяют анализировать retrieval usage

## Ограничения
- `claude` CLI в текущем окружении не авторизована: smoke на `Claude Haiku` возвращает `Not logged in · Please run /login`
- `Codex` smoke-cycle работает, но пока не доказывает retrieval benefit: на 1 вопросе `flat-baseline` и `memora-min` оба дали `I don't know`

<!-- Блок: 2026-04-09 10:25 codex -->

Последнее обновление: 2026-04-09 10:25 — codex (switch codex model to gpt-5.2)

## Завершено в этой сессии
- [x] Дефолтная модель `Codex` в `bench.py`, `evaluate.py`, `agents/codex_cli.py` переключена с `o4-mini` на `gpt-5.2`
- [x] Документация обновлена: `LONGMEMEVAL_EXPERIMENT.md`, `JUDGE_CALIBRATION.md`
- [x] Подтверждено прямым probe, что `codex exec --model gpt-5.2` поддерживается в текущем аккаунте
- [x] Smoke-eval для `Claude Haiku` на judge=`Codex gpt-5.2` успешен:
  `results/s_cleaned_flat_haiku_smoke_gpt52.log`,
  `results/s_cleaned_memora_min_haiku_smoke_gpt52.log`

## Наблюдения
- На 1 smoke-вопросе `flat-baseline` и `memora-min` оба дали correct answer, поэтому QA delta = 0
- Retrieval trace различается: `memora-min` нашёл gold session на `R@1=1.0`, `flat-baseline` только на `R@3`
