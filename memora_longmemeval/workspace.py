"""
workspace.py — создаёт изолированный Memora workspace для одного вопроса LongMemEval

Два режима:
    mode="direct"  — агент читает SESSIONS/*.md напрямую (baseline)
    mode="memora"  — агент использует memory-restore skill (настоящий Memora)
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

# Корень репозитория Memora (relative to this file)
MEMORA_ROOT = Path(__file__).parent.parent


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

class MemoraWorkspace:
    """
    Временный workspace с минимальной структурой Memora.
    Использовать как context manager:

        with MemoraWorkspace(mode="memora") as ws:
            ws.sessions_dir  # Path к .local/SESSIONS/
            ws.path          # Path к корню workspace
            ws.mode          # "direct" | "memora"

    Режимы:
        "direct" — минимальный workspace, агент читает файлы напрямую (baseline)
        "memora" — полный workspace со skills, агент использует memory-restore
    """

    def __init__(self, mode: str = "direct", keep: bool = False):
        """
        Args:
            mode: "direct" (baseline) или "memora" (настоящий Memora)
            keep: не удалять workspace после выхода (для отладки)
        """
        assert mode in ("direct", "memora"), f"Неизвестный режим: {mode}"
        self.mode = mode
        self._keep = keep
        self._tmpdir: tempfile.TemporaryDirectory | None = None
        self.path: Path | None = None

    # ── context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> "MemoraWorkspace":
        self._tmpdir = tempfile.TemporaryDirectory(prefix=f"memora_lme_{self.mode}_")
        self.path = Path(self._tmpdir.name)
        self._setup()
        return self

    def __exit__(self, *_):
        if not self._keep and self._tmpdir:
            self._tmpdir.cleanup()

    # ── paths ─────────────────────────────────────────────────────────────────

    @property
    def sessions_dir(self) -> Path:
        return self.path / "memory-bank" / ".local" / "SESSIONS"

    @property
    def memory_bank_dir(self) -> Path:
        return self.path / "memory-bank"

    # ── setup ─────────────────────────────────────────────────────────────────

    def _setup(self):
        """Создаёт структуру Memora в tmpdir согласно режиму."""
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        (self.path / "memory-bank" / ".local").mkdir(parents=True, exist_ok=True)

        # INDEX.md — всегда нужен для маршрутизации
        src_index = MEMORA_ROOT / "memory-bank" / "INDEX.md"
        if src_index.exists():
            shutil.copy(src_index, self.path / "memory-bank" / "INDEX.md")

        # CURRENT.md и HANDOFF.md — пустые (нет предыдущей сессии)
        (self.path / "memory-bank" / ".local" / "CURRENT.md").write_text(
            "# Current\n\n(benchmark session — no prior tasks)\n", encoding="utf-8"
        )
        (self.path / "memory-bank" / ".local" / "HANDOFF.md").write_text(
            "# Handoff\n\n(benchmark session — no prior handoff)\n", encoding="utf-8"
        )

        if self.mode == "direct":
            self._setup_direct()
        else:
            self._setup_memora()

    def _setup_direct(self):
        """Baseline: CLAUDE.md говорит агенту читать SESSIONS/ напрямую."""
        (self.path / "CLAUDE.md").write_text(_CLAUDE_MD_DIRECT, encoding="utf-8")

    def _setup_memora(self):
        """
        Настоящий Memora: копирует skills и AGENTS.md из репозитория.
        Агент будет использовать memory-restore для загрузки контекста.
        """
        # CLAUDE.md → указывает на AGENTS.md (стандартный Memora entry point)
        (self.path / "CLAUDE.md").write_text(_CLAUDE_MD_MEMORA, encoding="utf-8")

        # Копируем AGENTS.md
        src_agents = MEMORA_ROOT / "AGENTS.md"
        if src_agents.exists():
            shutil.copy(src_agents, self.path / "AGENTS.md")

        # Копируем skills (.claude/skills/)
        src_skills = MEMORA_ROOT / ".claude" / "skills"
        dst_skills = self.path / ".claude" / "skills"
        if src_skills.exists():
            shutil.copytree(src_skills, dst_skills, dirs_exist_ok=True)

        # Копируем rules (.claude/rules/)
        src_rules = MEMORA_ROOT / ".claude" / "rules"
        dst_rules = self.path / ".claude" / "rules"
        if src_rules.exists():
            shutil.copytree(src_rules, dst_rules, dirs_exist_ok=True)

        # Копируем ключевые PATTERNS (нужны skills)
        src_patterns = MEMORA_ROOT / "memory-bank" / "PATTERNS"
        dst_patterns = self.path / "memory-bank" / "PATTERNS"
        if src_patterns.exists():
            shutil.copytree(src_patterns, dst_patterns, dirs_exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# CLAUDE.md шаблоны
# ─────────────────────────────────────────────────────────────────────────────

_CLAUDE_MD_DIRECT = """\
# LongMemEval Benchmark — Direct Mode

## Task
Answer a question based on stored chat sessions.

## Instructions
1. Use Glob to list all files in `memory-bank/.local/SESSIONS/`
2. Use Read to read each session file
3. Answer the question
4. Output ONLY: `ANSWER: <your answer>`

## Rules
- Read ONLY files from `memory-bank/.local/SESSIONS/`
- If unsure: `ANSWER: I don't know`
- Keep the answer brief (1-2 sentences)
"""

_CLAUDE_MD_MEMORA = """\
# LongMemEval Benchmark — Memora Mode

Read and follow all instructions from AGENTS.md.
Read memory-bank/INDEX.md for navigation.

## Benchmark task
After restoring context with memory-restore, answer the user's question.
Output ONLY: `ANSWER: <your answer>`
"""
