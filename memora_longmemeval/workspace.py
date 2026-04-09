"""
workspace.py — изолированный Memora workspace для одного вопроса LongMemEval.

Workspace — полноценная копия Memora: skills, AGENTS.md, PATTERNS/, INDEX.md.
Агент использует memory-restore для загрузки контекста и отвечает на вопрос.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from memora_longmemeval.modes import MODE_MEMORA_MIN, is_memora_mode, uses_kg

MEMORA_ROOT = Path(__file__).parent.parent


class MemoraWorkspace:
    """
    Временный Memora workspace с полным набором компонентов.

    Содержит:
      - .claude/skills/  (memory-restore, update-memory, и др.)
      - AGENTS.md        (entry point для агента)
      - CLAUDE.md        (указывает на AGENTS.md)
      - memory-bank/     (INDEX.md, PATTERNS/, .local/SESSIONS/)

    Использование:
        with MemoraWorkspace() as ws:
            ws.sessions_dir   # Path к .local/SESSIONS/
            ws.path           # Path к корню workspace
            ws.kg_path        # Path к knowledge_graph.db
    """

    def __init__(self, keep: bool = False, mode: str = MODE_MEMORA_MIN):
        """keep=True — не удалять после выхода (для отладки)."""
        self._keep = keep
        self.mode = mode
        self._tmpdir: tempfile.TemporaryDirectory | None = None
        self.path: Path | None = None

    def __enter__(self) -> "MemoraWorkspace":
        self._tmpdir = tempfile.TemporaryDirectory(prefix="memora_lme_")
        self.path = Path(self._tmpdir.name)
        self._setup()
        return self

    def __exit__(self, *_):
        if not self._keep and self._tmpdir:
            self._tmpdir.cleanup()

    # ── paths ─────────────────────────────────────────────────────────────────

    @property
    def sessions_dir(self) -> Path:
        if is_memora_mode(self.mode):
            return self.path / "memory-bank" / ".local" / "SESSIONS"
        return self.path / "history" / "SESSIONS"

    @property
    def local_dir(self) -> Path:
        if is_memora_mode(self.mode):
            return self.path / "memory-bank" / ".local"
        return self.path / "history"

    @property
    def kg_path(self) -> Path:
        return self.local_dir / "knowledge_graph.db"

    # ── setup ─────────────────────────────────────────────────────────────────

    def _setup(self):
        # Директории
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

        if is_memora_mode(self.mode):
            # CLAUDE.md → указывает агента на AGENTS.md
            (self.path / "CLAUDE.md").write_text(_CLAUDE_MD, encoding="utf-8")

            # AGENTS.md
            src = MEMORA_ROOT / "AGENTS.md"
            if src.exists():
                shutil.copy(src, self.path / "AGENTS.md")

            # .claude/skills/ — все skills
            src_skills = MEMORA_ROOT / ".claude" / "skills"
            if src_skills.exists():
                shutil.copytree(src_skills, self.path / ".claude" / "skills")

            # .claude/rules/
            src_rules = MEMORA_ROOT / ".claude" / "rules"
            if src_rules.exists():
                shutil.copytree(src_rules, self.path / ".claude" / "rules")

            # memory-bank/INDEX.md
            src_index = MEMORA_ROOT / "memory-bank" / "INDEX.md"
            if src_index.exists():
                dst_mb = self.path / "memory-bank"
                dst_mb.mkdir(exist_ok=True)
                shutil.copy(src_index, dst_mb / "INDEX.md")

            # memory-bank/PATTERNS/
            src_patterns = MEMORA_ROOT / "memory-bank" / "PATTERNS"
            if src_patterns.exists():
                shutil.copytree(src_patterns, self.path / "memory-bank" / "PATTERNS")

            # memory-bank/scripts/ — only for full mode where KG is part of the claim
            src_scripts = MEMORA_ROOT / "memory-bank" / "scripts"
            if uses_kg(self.mode) and src_scripts.exists():
                shutil.copytree(src_scripts, self.path / "memory-bank" / "scripts")
        else:
            (self.path / "README_BENCH.md").write_text(_FLAT_BASELINE_README, encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# CLAUDE.md
# ─────────────────────────────────────────────────────────────────────────────

_CLAUDE_MD = """\
# Memora — LongMemEval Benchmark

Read and follow all instructions from AGENTS.md.
Read memory-bank/INDEX.md for navigation.

## Benchmark task
After restoring context with memory-restore, answer the user's question.
Output ONLY the answer in this format: `ANSWER: <your answer>`
If uncertain: `ANSWER: I don't know`
"""


_FLAT_BASELINE_README = """\
# LongMemEval Flat Baseline Workspace

This workspace intentionally omits Memora scaffolding.

Available history lives under:

- `history/SESSIONS/`

Read the session files directly and answer the benchmark question.
"""
