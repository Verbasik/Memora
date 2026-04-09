from pathlib import Path

from memora_longmemeval.ingestor import ingest
from memora_longmemeval.modes import MODE_MEMORA_MIN


def test_ingestor_sorts_sessions_and_writes_neutral_current(tmp_path: Path):
    item = {
        "question_id": "q1",
        "question": "Which event happened first?",
        "question_type": "temporal-reasoning",
        "question_date": "2023/04/15 (Sat) 12:00",
        "haystack_dates": [
            "2023/04/12 (Wed) 10:00",
            "2023/04/10 (Mon) 17:50",
            "2023/04/11 (Tue) 09:00",
        ],
        "haystack_session_ids": [
            "answer_late",
            "answer_first",
            "answer_middle",
        ],
        "haystack_sessions": [
            [{"role": "user", "content": "late event details", "has_answer": True}],
            [{"role": "user", "content": "first event details", "has_answer": True}],
            [{"role": "user", "content": "middle event details", "has_answer": True}],
        ],
    }

    sessions_dir = tmp_path / "memory-bank" / ".local" / "SESSIONS"
    meta = ingest(
        item=item,
        workspace_path=tmp_path,
        sessions_dir=sessions_dir,
        mode=MODE_MEMORA_MIN,
    )

    current = (tmp_path / "memory-bank" / ".local" / "CURRENT.md").read_text(encoding="utf-8")
    handoff = (tmp_path / "memory-bank" / ".local" / "HANDOFF.md").read_text(encoding="utf-8")
    session_blob = "\n".join(
        path.read_text(encoding="utf-8") for path in sorted(sessions_dir.glob("*.md"))
    )

    assert meta["n_sessions"] == 3
    assert "first event details" not in current
    assert "middle event details" not in current
    assert "late event details" not in current
    assert "answer_first" not in current
    assert "answer_middle" not in handoff
    assert "answer_late" not in session_blob
    assert "⭐" not in session_blob

    rows = [line for line in current.splitlines() if line.startswith("| 2023/")]
    assert rows == [
        "| 2023/04/10 (Mon) 17:50 | session_0001 | `memory-bank/.local/SESSIONS/2023-04-10-1750-0000-session_0001.md` |",
        "| 2023/04/11 (Tue) 09:00 | session_0002 | `memory-bank/.local/SESSIONS/2023-04-11-0900-0001-session_0002.md` |",
        "| 2023/04/12 (Wed) 10:00 | session_0003 | `memory-bank/.local/SESSIONS/2023-04-12-1000-0002-session_0003.md` |",
    ]
