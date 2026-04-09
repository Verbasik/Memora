"""
ingestor.py — Фаза 1: ingestion сессий LongMemEval в Memora workspace.

Симулирует реальное использование Memora:
  1. Записывает сессии в SESSIONS/*.md в хронологическом порядке
  2. Строит компактный индекс всех сессий в CURRENT.md
     (обходит ограничение Essential Story «последние 3-5 файлов»)
  3. Наполняет knowledge_graph.py темпоральными фактами
  4. Пишет HANDOFF.md с контекстом о загруженных сессиях
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from memora_longmemeval.modes import MODE_MEMORA_MIN, is_memora_mode, uses_kg
from memora_longmemeval.session_adapter import SessionArtifact, write_sessions

# KG — добавляем путь к scripts
_SCRIPTS_DIR = Path(__file__).parent.parent / "memory-bank" / "scripts"
sys.path.insert(0, str(_SCRIPTS_DIR))


def ingest(
    item: dict,
    workspace_path: Path,
    sessions_dir: Path,
    mode: str = MODE_MEMORA_MIN,
) -> dict:
    """
    Полный ingestion одного LongMemEval вопроса в Memora workspace.

    Возвращает dict с метриками: n_sessions, n_kg_triples, etc.
    """
    haystack_sessions = item["haystack_sessions"]
    haystack_dates = item["haystack_dates"]
    haystack_ids = item["haystack_session_ids"]
    question_date = item.get("question_date", "unknown")

    materialized = sorted(
        zip(haystack_dates, haystack_ids, haystack_sessions),
        key=lambda entry: (_datetime_sort_key(entry[0]), entry[1]),
    )
    sorted_dates = [entry[0] for entry in materialized]
    sorted_ids = [entry[1] for entry in materialized]
    sorted_sessions = [entry[2] for entry in materialized]

    # ── 1. Записываем SESSIONS/*.md ───────────────────────────────────────────
    session_artifacts = write_sessions(
        haystack_sessions=sorted_sessions,
        haystack_dates=sorted_dates,
        haystack_session_ids=sorted_ids,
        sessions_dir=sessions_dir,
        mode=mode,
    )

    # ── 2. Строим CURRENT.md / HANDOFF.md только для Memora режимов ──────────
    if is_memora_mode(mode):
        _write_current(
            workspace_path=workspace_path,
            sessions=session_artifacts,
            question_date=question_date,
        )

        _write_handoff(
            workspace_path=workspace_path,
            n_sessions=len(sorted_sessions),
            date_range=(min(sorted_dates), max(sorted_dates)),
            question_date=question_date,
            mode=mode,
        )

    # ── 3. Наполняем Knowledge Graph только для Memora Full ──────────────────
    n_kg = 0
    if uses_kg(mode):
        n_kg = _populate_kg(
            workspace_path=workspace_path,
            haystack_dates=sorted_dates,
            haystack_ids=sorted_ids,
            haystack_sessions=sorted_sessions,
        )

    return {
        "n_sessions": len(sorted_sessions),
        "n_kg_triples": n_kg,
        "session_map": [
            {
                "public_id": artifact.public_id,
                "source_id": artifact.source_id,
                "path": str(artifact.path),
                "relative_path": artifact.path.relative_to(workspace_path).as_posix(),
                "created_at": artifact.created_at,
            }
            for artifact in session_artifacts
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# CURRENT.md — компактный индекс сессий
# ─────────────────────────────────────────────────────────────────────────────

def _write_current(
    workspace_path: Path,
    sessions: list[SessionArtifact],
    question_date: str,
) -> None:
    """
    Записывает CURRENT.md с индексом ВСЕХ сессий.

    Для benchmark не включаем содержательные превью, чтобы избежать leakage.
    CURRENT.md даёт только нейтральную навигацию по времени и файлам.
    """
    lines = [
        "# Current",
        "",
        f"Последнее обновление: {datetime.now().strftime('%Y-%m-%d %H:%M')} (ingestor)",
        "",
        "## Активная задача",
        "",
        f"Ответить на вопрос по истории переписки (дата вопроса: {question_date}).",
        "",
        f"## Индекс сессий ({len(sessions)} всего)",
        "",
        "Все доступные сессии в `memory-bank/.local/SESSIONS/` — читай файлы для деталей.",
        "",
        "| Дата | Session ID | Файл |",
        "|---|---|---|",
    ]

    for session in sessions:
        rel_path = session.path.relative_to(workspace_path).as_posix()
        lines.append(f"| {session.created_at} | {session.public_id} | `{rel_path}` |")

    lines += [
        "",
        "## Checkpoint",
        "",
        f"compaction: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
    ]

    path = workspace_path / "memory-bank" / ".local" / "CURRENT.md"
    path.write_text("\n".join(lines), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# HANDOFF.md
# ─────────────────────────────────────────────────────────────────────────────

def _write_handoff(
    workspace_path: Path,
    n_sessions: int,
    date_range: tuple[str, str],
    question_date: str,
    mode: str,
) -> None:
    content = f"""\
