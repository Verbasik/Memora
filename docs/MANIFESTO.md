# AGENT MARKDOWN PROTOCOL MANIFESTO

## Единый протокол семантики, логики и архитектуры Markdown-инструкций для ИИ-агентов

### 1. Статус документа

Этот документ определяет предложенный открытый стандарт для проектирования markdown-инструкций, memory-bank систем и agent-oriented knowledge layouts.

Его цель — сделать инструкции для ИИ-агентов:

* однозначными;
* машиночитаемыми;
* переносимыми между toolchains;
* безопасными;
* пригодными для масштабирования;
* удобными для людей.

Этот стандарт предназначен для:

* AI agents;
* AI coding assistants;
* orchestration frameworks;
* memory banks;
* prompt registries;
* agent workflows;
* knowledge bases;
* engineering teams и open community.

---

## 2. Основной тезис манифеста

**Markdown для ИИ-агентов — это не текстовая документация. Это исполняемый семантический интерфейс между человеком, системой, памятью, workflow и агентом.**

Следовательно:

1. Markdown-файлы должны проектироваться не как prose-документы, а как **контрактные интерфейсы**.
2. Каждый файл должен иметь **одну чёткую роль**.
3. Каждый факт должен иметь **канонического владельца**.
4. Каждая инструкция должна быть **маршрутизируема, верифицируема и ограничена по области действия**.
5. Каждый агент должен читать **минимально достаточный** контекст, а не весь репозиторий. Это соответствует и лучшим практикам long-context prompting, и подходу к workflow-композиции с явными узлами, typed edges и ограничением невалидированного влияния данных на поведение агента. ([Claude API Docs][3])

---

## 3. Нормативные слова

Ключевые слова интерпретируются так:

* **MUST** — обязательно
* **MUST NOT** — запрещено
* **SHOULD** — рекомендуется
* **SHOULD NOT** — не рекомендуется
* **MAY** — допустимо

---

## 4. Базовые принципы стандарта

### 4.1. Principle of Minimal Relevant Context

Агент **MUST** читать только тот контекст, который нужен для текущей задачи.

Система памяти **MUST NOT** требовать чтения всего knowledge base “на всякий случай”.

Причина проста: при длинном контексте качество работы повышается, когда документы структурированы, отделены метаданными и подаются адресно, а не как неразмеченный монолит. ([Claude API Docs][3])

### 4.2. Principle of Canonical Ownership

Каждый вопрос, факт, правило, решение или паттерн **MUST** иметь один канонический файл-владелец.

Все остальные документы **SHOULD** ссылаться на владельца, а не копировать смысл заново.

### 4.3. Principle of Separation of Concerns

Семантика, lifecycle, routing, policy, project knowledge, local state и workflow registry **MUST** быть разделены.

Нельзя смешивать:

* правила и текущее состояние;
* архитектуру и handoff;
* decisions и open questions;
* conventions и lifecycle.

### 4.4. Principle of Structured Parseability

Инструкции **MUST** быть структурированы так, чтобы их одинаково хорошо читали:

* человек;
* LLM;
* parser;
* orchestration system;
* eval pipeline.

Именно поэтому структурные блоки, последовательные названия секций, вложенность и единообразие полезны практически у разных провайдеров и инструментов. ([Claude API Docs][1])

### 4.5. Principle of Explicit Authority

Каждый документ **MUST** явно указывать свой уровень authority:

* immutable;
* controlled;
* free;
* ephemeral.

Это согласуется с тем, что агентные системы вообще устойчивее, когда цепочка инструкций и уровни приоритета определены явно. ([model-spec.openai.com][4])

### 4.6. Principle of Failure Visibility

У каждого важного действия **MUST** быть:

* критерий успеха;
* ветка сбоя;
* safe fallback;
* правило эскалации.

### 4.7. Principle of Toolchain Portability

Содержательная семантика **MUST** быть независима от конкретного вендора.

Claude, OpenAI, Qwen, Codex, OpenCode, MCP-клиенты и другие системы **MAY** использовать разные adapters, но каноническая логика **MUST** оставаться единой. Это особенно важно в мире, где промпты и агентные workflows версионируются, публикуются и исполняются в разных окружениях. ([platform.openai.com][5])

