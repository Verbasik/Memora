---
name: memory-audit
description: Аудит целостности memory bank — проверка на устаревание, дрейф, дубликаты и безопасность.
tools: read_file, list_dir, search
---

Проведи аудит memory bank в `memory-bank/`.

## Проверки

### 1. Устаревание
Для каждого стабильного файла: прочитай дату "Верифицировано".
Если старше 60 дней — пометь ⚠️ УСТАРЕЛО.
Если `.local/CURRENT.md` старше 7 дней — пометь ⚠️ УСТАРЕЛО.

### 2. Дрейф архитектуры
Сравни `ARCHITECTURE.md` с кодовой базой:
- Перечисленные модули всё ещё существуют?
- Перечисленные зависимости всё ещё в package manifest?
- Точки входа всё ещё валидны?

### 3. Осиротевшие решения
- Все ADR файлы перечислены в `DECISIONS.md`?
- Все ✅ Действующие решения — их код/паттерны ещё существуют?

### 4. Дублирование
Найди повторяющиеся факты между файлами.

### 5. Нарушения размера

| Файл | Макс строк |
|------|-----------|
| CURRENT.md | 80 |
| HANDOFF.md | 40 |
| INDEX.md | 60 |
| PROJECT.md | 80 |
| ARCHITECTURE.md | 120 |
| CONVENTIONS.md | 100 |
| TESTING.md | 60 |
| DECISIONS.md | 80 |
| Каждый AREAS/*.md | 150 |
| Каждый PATTERNS/*.md | 100 |
| Каждая сессия | 150 |

### 6. Накопление сессий
Если >20 файлов в `.local/SESSIONS/` — перечисли файлы старше 30 дней для архивации.

### 7. Сканирование безопасности
Поищи в memory-bank/ паттерны похожие на секреты:
- `(api[_-]?key|token|secret|password)\s*[:=]`
- URL с credentials: `://[^@]+@`
Любые совпадения → 🔴 БЕЗОПАСНОСТЬ.

### 8. Покрытие провенансом
Проверь стабильные файлы (`ARCHITECTURE.md`, `CONVENTIONS.md`, `PATTERNS/*.md`, `DECISIONS.md`):
- Факты в DECISIONS.md без заполненных колонок `Conf` / `Источник` → ⚠️ БЕЗ ПРОВЕНАНСА.
- Факты в PATTERNS/*.md без `<!-- prov: -->` аннотации → ⚠️ БЕЗ ПРОВЕНАНСА.
- Канонические файлы без `confidence:` в YAML front matter → ℹ️ (опционально).
Схема провенанса: `PATTERNS/provenance-standard.md`.

### 9. Confidence Decay
Для каждого `FACTS/*.md` с полем `confidence` в frontmatter:
- Вычисли `age = today - last_verified`.
- Примени таблицу из `PATTERNS/confidence-decay.md`:
  - confirmed + age > 90d → понизить до `inferred`
  - inferred + age > 60d → понизить до `observed`
  - observed + age > 90d → пометить `⚠️ STALE`
  - STALE + age > 180d → gc-candidate
- При понижении: обнови `confidence` в frontmatter + добавь строку в Confidence history:
  `| [дата] | [старый] → [новый] | decay: last_verified > N дней |`
- Сообщи: файл, старый confidence, новый confidence, age.

### 10. Privacy Leak Scan
В стабильных файлах (всё в `memory-bank/`, кроме `.local/` и `ARCHIVE/`) поищи теги:
- `<private>` или `</private>`
- `<ephemeral>` или `</ephemeral>`
Любые совпадения → 🔴 УТЕЧКА ПРИВАТНОСТИ: контент, который должен быть только в Session tier, попал в стабильные файлы.
Тег `<sensitive>` в стабильных файлах — допустим, но проверь наличие `pii_risk: high` в frontmatter.

### 11. Token Economics Health
Подсчитай суммарный размер всех `*.md` в `memory-bank/` (исключая `.local/`, `ARCHIVE/`):
- `estimated_tokens = total_chars / 4`
- Если `estimated_tokens > 20000` → ⚠️ MEMORY BLOAT: memory bank слишком большой.
- Выведи top-5 файлов по размеру (chars и ~tokens).
- Если один файл > 4000 токенов → ⚠️ FILE BLOAT: кандидат на разбиение.

## Формат вывода

```
## Аудит памяти — [дата]

### ✅ В порядке
- [пройденные проверки]

### ⚠️ Устарело
- [файл]: верифицировано [дата], [N] дней назад

### ❌ Дрейф
- [конкретное расхождение с кодовой базой]

### 🔴 Безопасность
- [найденный секрет-подобный контент]

### 🔴 Утечка приватности
- [файл]: найден тег <private>/<ephemeral> за пределами .local/

### 🔍 Провенанс
- [файл/факт без аннотации prov: или без Conf/Источник в DECISIONS.md]

### 📉 Confidence Decay
- [файл]: confirmed → inferred (age: N дней)

### 📊 Token Economics
- Total: ~[N] tokens ([chars] chars) | Budget: 20000
- Top-5: [файл] (~[N]t), ...
- [⚠️ MEMORY BLOAT / ✅ В норме]

### 🧹 Очистка
- [сессии для архивации, файлы превышающие лимиты, дупликаты, gc-candidates]

### Рекомендации
1. [конкретное действие с путём файла]
```

