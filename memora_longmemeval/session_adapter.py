"""
session_adapter.py — конвертирует LongMemEval сессии в формат Memora SESSIONS/*.md
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def write_sessions(
    haystack_sessions: list[list[dict]],
    haystack_dates: list[str],
    haystack_session_ids: list[str],
    sessions_dir: Path,
    answer_session_ids: list[str] | None = None,
) -> list[Path]:
    """
    Конвертирует haystack_sessions из LongMemEval в набор SESSIONS/*.md файлов.

    Возвращает список созданных путей.
    """
    sessions_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []

    evidence_ids = set(answer_session_ids or [])

    for idx, (session_turns, date_str, session_id) in enumerate(
        zip(haystack_sessions, haystack_dates, haystack_session_ids)
    ):
        is_evidence = session_id in evidence_ids
        path = _write_single(
            session_turns=session_turns,
            date_str=date_str,
            session_id=session_id,
            idx=idx,
            sessions_dir=sessions_dir,
            is_evidence=is_evidence,
        )
        paths.append(path)

    return paths


# ─────────────────────────────────────────────────────────────────────────────
# Internal
# ─────────────────────────────────────────────────────────────────────────────

def _write_single(
    session_turns: list[dict],
    date_str: str,
    session_id: str,
    idx: int,
    sessions_dir: Path,
    is_evidence: bool,
) -> Path:
    slug = _slugify(session_id)
    filename = f"{date_str}-{idx:04d}-{slug}.md"
    path = sessions_dir / filename

    summary = _extract_summary(session_turns)
    conversation = _format_turns(session_turns)

    evidence_tag = "  # evidence session" if is_evidence else ""

    content = f"""\
---
title: "SESSION/{date_str}-{slug}"
id: "session-{date_str}-{slug}"
type: "SESSION"
version: "1.0.0"
authority: "free"
status: "active"
owner: "longmemeval"
created_at: "{date_str}"
session_id: "{session_id}"{evidence_tag}
wing: "longmemeval"
hall: "hall_facts"
room: "{slug}"
pii_risk: "none"
ttl: null
tags: []
---

# Session: {session_id} ({date_str})

## Summary

{summary}

## Conversation

{conversation}
"""
    path.write_text(content, encoding="utf-8")
    return path


def _extract_summary(turns: list[dict]) -> str:
    """Берёт первое user-сообщение как краткое описание сессии."""
    for turn in turns:
        if turn.get("role") == "user":
            text = turn.get("content", "")
            # Обрезаем до 120 символов
            short = text[:120].replace("\n", " ").strip()
            if len(text) > 120:
                short += "…"
            return short
    return "Chat session."


def _format_turns(turns: list[dict]) -> str:
    lines: list[str] = []
    for turn in turns:
        role = turn.get("role", "unknown").capitalize()
        content = turn.get("content", "").strip()
        has_answer = turn.get("has_answer", False)
        marker = " ⭐" if has_answer else ""
        lines.append(f"**{role}**{marker}: {content}\n")
    return "\n".join(lines)


def _slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:40]