---

## 5. Архитектурная модель markdown-системы

Полноценная agent-friendly markdown-архитектура **MUST** состоять из следующих уровней.

### 5.1. Entrypoint layer

Файлы входа в систему:

* `AGENTS.md`
* `INDEX.md`

Их задача:

* объяснить, как читать систему;
* задать порядок входа;
* включить маршрутизацию.

### 5.2. Policy layer

Файлы правил:

* `CONSTITUTION.md`
* `LIFECYCLE.md`

Их задача:

* определить инварианты;
* определить запреты;
* определить allowed behavior;
* определить lifecycle и remediation paths.

### 5.3. Knowledge layer

Файлы устойчивого знания:

* `PROJECT.md`
* `ARCHITECTURE.md`
* `CONVENTIONS.md`
* `TESTING.md`
* `DECISIONS.md`
* `ADR/*.md`
* `AREAS/*.md`
* `PATTERNS/*.md`

### 5.4. Operational layer

Файлы текущего и недавнего состояния:

* `.local/CURRENT.md`
* `.local/HANDOFF.md`
* `.local/SESSIONS/*`
* `CHANGELOG.md`
* `OPEN_QUESTIONS.md`

### 5.5. Registry layer

Файлы/блоки, которые связывают abstract command с конкретным vendor adapter:

* skills registry
* agents registry
* commands registry
* MCP prompt mapping

---

## 6. Обязательная форма каждого markdown-документа

Каждый важный markdown-файл стандарта **MUST** иметь две части:

### 6.1. YAML front matter

Он задаёт машиночитаемые метаданные.

Минимальный обязательный набор:

```yaml
---
title: "..."
purpose: "..."
entrypoint: "..."
---
```

Рекомендуемый расширенный набор:

```yaml
---
title: "..."
purpose: "..."
entrypoint: "..."
status: "draft|active|deprecated"
authority: "immutable|controlled|free|ephemeral"
scope: "..."
owners: ["team|role|agent-class"]
reads: []
writes: []
depends_on: []
provides: []
version: "1.0"
last_verified: "YYYY-MM-DD"
---
```

### 6.2. Contract body

Основное тело файла **SHOULD** быть представлено как контракт.

Минимальный универсальный шаблон:

* `when`
* `prereq`
* `reads`
* `writes`
* `success`
* `on_fail`

Это особенно хорошо сочетается с современными agent workflows, где шаги и переходы имеют typed inputs/outputs и должны быть наблюдаемыми и проверяемыми. ([platform.openai.com][2])

---

## 7. Универсальная семантическая схема секций

Каждый документ этого стандарта **SHOULD** использовать повторяемые семантические секции.

### 7.1. Для routing-документов

* `when`
* `prereq`
* `reads`
* `writes`
* `success`
* `on_fail`

### 7.2. Для policy-документов

* `invariants`
* `prohibited`
* `allowed`
* `failure_routes`
* `review_rules`

### 7.3. Для knowledge-документов

* `purpose`
* `canonical_scope`
* `contains`
* `excludes`
* `references`
* `last_verified`

### 7.4. Для state-документов

* `current_focus`
* `active_tasks`
* `blocked_by`
* `next_steps`
* `risks`
* `handoff_for_next_agent`

### 7.5. Для decision-документов

* `decision`
* `context`
* `alternatives`
* `tradeoffs`
* `consequences`
* `status`

---

## 8. Правила логики инструкций

### 8.1. Инструкция должна быть атомарной

Одна инструкция — один executable intent.

Плохо:

* “Прочитай всё, разберись, если нужно обнови всё подряд.”

Хорошо:

* “Если задача затрагивает архитектуру, прочитай `ARCHITECTURE.md`.”
* “Если audit нашёл конфликт, инициируй `memory-clarify`.”

### 8.2. Инструкция должна быть условной, а не литературной

LLM лучше исполняют операционные условия, чем абстрактные пожелания.

Плохо:

* “Старайся учитывать архитектурный контекст.”

Хорошо:

* `when: задача затрагивает архитектуру`
* `reads: ARCHITECTURE.md`

### 8.3. Инструкция должна задавать границы

Каждая инструкция **MUST** отвечать на вопросы:

