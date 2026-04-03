---
title: "POLICIES/privacy-zones — Политика зон приватности"
id: "policy-privacy-zones"
type: "POLICY"
version: "0.1.0"
authority: "controlled"
status: "active"
owner: "все агенты"
scope: "все операции записи в memory bank"
created_at: "2026-03-23"
pii_risk: "none"
ttl: null
tags: ["security", "privacy", "pii", "governance"]
last_verified: "2026-03-23"
---

# Policy: Privacy Zones

Политика управления приватностью при записи знаний в memory bank.

## Contract

- when: любая запись в memory bank; обнаружение чувствительного контента
- prereq: политика соответствует `CONSTITUTION.md` — секреты и PII не хранятся
- reads: этот файл; `PATTERNS/privacy-control.md`
- writes: при обновлении политики (требует human review)
- success: чувствительный контент не попадает в стабильные файлы; аудит проходит чисто
- on_fail: если политика конфликтует с `CONSTITUTION.md` → пометить `CONSTITUTION_CONFLICT`

## Purpose

Предотвратить утечку персональных данных, секретов и временного контента в постоянное хранилище memory bank. Реализует принцип минимального хранения: записывается только то, что необходимо для работы агента.

## Scope

- **Применяется к**: всем операциям записи агента (update-memory, consolidate, reflect, bootstrap)
- **Не применяется к**: чтению файлов; операциям вне memory-bank/

## Rules

1. Контент внутри `<private>...</private>` **удаляется** перед записью в любой файл.
2. Контент внутри `<sensitive pii_risk="high">...</sensitive>` записывается с пометкой `pii_risk: high` в frontmatter файла-владельца.
3. Контент внутри `<ephemeral>...</ephemeral>` записывается только в Session tier (`.local/`); промоция в Episodic/Semantic **заблокирована**.
4. Секреты, токены, пароли, credentials **без тегов** — стоп, не записывать, уведомить пользователя.
5. PII (имена, email, телефоны, адреса) без явного `pii_risk: high` — удалить или анонимизировать.

## Violations

- Обнаружен `<private>` в стабильном файле → немедленно удалить → `memory-audit`.
- Обнаружен `<ephemeral>` в Semantic tier → удалить → `memory-audit`.
- Обнаружен секрет без тега → `🔴 БЕЗОПАСНОСТЬ` в audit report → remediate.

## Review schedule

- Периодичность: при изменении требований к безопасности или CONSTITUTION.md
- Следующий review: 2026-06-23

## Constitution compliance

- Соответствует принципу: «Секреты, токены, пароли, PII не записываются в память» (CONSTITUTION.md)

## Failure routes

- Нарушение политики → `CONSTITUTION_CONFLICT` → human review
- Политика устарела → пометить `status: deprecated` → создать новую версию
