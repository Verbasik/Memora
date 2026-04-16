---
title: "MEMORY-MODEL — четырёхуровневая модель памяти"
id: "memory-model"
type: "LIFECYCLE"
version: "0.1.0"
authority: "controlled"
status: "active"
pii_risk: "none"
ttl: null
tags: ["onboarding", "architecture", "reference"]
last_verified: "2026-03-18"
max_lines: 160
---

# Memory Model

Эталонный документ по четырёхуровневой архитектуре памяти Memora.
Читай при первом знакомстве или когда неясно, куда записывать конкретный тип знания.

## Contract

- when: первый онбординг; вопрос «куда записать знание X»; проектирование нового типа карточки
- prereq: прочитан `AGENTS.md`
- reads: только этот файл; для routing rules — `INDEX.md`
- writes: none
- success: понятно, в какой тир попадает каждый тип знания; правила промоции ясны
- on_fail: если тип знания не вписывается -> `OPEN_QUESTIONS.md`; не изобретать новый тир

## The Four Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔒  STRUCTURAL MEMORY  ·  immutable / controlled  ·  permanent             │
│                                                                             │
│  CONSTITUTION.md · PROJECT.md · ARCHITECTURE.md · CONVENTIONS.md            │
│  TESTING.md                                                                 │
│                                                                             │
│  Кто пишет: человек + агент после human review                              │
│  Когда меняется: редко; только осознанные изменения проекта                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  💡  SEMANTIC MEMORY  ·  stable  ·  permanent                               │
│                                                                             │
│  FACTS/*.md · DECISIONS.md · ADR/*.md · PATTERNS/*.md · AREAS/*.md          │
│  POLICIES/*.md · AGENTS/*.md · TESTS/*.md                                   │
│                                                                             │
│  Кто пишет: агент через memory-consolidate / memory-reflect                 │
│  Когда меняется: при появлении подтверждённых знаний (confidence ≥ inferred)│
├─────────────────────────────────────────────────────────────────────────────┤
│  📖  EPISODIC MEMORY  ·  semi-stable  ·  ttl: 90d                           │
│                                                                             │
│  EPISODES/*.md · OPEN_QUESTIONS.md · CHANGELOG.md                           │
│                                                                             │
│  Кто пишет: агент после завершения сессии                                   │
│  Когда меняется: после каждой значимой сессии; устаревает через 90 дней     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ⚡  SESSION MEMORY  ·  volatile  ·  gitignored  ·  ttl: 1 session           │
│                                                                             │
│  .local/CURRENT.md  ·  .local/HANDOFF.md  ·  .local/SESSIONS/*.md           │
│                                                                             │
│  Кто пишет: агент в течение сессии                                          │
│  Когда меняется: постоянно; сбрасывается между сессиями                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Правило выбора тира

Задай три вопроса о знании:

| Вопрос | Да → | Нет → |
|--------|------|-------|
| Это принцип или инвариант проекта? | Structural | следующий вопрос |
| Это подтверждённый факт, решение или паттерн? | Semantic | следующий вопрос |
| Это запись прошедшего события? | Episodic | Session |

## Promotion Pipeline

Знание движется только вверх (Session → Semantic). Обратного движения нет.

```
.local/SESSIONS/*.md
    │
    │  memory-consolidate
    │  • conflict detection (A→B→C algorithm)
    │  • CONFLICT → OPEN_QUESTIONS.md § Conflicts
    ▼
EPISODES/*.md
    │
    │  memory-reflect
    │  • cluster by theme
    │  • confidence ≥ inferred (2 independent sessions)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
FACTS/*.md                        DECISIONS.md / PATTERNS/*.md
(factual assertions)              (architectural / reusable)
```

## Confidence Levels

Каждый FACT проходит три уровня верификации:

| Уровень | Условие | Действие |
|---------|---------|---------|
| `observed` | 1 сессия | Записать в FACTS/; не использовать как аксиому |
| `inferred` | 2 независимых сессии | Промотировать в Semantic; использовать с осторожностью |
| `confirmed` | 3+ сессий или human-review | Стабильный факт; использовать как истину |

Decay: `confirmed` >90д → `inferred`; `inferred` >60д → `observed`; `observed` >90д → `⚠️ STALE`. Reverification восстанавливает. Алгоритм: `PATTERNS/confidence-decay.md`.

## Security Invariants

Ни в одном тире НЕ хранится:

- API-ключи, токены, пароли, credentials
- PII (имена, email, телефоны, адреса) без явного `pii_risk: high` и согласия
- Сырой вывод терминала с секретами
- Временные ID сессий внешних систем

При обнаружении → немедленно удалить → `memory-audit` → проверить `.claudeignore`.

## Failure Routes

- Знание не вписывается ни в один тир → `OPEN_QUESTIONS.md`
- Конфликт между фактами → `OPEN_QUESTIONS.md § Conflicts` → human review
- Нарушение CONSTITUTION.md → `CONSTITUTION_CONFLICT` → остановить промоцию
- Стабильный файл не обновлялся > 60 дней → пометить для review в `memory-audit`

## Runtime Layer

`lib/runtime/` — аддитивный слой поверх четырёх тиров. Он не заменяет и не упрощает
canonical knowledge, а добавляет три отдельных домена:

| Домен | Где живёт | Назначение | Источник истины |
|---|---|---|---|
| **Canonical memory** | `memory-bank/` | Долговременные знания проекта | Да — единственный |
| **Transcript memory** | `lib/runtime/transcript/` | Журналы прошлых сессий для recall | Нет — не заменяет canonical |
| **Provider layer** | `lib/runtime/providers/` | Optional runtime backends и lifecycle | Нет — аддитивный слой |

**Ключевой инвариант:** transcript recall не является источником истины. Найденный
в transcript фрагмент может только *кормить* promotion pipeline — вручную, после
оценки confidence. Автоматической промоции из transcript в Semantic tier нет.

Компоненты runtime layer:

- **Phase 1 (Security)** — security screening writes + context files, frozen session
  snapshots, fenced recall blocks → `lib/runtime/security-scanner.js`, `snapshot.js`
- **Phase 2 (Transcript)** — JSONL TranscriptStore, recall pipeline, поиск по сессиям
  → `lib/runtime/transcript/`
- **Phase 3 (Providers)** — MemoryProvider contract, ProviderRegistry с failure
  isolation, LocalMemoryProvider → `lib/runtime/provider*.js`, `providers/`

Полный API: `docs/SERVICE.md`. Полный справочник: `docs/RUNTIME.md`.
