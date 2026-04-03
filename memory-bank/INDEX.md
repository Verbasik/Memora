---
title: "INDEX — таблица маршрутизации"
id: "memory-index"
type: "INDEX"
version: "0.1.0"
authority: "controlled"
status: "active"
pii_risk: "none"
ttl: null
tags: []
purpose: "Определять минимальный набор файлов, который нужно читать агенту для текущей задачи"
entrypoint: "AGENTS.md -> INDEX.md"
routing_policy: "Read minimal relevant context only"
safe_fallback:
  - "CONSTITUTION.md"
  - "PROJECT.md"
  - ".local/CURRENT.md"
  - ".local/HANDOFF.md"
ownership_model: "Один вопрос -> один файл-владелец"
protection_levels:
  immutable:
    - "CONSTITUTION.md"
    - "ADR/*.md"
  controlled:
    - "DECISIONS.md"
    - "ARCHITECTURE.md"
    - "CONVENTIONS.md"
    - "TESTING.md"
    - "PROJECT.md"
    - "FACTS/*.md"
    - "POLICIES/*.md"
    - "AGENTS/*.md"
  free:
    - "EPISODES/*.md"
    - "TESTS/*.md"
    - ".local/CURRENT.md"
    - ".local/HANDOFF.md"
    - ".local/SESSIONS/*"
    - "OPEN_QUESTIONS.md"
    - "CHANGELOG.md"
freshness_policy:
  sessions_ttl_days: 30
  archive_ttl_days: 90
  verification_ttl_days: 60
---

# INDEX — таблица маршрутизации

Этот файл определяет, что читать первым и что не читать без необходимости.
Правило: не загружай весь memory-bank. Читай только минимально релевантные файлы.

## Routing contract
- when: в начале новой сессии; при получении новой задачи; при смене режима работы
- prereq: прочитан `AGENTS.md`; задача распознана хотя бы на базовом уровне
- reads: текущая задача + этот файл
- writes: none
- success: выбран минимальный набор релевантных файлов; определён канонический файл-владелец
- on_fail: если задача неоднозначна -> прочитать `CONSTITUTION.md`, `PROJECT.md`, `.local/CURRENT.md`, `.local/HANDOFF.md`

## Карта маршрутизации

### CONSTITUTION.md
- when: принципы проекта, запреты, неизменяемые правила, допустимость решения
- prereq: нужно проверить, можно ли вообще делать запрошенное изменение
- reads: `CONSTITUTION.md`
- writes: none
- success: определены жёсткие инварианты и ограничения
- on_fail: если решение конфликтует с правилами -> остановить изменение и вынести на review

### PROJECT.md
- when: цели проекта, scope, доменные термины, границы системы
- prereq: нужно понять, что это за проект и зачем он существует
- reads: `PROJECT.md`
- writes: none
- success: понятны цель, терминология и рамки задачи
- on_fail: если scope неясен -> дополнительно открыть `OPEN_QUESTIONS.md`

### ARCHITECTURE.md
- when: архитектура, модули, компоненты, потоки данных, зависимости
- prereq: задача затрагивает устройство системы
- reads: `ARCHITECTURE.md`
- writes: none
- success: понятны структура системы и место изменения
- on_fail: если информации недостаточно -> открыть `AREAS/<имя>.md`

### CONVENTIONS.md
- when: стиль кода, naming, layout файлов, правила оформления
- prereq: задача предполагает изменение кода или структуры
- reads: `CONVENTIONS.md`
- writes: none
- success: понятны локальные инженерные соглашения
- on_fail: если соглашение отсутствует -> зафиксировать в `OPEN_QUESTIONS.md`

### TESTING.md
- when: запуск тестов, CI, линтинг, quality gates
- prereq: задача влияет на валидацию, сборку или проверку изменений
- reads: `TESTING.md`
- writes: none
- success: понятны команды проверки и критерии готовности
- on_fail: если команды устарели -> пометить для review

