"""
session_adapter.py — конвертирует LongMemEval сессии в формат Memora SESSIONS/*.md
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path

from memora_longmemeval.modes import is_memora_mode


@dataclass(frozen=True)
class SessionArtifact:
    """One materialized benchmark session file plus its non-public source mapping."""

    path: Path
    public_id: str
    source_id: str
    created_at: str

# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def write_sessions(
    haystack_sessions: list[list[dict]],
    haystack_dates: list[str],
    haystack_session_ids: list[str],
    sessions_dir: Path,
    mode: str = "memora-min",
) -> list[SessionArtifact]:
    """
    Конвертирует haystack_sessions из LongMemEval в набор SESSIONS/*.md файлов.

    Возвращает список созданных путей.
    """
    sessions_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[SessionArtifact] = []
    memora_format = is_memora_mode(mode)

    for idx, (session_turns, date_str, session_id) in enumerate(
        zip(haystack_sessions, haystack_dates, haystack_session_ids)
    ):
        public_id = f"session_{idx + 1:04d}"
        path = _write_single(
            session_turns=session_turns,
            date_str=date_str,
            public_id=public_id,
            idx=idx,
            sessions_dir=sessions_dir,
            memora_format=memora_format,
        )
        artifacts.append(
            SessionArtifact(
                path=path,
                public_id=public_id,
                source_id=session_id,
                created_at=date_str,
            )
        )

    return artifacts


# ─────────────────────────────────────────────────────────────────────────────
# Internal
# ─────────────────────────────────────────────────────────────────────────────

def _write_single(
    session_turns: list[dict],
    date_str: str,
    public_id: str,
    idx: int,
    sessions_dir: Path,
    memora_format: bool,
) -> Path:
    safe_date = _date_prefix(date_str)
    filename = f"{safe_date}-{idx:04d}-{public_id}.md"
    path = sessions_dir / filename

    summary = _extract_summary(session_turns)
    conversation = _format_turns(session_turns)

    if memora_format:
        content = f"""\
---
title: "SESSION/{date_str}-{public_id}"
id: "{public_id}"
type: "SESSION"
version: "1.0.0"
authority: "free"
status: "active"
owner: "longmemeval"
created_at: "{date_str}"
session_id: "{public_id}"
wing: "longmemeval"
hall: "hall_facts"
room: "{public_id}"
pii_risk: "none"
ttl: null
tags: []
---

# Session: {public_id} ({date_str})

## Summary

{summary}

## Conversation

{conversation}
"""
    else:
        content = f"""\
# Session: {public_id}

Date: {date_str}

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
        lines.append(f"**{role}**: {content}\n")
    return "\n".join(lines)


def _slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:40]


def _date_prefix(date_str: str) -> str:
    """
    Build a stable chronological filename prefix.

    "2023/04/10 (Mon) 17:50" -> "2023-04-10-1750"
    """
    match = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2}).*?(\d{2}):(\d{2})", date_str)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}-{match.group(4)}{match.group(5)}"
    date_only = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2})", date_str)
    if date_only:
        return f"{date_only.group(1)}-{date_only.group(2)}-{date_only.group(3)}-0000"
    return _slugify(date_str)[:16]
