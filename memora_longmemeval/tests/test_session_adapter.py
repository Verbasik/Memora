from pathlib import Path

from memora_longmemeval.modes import MODE_FLAT_BASELINE, MODE_MEMORA_MIN
from memora_longmemeval.session_adapter import write_sessions


def _sample_sessions():
    return [
        [
            {
                "role": "user",
                "content": "I bought a bike yesterday and the GPS system failed.",
                "has_answer": True,
            },
            {"role": "assistant", "content": "That sounds frustrating."},
        ]
    ]


def test_memora_session_materialization_removes_gold_leakage(tmp_path: Path):
    artifacts = write_sessions(
        haystack_sessions=_sample_sessions(),
        haystack_dates=["2023/04/10 (Mon) 17:50"],
        haystack_session_ids=["answer_secret_1"],
        sessions_dir=tmp_path,
        mode=MODE_MEMORA_MIN,
    )

    assert len(artifacts) == 1
    artifact = artifacts[0]
    content = artifact.path.read_text(encoding="utf-8")

    assert artifact.public_id == "session_0001"
    assert artifact.source_id == "answer_secret_1"
    assert artifact.path.name.startswith("2023-04-10-1750-0000-session_0001")

    assert "answer_secret_1" not in content
    assert "evidence session" not in content
    assert "⭐" not in content
    assert "has_answer" not in content
    assert 'session_id: "session_0001"' in content


def test_flat_baseline_sessions_do_not_use_memora_frontmatter(tmp_path: Path):
    artifacts = write_sessions(
        haystack_sessions=_sample_sessions(),
        haystack_dates=["2023/04/10 (Mon) 17:50"],
        haystack_session_ids=["answer_secret_1"],
        sessions_dir=tmp_path,
        mode=MODE_FLAT_BASELINE,
    )

    content = artifacts[0].path.read_text(encoding="utf-8")

    assert not content.startswith("---")
    assert "# Session: session_0001" in content
    assert "wing:" not in content
    assert "hall:" not in content
    assert "room:" not in content