### DECISIONS.md + ADR/
- when: нужно понять, почему выбран конкретный подход, технология или компромисс
- prereq: требуется объяснение инженерного решения, а не только его описание
- reads: `DECISIONS.md`, при необходимости `ADR/*.md`
- writes: none
- success: понятны причины выбора и исторический контекст решений
- on_fail: если причина не найдена -> добавить в `OPEN_QUESTIONS.md`

### AREAS/<имя>.md
- when: задача относится к конкретной подсистеме или bounded context
- prereq: определена целевая подсистема
- reads: `AREAS/<имя>.md`
- writes: none
- success: понятен локальный контекст подсистемы
- on_fail: если файл отсутствует -> использовать `ARCHITECTURE.md` как fallback

### PATTERNS/<имя>.md
- when: задача использует повторяющуюся инженерную технику или шаблон
- prereq: найден повторяемый тип решения
- reads: `PATTERNS/<имя>.md`
- writes: none
- success: выбран согласованный reusable-подход
- on_fail: если паттерн не найден -> искать в `DECISIONS.md`

### OPEN_QUESTIONS.md
- when: есть нерешённые вопросы, неоднозначность, нехватка подтверждённых фактов
- prereq: обнаружен пробел в знаниях
- reads: `OPEN_QUESTIONS.md`
- writes: none
- success: понятны активные неопределённости
- on_fail: если файл пуст, а пробелы есть -> инициировать `memory-clarify`

### CHANGELOG.md
- when: нужно понять недавние изменения и их влияние
- prereq: задача чувствительна к последним правкам
- reads: `CHANGELOG.md`
- writes: none
- success: понятны последние изменения и риск регрессий
- on_fail: если изменений нет -> опираться на `.local/CURRENT.md`

### .local/CURRENT.md
- when: нужно понять текущее состояние работы
- prereq: задача связана с ongoing work
- reads: `.local/CURRENT.md`
- writes: none
- success: понятны текущее направление, активные задачи, ближайшие шаги
- on_fail: если файл устарел -> сначала выполнить `update-memory`

### .local/HANDOFF.md
- when: нужно восстановить контекст предыдущей сессии или передать работу следующему агенту
- prereq: работа продолжается между сессиями
- reads: `.local/HANDOFF.md`
- writes: none
- success: понятны незавершённые действия, риски и next steps
- on_fail: если handoff пустой -> использовать `.local/CURRENT.md`

### FACTS/<имя>.md
- when: нужно сохранить или проверить устойчивый факт о проекте, окружении или пользователе
- prereq: факт верифицирован как минимум на уровне `observed`; не дублируется в канонических файлах
- reads: `FACTS/<имя>.md`
- writes: при добавлении нового факта; при обновлении confidence
- success: факт зафиксирован с provenance, confidence и pii_risk
- on_fail: если факт противоречит существующему -> зафиксировать конфликт в `OPEN_QUESTIONS.md § Conflicts`

### EPISODES/<имя>.md
- when: нужно восстановить контекст прошлой сессии или события; при memory-consolidate/reflect
- prereq: сессия завершена; есть промотируемые знания
- reads: `EPISODES/<имя>.md`
- writes: после завершения сессии (promotion из `.local/SESSIONS/`)
- success: эпизод структурирован; знания для промоции отмечены
- on_fail: если эпизод без структуры -> оставить в `.local/SESSIONS/`; не продвигать

### POLICIES/<имя>.md
- when: нужно проверить правила безопасности, конфиденциальности или управления
- prereq: задача затрагивает хранение данных, PII, доступ или governance
- reads: `POLICIES/<имя>.md`
- writes: при создании или обновлении политики
- success: понятны правила и их область применения
- on_fail: если политика конфликтует с `CONSTITUTION.md` -> вынести на review

### AGENTS/<имя>.md
- when: нужно понять возможности конкретного агента; при настройке multi-agent workflow
- prereq: работа включает несколько агентов или требует понимания их ролей
- reads: `AGENTS/<имя>.md`
- writes: при добавлении нового агента или обновлении его профиля
- success: понятны роль, компетенции и область ответственности агента
- on_fail: если профиль агента отсутствует -> использовать `AGENTS.md` как fallback