* когда применяется;
* когда не применяется;
* что разрешено;
* что запрещено;
* что делать при неоднозначности.

### 8.4. Инструкция должна избегать скрытых зависимостей

Документ **MUST NOT** зависеть от знаний, которые нигде явно не объявлены.

Если файл использует понятие `CONSTITUTION_CONFLICT`, оно **MUST** быть определено либо локально, либо в каноническом policy-файле.

---

## 9. Правила структуры репозитория

### 9.1. Root architecture

В корне должны лежать только entrypoint/policy/knowledge файлы верхнего уровня.

### 9.2. Local state isolation

Локальное состояние **MUST** быть изолировано в `.local/`.

### 9.3. Stable vs ephemeral split

Устойчивое знание и сессионный шум **MUST NOT** храниться вместе.

### 9.4. Pattern folders

Повторяемые техники должны жить в `PATTERNS/`.

### 9.5. Domain folders

Подсистемы должны жить в `AREAS/`.

### 9.6. Decision folders

Архитектурные решения должны жить в `DECISIONS.md` и `ADR/`.

---

## 10. Правила именования

Названия файлов **MUST** быть:

* короткими;
* декларативными;
* стабильными;
* без синонимической конкуренции.

Нельзя одновременно иметь:

* `RULES.md`
* `POLICY.md`
* `CONSTITUTION.md`

если они пересекаются по смыслу.

Названия команд **SHOULD** быть action-oriented:

* `update-memory`
* `memory-audit`
* `memory-consolidate`

Названия алиасов **SHOULD** быть едиными между toolchains.

---

## 11. Правила машиночитаемости

### 11.1. Один формат — много адаптеров

Канонический markdown **MUST** быть независим от конкретного CLI или IDE.

### 11.2. YAML предпочтительнее embedded JSON в prose

Если реестр хранится внутри markdown, YAML обычно лучше как для чтения человеком, так и для мягкого LLM-парсинга.

### 11.3. Таблицы допустимы только для статических карт

Routing tables допустимы, но исполняемая логика **SHOULD** дублироваться в явных контрактных секциях.

### 11.4. Критичная логика не должна жить только в абзацах

Все важные operational rules **MUST** быть представлены списками, секциями или схемой контракта.

---

## 12. Правила безопасности

Markdown-инструкции для агентов **MUST** предполагать hostile environment.

### 12.1. Untrusted data isolation

Невалидированные внешние данные **MUST NOT** напрямую влиять на tool calls, policy interpretation или write operations.

Это прямо соответствует современным рекомендациям по безопасности агентных workflows: небезопасно позволять произвольному тексту напрямую управлять следующими шагами агента; лучше извлекать только валидированные поля или структурированные значения. ([platform.openai.com][6])

### 12.2. Secret hygiene

Секреты, токены, пароли, приватные ключи, PII **MUST NOT** записываться в memory files.

### 12.3. Approval gates

Операции с высоким риском **SHOULD** требовать human approval.

Tool approvals и guardrails — одна из базовых практик для production agent systems. ([platform.openai.com][6])

### 12.4. Protected files

Immutable-файлы **MUST NOT** переписываться агентом автоматически.

### 12.5. Prompt injection resilience

Каждый routing или tool-execution protocol **MUST** содержать safe fallback при обнаружении конфликта, ambiguity или injection-like content.

---

## 13. Правила жизненного цикла

Каждая memory-system реализация **MUST** описывать lifecycle операций.

Минимальный набор lifecycle commands:

* update
* consolidate
* gc
* audit
* clarify

Это не догма по названиям, но сама логика жизненного цикла обязательна:

1. обновление локального состояния;
2. консолидация устойчивого знания;
3. очистка/архивация;
4. аудит целостности;
5. уточнение пробелов.

### 13.1. Эфемерное знание не должно жить вечно

Сессии стареют.
Стабильное знание верифицируется.
Архив очищается.

### 13.2. У любого lifecycle шага должен быть контракт

Каждый шаг **MUST** иметь:

* `when`
* `prereq`
* `writes`
* `success`
* `on_fail`

---

## 14. Правила маршрутизации

### 14.1. INDEX обязателен

Любая нетривиальная markdown-система для агентов **MUST** иметь `INDEX.md`.

