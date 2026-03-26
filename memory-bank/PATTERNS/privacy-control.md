---
title: "PATTERN — Privacy Control"
id: "pattern-privacy-control"
type: "PATTERN"
version: "1.0.0"
pii_risk: "none"
ttl: null
tags: ["security", "privacy", "pii"]
purpose: "Управление приватностью данных при записи в memory bank"
entrypoint: "AGENTS.md -> POLICIES/privacy-zones.md -> PATTERNS/privacy-control.md"
authority: "controlled"
status: "active"
reads: []
writes: []
depends_on:
  - "CONSTITUTION.md"
  - "POLICIES/privacy-zones.md"
provides:
  - "privacy_tag_processing"
  - "pii_handling"
last_verified: "2026-03-23"
max_lines: 100
---

# Privacy Control

Три зоны приватности для контроля над тем, что попадает в memory bank.
Применяется агентом **перед записью** в любой файл memory bank.

## Contract

- when: любая запись в memory bank (update-memory, consolidate, reflect, bootstrap)
- prereq: текст содержит потенциально чувствительную информацию
- reads: этот файл; `POLICIES/privacy-zones.md`
- writes: none (паттерн описывает поведение агента)
- success: чувствительный контент обработан до записи; утечек нет
- on_fail: при обнаружении секрета/PII → стоп → удалить → `memory-audit`

## Три зоны приватности

| Тег | Поведение агента | Допустимый tier |
|-----|-----------------|----------------|
| `<private>...</private>` | **Удалить** весь контент внутри тега перед записью | Не записывается |
| `<sensitive pii_risk="high">...</sensitive>` | **Записать**, но пометить файл `pii_risk: high` в frontmatter | Semantic tier |
| `<ephemeral>...</ephemeral>` | **Записать** только в Session tier; **блокировать** промоцию | Session tier |

## Алгоритм обработки

Выполни **перед каждой записью в memory bank**:

```
1. Сканируй текст на наличие тегов:
   - <private>...</private>
   - <sensitive ...>...</sensitive>
   - <ephemeral>...</ephemeral>

2. Для каждого <private>:
   → Удали весь контент внутри тега (включая сам тег)
   → Замени на: [redacted]

3. Для каждого <sensitive pii_risk="high">:
   → Сохрани контент (без тега)
   → Добавь `pii_risk: high` в frontmatter файла-владельца

4. Для каждого <ephemeral>:
   → Сохрани контент только в .local/SESSIONS/ или .local/CURRENT.md
   → При consolidate/reflect — пропусти этот блок
   → Не промотируй в Semantic или Episodic tier

5. Если обнаружены секреты (api_key, token, password) БЕЗ тегов:
   → Стоп. Не записывать. Уведомить пользователя.
```

## Аудит утечек

`memory-audit` проверяет стабильные файлы на присутствие тегов `<private>` и `<ephemeral>` — их там быть не должно.

## Pitfalls

- Теги должны быть явными. Агент не угадывает, что является приватным.
- `<sensitive>` сохраняет контент — не подходит для паролей и токенов.
- `<ephemeral>` блокирует промоцию, но не удаляет контент из Session tier.

## Constitution link

Обязательное требование из `CONSTITUTION.md`: секреты, токены, PII не записываются в память.
`<private>` — технический механизм соблюдения этого принципа.
