---
title: "PATTERN — Provenance Standard"
id: "pattern-provenance-standard"
type: "PATTERN"
version: "0.1.0"
authority: controlled
status: active
pii_risk: "none"
ttl: null
tags: []
last_verified: 2026-03-17
max_lines: 100
---

# Provenance Standard — Стандарт провенанса

Канонический источник: как фиксировать происхождение фактов в memory-bank.
Цель: превратить `last_verified` из временной метки в полноценный audit trail.

## Три уровня провенанса

### 1. File-level — в YAML front matter каждого канонического файла

```yaml
---
last_verified: ГГГГ-ММ-ДД
confidence: confirmed        # observed | inferred | confirmed
---
```

Обновляется при каждой промоции фактов в файл.

### 2. Fact-level — inline-аннотация к конкретному факту

```markdown
PostgreSQL — основная СУБД. <!-- prov: 2026-03-17 | conf: confirmed | src: SESSIONS/2026-03-17-claude-db-setup.md -->
```

Добавляется к значимым фактам при промоции через `update-memory` или `memory-consolidate`.

### 3. Decision-level — колонки в таблице DECISIONS.md

```
| # | Решение | Статус | Дата | ADR | Conf | Источник | Влияние |
```

Добавляется при записи каждого решения в реестр.

---

## Шкала confidence

| Уровень | Значение | Когда применять |
|---|---|---|
| `observed` | Замечено в 1 сессии | Первое упоминание; не подтверждено повторно |
| `inferred` | Встречалось в 2 сессиях независимо | Вероятный факт; требует верификации |
| `confirmed` | Встречалось в 3+ сессиях или явно проверено человеком | Устойчивый факт |

**Правила decay confidence** (полный алгоритм: `PATTERNS/confidence-decay.md`):
- `confirmed` > 90д → `inferred`; `inferred` > 60д → `observed`; `observed` > 90д → `⚠️ STALE`
- Reverification восстанавливает: 1 сессия → `observed`, 2 → `inferred`, 3+ → `confirmed`
- Факт противоречит новым наблюдениям → пометить `⚠️ STALE`, вынести на ревью

---

## Формат inline-аннотации

```
<!-- prov: ГГГГ-ММ-ДД | conf: observed|inferred|confirmed | src: SESSIONS/файл.md -->
```

**Поля:**
- `prov` — дата верификации (ISO 8601)
- `conf` — уровень confidence
- `src` — источник: сессия, ADR, внешний документ, или `human-review`

**Примеры:**
```markdown
Используем Node.js >= 16 <!-- prov: 2026-03-17 | conf: confirmed -->
Авторизация через JWT. <!-- prov: 2026-03-17 | conf: inferred | src: SESSIONS/2026-03-10-claude-auth.md -->
Монолитная архитектура — стратегическое решение. <!-- prov: 2026-03-17 | conf: confirmed | src: human-review -->
PostgreSQL подтверждён в трёх сессиях. <!-- prov: 2026-03-17 | conf: confirmed | src: reflected:3 -->
```

---

## Совместимость с memory-reflect

`memory-reflect` создаёт `PATTERNS/reflect-<тема>.md` с полем `source_sessions[]`.
Это расширенный вариант провенанса для паттернов — он совместим: `source_sessions` → `src`.

---

## Что НЕ нужно аннотировать

- Технические плейсхолдеры (`[заполнить]`, `[TBD]`)
- Факты из самого AGENTS.md / CONSTITUTION.md (они — первоисточники)
- Вспомогательные поля YAML front matter (title, purpose, entrypoint)