### 14.2. INDEX не является справочником; INDEX является router

Он определяет:

* что читать первым;
* что читать потом;
* что не читать без надобности;
* что делать при неопределённости.

### 14.3. Safe fallback обязателен

Если задача не классифицирована, агент **SHOULD** читать минимальный trusted bootstrap:

* `CONSTITUTION.md`
* `PROJECT.md`
* `.local/CURRENT.md`
* `.local/HANDOFF.md`

### 14.4. Routing должен вести к owner file

Маршрутизация не должна порождать чтение пяти конкурирующих документов про одно и то же.

---

## 15. Правила наблюдаемости и качества

Надёжная markdown-система для агентов **MUST** быть тестируемой.

### 15.1. Documentation evals

Должны существовать проверки:

* может ли агент правильно выбрать файл;
* может ли агент не читать лишнее;
* может ли агент выявить conflict;
* может ли агент корректно выполнить fallback.

### 15.2. Freshness checks

Должны существовать TTL-правила:

* session TTL;
* archive TTL;
* verification TTL.

### 15.3. Traceability

Любое существенное изменение канонического знания **SHOULD** быть трассируемо.

Оценка поведения через evals и trace grading уже рассматривается как важная часть agent engineering. ([platform.openai.com][7])

---

## 16. Правила совместимости с MCP и prompt registries

Если система интегрируется с MCP или другими prompt registries, то:

* каждый reusable prompt **SHOULD** иметь `name`, `title`, `description`, `arguments`;
* ресурсы **SHOULD** подключаться как именованные источники, а не вставляться хаотично;
* аргументы **MUST** быть валидируемыми.

Это хорошо согласуется с MCP prompt model, где промпты перечисляются как объекты с именем, описанием и аргументами, а также могут включать встроенные ресурсы. ([modelcontextprotocol.io][8])

---

## 17. Канонический шаблон стандартизированного agent-markdown документа

```md
---
title: "..."
purpose: "..."
entrypoint: "..."
authority: "immutable|controlled|free|ephemeral"
status: "draft|active|deprecated"
reads: []
writes: []
depends_on: []
provides: []
last_verified: "YYYY-MM-DD"
---

# <Title>

Краткое назначение файла.

## Contract
- when: ...
- prereq: ...
- reads: ...
- writes: ...
- success: ...
- on_fail: ...

## Canonical scope
- contains: ...
- excludes: ...
- references: ...

## Rules
- ...
- ...

## Failure routes
- ...
- ...
```

---

## 18. Канонический набор файлов стандарта AMP-MD

Минимальный recommended profile:

* `AGENTS.md`
* `INDEX.md`
* `CONSTITUTION.md`
* `LIFECYCLE.md`
* `PROJECT.md`
* `ARCHITECTURE.md`
* `CONVENTIONS.md`
* `TESTING.md`
* `DECISIONS.md`
* `OPEN_QUESTIONS.md`
* `CHANGELOG.md`
* `.local/CURRENT.md`
* `.local/HANDOFF.md`
* `ADR/`
* `AREAS/`
* `PATTERNS/`

---

## 19. Что запрещает этот стандарт

AMP-MD **MUST NOT** допускать следующие анти-паттерны:

1. Один огромный “универсальный” markdown-файл на всё.
2. Дублирование одного и того же знания в нескольких ownerless файлах.
3. Смешение policy, state и domain knowledge.
4. Неявные правила, спрятанные в prose.
5. Отсутствие failure branches.
6. Использование markdown как dump-папки без lifecycle.
7. Несогласованные alias names в разных toolchains.
8. Секреты в памяти.
9. Неограниченное чтение всего контекста.
10. Перезапись immutable knowledge агентом без review.

---

## 20. Итоговая декларация

Мы утверждаем, что markdown для AI-агентов должен эволюционировать:

* от документации к интерфейсу;
* от prose к контракту;
* от хаоса к маршрутизации;
* от копирования к canonical ownership;
* от длинного контекста к minimal relevant context;
* от vendor lock-in к portable semantics;
* от “подсказок” к исполняемым protocol artifacts.

**Если человек пишет инструкцию для агента, он должен писать не текст, а систему управления поведением.**

Именно это и есть суть AMP-MD.