# Handoff — {datetime.now().strftime('%Y-%m-%d %H:%M')}

## Request
Ответить на вопрос о прошлых сессиях пользователя (дата вопроса: {question_date}).

## Investigated
Загружено {n_sessions} сессий из диапазона {date_range[0]} — {date_range[1]}.
Файлы: memory-bank/.local/SESSIONS/*.md

## Learned
История переписки загружена. CURRENT.md содержит нейтральный индекс всех сессий.
{"Knowledge Graph содержит темпоральные факты о сессиях." if uses_kg(mode) else "Knowledge Graph в этом режиме не используется."}

## Completed
- Записаны все SESSIONS/*.md в хронологическом порядке
- CURRENT.md содержит полный нейтральный индекс {n_sessions} сессий
{"- KG наполнен темпоральными фактами" if uses_kg(mode) else "- KG отключён для этого benchmark-режима"}

## Next steps
1. Восстановить контекст через memory-restore
2. Ответить на вопрос по загруженным сессиям

## Risks
- Ответ может быть в любой из {n_sessions} сессий; проверяй CURRENT.md для навигации
- Индекс намеренно не содержит содержательных подсказок из текста сессий

## Active files
memory-bank/.local/SESSIONS/*.md | memory-bank/.local/CURRENT.md
"""
    path = workspace_path / "memory-bank" / ".local" / "HANDOFF.md"
    path.write_text(content, encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge Graph — темпоральная индексация
# ─────────────────────────────────────────────────────────────────────────────

def _populate_kg(
    workspace_path: Path,
    haystack_dates: list[str],
    haystack_ids: list[str],
    haystack_sessions: list[list[dict]],
) -> int:
    """
    Наполняет KG темпоральными фактами о сессиях.

    Записывает:
      user → had_session → session_id  (valid_from = дата сессии)
      session_id → occurred_on → date  (valid_from = дата сессии)
      user → active_on → date          (дедупликация по дате)

    Возвращает количество добавленных трипли.
    """
    try:
        from knowledge_graph import KnowledgeGraph
    except ImportError:
        return 0  # KG опционален — не блокируем работу

    db_path = workspace_path / "memory-bank" / ".local" / "knowledge_graph.db"
    try:
        kg = KnowledgeGraph(db_path=str(db_path))
    except Exception:
        return 0

    n = 0
    seen_dates: set[str] = set()

    for date_str, session_id, turns in zip(haystack_dates, haystack_ids, haystack_sessions):
        try:
            # Нормализуем дату: "2023/04/10 (Mon) 17:50" → "2023-04-10"
            iso_date = _normalize_date(date_str)

            # Сессия произошла в эту дату
            kg.add_triple(
                subject=session_id,
                predicate="occurred_on",
                obj=iso_date,
                valid_from=iso_date,
            )
            n += 1

            # Пользователь был активен в эту дату
            if iso_date not in seen_dates:
                kg.add_triple(
                    subject="user",
                    predicate="active_on",
                    obj=iso_date,
                    valid_from=iso_date,
                )
                seen_dates.add(iso_date)
                n += 1

            # Извлекаем упоминаемые имена собственные (простая эвристика)
            for turn in turns:
                content = turn.get("content", "")
                for name in _extract_names(content):
                    kg.add_triple(
                        subject="user",
                        predicate="mentioned",
                        obj=name,
                        valid_from=date_str,
                    )
                    n += 1

        except Exception:
            continue  # не даём ошибкам KG блокировать бенчмарк

    return n


def _normalize_date(date_str: str) -> str:
    """
    Нормализует дату из формата LongMemEval в ISO 8601.

    "2023/04/10 (Mon) 17:50"  → "2023-04-10"
    "2023-04-10"               → "2023-04-10"  (уже нормально)
    """
    import re
    m = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2})", date_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return date_str[:10]  # fallback: берём первые 10 символов


def _datetime_sort_key(date_str: str) -> str:
    """
    Нормализованный ключ сортировки для LongMemEval дат.

    "2023/04/10 (Mon) 17:50" -> "2023-04-10T17:50"
    """
    import re

    match = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2}).*?(\d{2}):(\d{2})", date_str)
    if match:
        return (
            f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
            f"T{match.group(4)}:{match.group(5)}"
        )
    return _normalize_date(date_str) + "T00:00"


def _extract_names(text: str) -> list[str]:
    """
    Простая эвристика: находит слова с заглавной буквы внутри предложения
    (не в начале), которые похожи на имена собственные.
    Намеренно консервативна чтобы избежать шума.
    """
    import re
    # Находим слова с заглавной буквы которые не в начале предложения
    names = re.findall(r"(?<=[a-z] )([A-Z][a-z]{2,15})", text)
    # Фильтруем стоп-слова
    stopwords = {
        "The", "This", "That", "These", "Those", "What", "When", "Where",
        "Which", "Who", "How", "Why", "But", "And", "For", "Not", "You",
        "Also", "Just", "Sure", "Well",
    }
    return [n for n in names if n not in stopwords][:3]  # максимум 3 на turn
