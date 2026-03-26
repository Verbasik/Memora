---
title: "Lifecycle операций с памятью"
id: "memory-lifecycle"
type: "LIFECYCLE"
version: "1.0.0"
authority: "controlled"
status: "active"
pii_risk: "none"
ttl: null
tags: []
purpose: "Поддерживать память компактной, актуальной и проверяемой"
entrypoint: "AGENTS.md -> INDEX.md -> LIFECYCLE.md -> SKILL.md"
flow: ["/mb.bootstrap", "/mb.restore", "/mb.update", "/mb.consolidate", "/mb.reflect", "/mb.gc", "/mb.audit", "/mb.clarify"]
aliases:
  /mb.bootstrap: "memory-bootstrap"
  /mb.restore: "memory-restore"
  /mb.update: "update-memory"
  /mb.consolidate: "memory-consolidate"
  /mb.reflect: "memory-reflect"
  /mb.gc: "memory-gc"
  /mb.audit: "memory-audit"
  /mb.clarify: "memory-clarify"
invariants:
  - "CURRENT.md <= 80 lines"
  - "HANDOFF.md <= 40 lines"
  - "Стабильные знания пишутся только в канонические файлы"
  - "Конфликты с CONSTITUTION.md не промотируются автоматически"
  - "Секреты, токены, пароли, PII не записываются в память"
failure_routes:
  secret_like: "stop_promotion -> remediate -> /mb.audit"
  constitution_conflict: "human_review -> /mb.clarify"
  fact_conflict: "stop_promotion -> OPEN_QUESTIONS.md § Conflicts -> human_review"
  drift_detected: "/mb.audit -> /mb.update"
  double_reflect: "idempotent — reflect SKILL фильтрует уже помеченные сессии"
hooks:
  reflect_trigger:
    event: "Stop"
    script: "$(git rev-parse --show-toplevel)/memory-bank/scripts/check-reflect-trigger.sh"
    type: "advisory"
    blocking: false
    threshold_env: "REFLECT_THRESHOLD"
    threshold_default: 3
    adapters:
      claude: ".claude/settings.json → hooks.Stop"
      codex: ".codex/config.toml → run-stop-hooks.sh"
      qwen: ".qwen/settings.json → hooks.Stop"
      opencode: ".opencode/plugins/reflect-trigger.js → session.idle + tool.execute.after"
  consolidate_trigger:
    event: "Stop"
    script: "$(git rev-parse --show-toplevel)/memory-bank/scripts/check-consolidate-trigger.sh"
    type: "advisory"
    blocking: false
    threshold_env: "CONSOLIDATE_THRESHOLD"
    threshold_default: 5
    adapters:
      claude: ".claude/settings.json → hooks.Stop"
      codex: ".codex/config.toml → run-stop-hooks.sh"
      qwen: ".qwen/settings.json → hooks.Stop"
      opencode: ".opencode/plugins/consolidate-trigger.js → session.idle + tool.execute.after"
  gc_trigger:
    event: "Stop"
    script: "$(git rev-parse --show-toplevel)/memory-bank/scripts/check-gc-trigger.sh"
    type: "advisory"
    blocking: false
    threshold_env: "GC_THRESHOLD"
    threshold_default: 20
    adapters:
      claude: ".claude/settings.json → hooks.Stop"
      codex: ".codex/config.toml → run-stop-hooks.sh"
      qwen: ".qwen/settings.json → hooks.Stop"
      opencode: ".opencode/plugins/gc-trigger.js → session.idle + tool.execute.after"
---

# Lifecycle операций с памятью

Подробные шаги каждой команды описаны в соответствующем `SKILL.md`.
Этот файл задаёт порядок, контракты и ветки реакции.

## Hooks — детерминированные триггеры

Hooks — event-driven middleware для lifecycle pipeline. Они **детерминированны** (не зависят от LLM reasoning) и **advisory** (уведомляют, не блокируют).

### Три хука на Stop-событие

| Хук | Скрипт | Условие | Env-порог | Default |
|-----|--------|---------|-----------|---------|
| reflect | `check-reflect-trigger.sh` | Сессии без `<!-- reflected:` | `REFLECT_THRESHOLD` | 3 |
| consolidate | `check-consolidate-trigger.sh` | Сессии без `<!-- consolidated:` | `CONSOLIDATE_THRESHOLD` | 5 |
| gc | `check-gc-trigger.sh` | Всего файлов в SESSIONS/ | `GC_THRESHOLD` | 20 |

### Архитектура

`Stop → все три скрипта → каждый считает метрику → если ≥ порог → advisory → агент решает`

### Идемпотентность

Каждый хук advisory: он уведомляет, но не исполняет.
Соответствующий SKILL фильтрует уже обработанные сессии (по пометкам `reflected`/`consolidated`).
Повторный запуск SKILL безопасен — найдёт 0 новых кандидатов.

### Конфигурация по toolchains