### TESTS/<имя>.md
- when: нужно описать или проверить конкретный тест-кейс
- prereq: задача требует документирования поведения или результатов тестирования
- reads: `TESTS/<имя>.md`
- writes: при создании нового тест-кейса или фиксации результата
- success: тест задокументирован с ожидаемым и фактическим результатом
- on_fail: если нет связанного факта -> добавить ссылку на `FACTS/` или `OPEN_QUESTIONS.md`

## Каноническое владение
- Какие принципы нельзя нарушать? -> `CONSTITUTION.md`
- Что это за проект? -> `PROJECT.md`
- Как он устроен? -> `ARCHITECTURE.md`
- Как мы пишем код? -> `CONVENTIONS.md`
- Как проверяем? -> `TESTING.md`
- Почему выбрали X? -> `DECISIONS.md` + `ADR/`
- Что сейчас происходит? -> `.local/CURRENT.md`
- Что нужно следующему агенту? -> `.local/HANDOFF.md`
- Устойчивые факты о проекте/окружении? -> `FACTS/`
- Прошлые сессии (структурированно)? -> `EPISODES/`
- Правила безопасности и данных? -> `POLICIES/`
- Профили агентов? -> `AGENTS/`
- Задокументированные тест-кейсы? -> `TESTS/`

## Политика устаревания
- `.local/SESSIONS/` старше 30 дней -> перенести в `ARCHIVE/`
- `ARCHIVE/` старше 90 дней -> удалить
- Факты в стабильных файлах без верификации > 60 дней -> пометить для review

## Lifecycle link
Полный lifecycle операций с памятью см. в `LIFECYCLE.md`.

## Skills / agents / commands registry
```yaml
skills_agents_commands:
  memory-bootstrap:
    claude: ".claude/skills/memory-bootstrap/SKILL.md"
    codex: ".agents/skills/memory-bootstrap/SKILL.md"
    qwen: ".qwen/agents/memory-bootstrap.md"
    opencode: ".opencode/commands/memory-bootstrap.md"

  memory-restore:
    claude: ".claude/skills/memory-restore/SKILL.md"
    codex: ".agents/skills/memory-restore/SKILL.md"
    qwen: ".qwen/agents/memory-restore.md"
    opencode: ".opencode/commands/memory-restore.md"

  update-memory:
    claude: ".claude/skills/update-memory/SKILL.md"
    codex: ".agents/skills/update-memory/SKILL.md"
    qwen: ".qwen/agents/update-memory.md"
    opencode: ".opencode/commands/update-memory.md"

  memory-audit:
    claude: ".claude/skills/memory-audit/SKILL.md"
    codex: ".agents/skills/memory-audit/SKILL.md"
    qwen: ".qwen/agents/memory-audit.md"
    opencode: ".opencode/commands/memory-audit.md"

  memory-consolidate:
    claude: ".claude/skills/memory-consolidate/SKILL.md"
    codex: ".agents/skills/memory-consolidate/SKILL.md"
    qwen: ".qwen/agents/memory-consolidate.md"
    opencode: ".opencode/commands/memory-consolidate.md"

  memory-reflect:
    claude: ".claude/skills/memory-reflect/SKILL.md"
    codex: ".agents/skills/memory-reflect/SKILL.md"
    qwen: ".qwen/agents/memory-reflect.md"
    opencode: ".opencode/commands/memory-reflect.md"

  memory-gc:
    claude: ".claude/skills/memory-gc/SKILL.md"
    codex: ".agents/skills/memory-gc/SKILL.md"
    qwen: ".qwen/agents/memory-gc.md"
    opencode: ".opencode/commands/memory-gc.md"

  memory-explorer:
    claude: ".claude/agents/memory-explorer.md"
    codex: ".agents/skills/memory-explorer/SKILL.md"
    qwen: ".qwen/agents/memory-explorer.md"
    opencode: ".opencode/commands/memory-explorer.md"

  memory-clarify:
    claude: ".claude/skills/memory-clarify/SKILL.md"
    codex: ".agents/skills/memory-clarify/SKILL.md"
    qwen: ".qwen/agents/memory-clarify.md"
    opencode: ".opencode/commands/memory-clarify.md"
```