| Toolchain | Механизм | Файл конфигурации | Хуки |
|---|---|---|---|
| Claude Code | Declarative hooks | `.claude/settings.json` | 3 команды в `hooks.Stop` |
| Qwen Code | Claude-like hooks | `.qwen/settings.json` | 3 команды в `hooks.Stop` |
| Codex CLI | Experimental hooks | `.codex/config.toml` | `run-stop-hooks.sh` (wrapper) |
| OpenCode | ES module plugins | `.opencode/plugins/` | 3 отдельных JS-плагина |

### Настройка порога

`export REFLECT_THRESHOLD=5` (или `--threshold N` при прямом вызове скрипта).

## /mb.restore
- when: начало каждой новой сессии (кроме первой); после перерыва в работе
- prereq: `/mb.bootstrap` уже выполнен; в `.local/` есть `HANDOFF.md` и/или `CURRENT.md`
- reads: `.local/HANDOFF.md`, `.local/CURRENT.md`, затем минимально релевантные файлы по INDEX.md
- writes: none (только чтение)
- success: контекст восстановлен; известны активные задачи, риски и следующие шаги; загружены только нужные файлы
- on_fail: если оба файла пустые → выполнить `/mb.bootstrap`

## /mb.bootstrap
- when: первый запуск агента в проекте; memory bank содержит только шаблонные плейсхолдеры; после `memora init`
- prereq: memory bank создан, но не заполнен (PROJECT.md содержит `[Название проекта]`)
- reads: кодовая база, README, package manifest, конфиги
- writes: `PROJECT.md`, `ARCHITECTURE.md`, `CONVENTIONS.md` (если определяемо), `TESTING.md` (если определяемо), `.local/CURRENT.md`, `.local/HANDOFF.md`, `OPEN_QUESTIONS.md`
- success: базовый контекст заполнен; предложены принципы для CONSTITUTION.md; зафиксированы open questions
- on_fail: если проект нераспознаваем -> записать всё что найдено, остальное в OPEN_QUESTIONS.md

## /mb.update
- when: после значимой задачи; перед завершением сессии
- prereq: есть новые факты, решения, изменения состояния
- writes: `.local/CURRENT.md`, `.local/HANDOFF.md`, при необходимости канонические файлы
- success: текущий контекст обновлён; лимиты соблюдены; устойчивые знания промотированы
- on_fail: при conflict или secret-like контенте остановить промоцию

## /mb.consolidate
- when: после нескольких сессий; еженедельно
- prereq: есть непромотированные знания в `SESSIONS/`
- writes: `DECISIONS.md`, `ADR/`, `PATTERNS/`, `AREAS/`, другие канонические файлы; при конфликте → `OPEN_QUESTIONS.md § Conflicts`
- success: знания перенесены; дубли и дрейф уменьшены; конфликты зафиксированы для ревью
- on_fail: при `FACT_CONFLICT` → записать в `OPEN_QUESTIONS.md § Conflicts`, не перезаписывать; при `CONSTITUTION_CONFLICT` → не перезаписывать, отправить на review

## /mb.reflect
- when: после накопления ≥ 2 непомеченных сессий; рекомендуется после `/mb.consolidate`; при поиске повторяющихся паттернов
- prereq: `/mb.consolidate` уже выполнен; в `SESSIONS/` есть ≥ 2 файла без пометки `reflected`
- reads: все `SESSIONS/` без пометки `reflected`; канонические файлы для проверки конфликтов
- writes: `PATTERNS/reflect-<тема>.md`, `ARCHITECTURE.md` (провенанс-комментарии), `DECISIONS.md` (статус 💡), `OPEN_QUESTIONS.md`; пометка `reflected` в сессионных файлах
- success: повторяющиеся паттерны синтезированы в инсайты; всем инсайтам присвоен confidence; источники зафиксированы (provenance)
- on_fail: если < 2 сессий без `reflected` → пропустить; при `CONSTITUTION_CONFLICT` → только в отчёт для human review

## /mb.gc
- when: ежемесячно; или если `SESSIONS/` > 20 файлов
- prereq: `/mb.consolidate` уже выполнен
- writes: архив/очистка `SESSIONS/`
- success: старые сессии архивированы; непромотированные знания не потеряны
- on_fail: если есть необработанные знания, вернуть управление в `consolidate`

## /mb.audit
- when: перед крупными задачами; еженедельно
- prereq: память доступна для проверки
- reads: вся структура memory-bank и связанные артефакты проекта
- success: выявлены дрейф, устаревание, дубли, secret-like записи, пробелы
- on_fail: при критических проблемах остановить промоцию и вызвать `clarify`

## /mb.clarify
- when: если `audit` нашёл пробелы, конфликты или неоднозначность
- prereq: есть конкретные точки неопределённости
- writes: список целевых вопросов или open issues
- success: сформированы вопросы, без которых нельзя надёжно продолжать
- on_fail: если вопросов нет, вернуть управление в `audit`

## Смежные паттерны
Confidence decay: `PATTERNS/confidence-decay.md`. Token-aware restore: `PATTERNS/progressive-disclosure.md`.