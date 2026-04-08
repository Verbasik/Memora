"""
workspace.py — создаёт изолированный Memora workspace для одного вопроса LongMemEval
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

        with MemoraWorkspace() as ws:
            ws.sessions_dir  # Path к .local/SESSIONS/
            ws.path          # Path к корню workspace
    """

    def __init__(self, keep: bool = False):
        """keep=True — не удалять после выхода (для отладки)."""
        self._keep = keep
        self._tmpdir: tempfile.TemporaryDirectory | None = None
        self.path: Path | None = None

    # ── context manager ───────────────────────────────────────────────────────

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
        return self.path / "memory-bank" / ".local" / "SESSIONS"

    @property
    def memory_bank_dir(self) -> Path:
        return self.path / "memory-bank"

    # ── setup ─────────────────────────────────────────────────────────────────

    def _setup(self):
        """Создаёт минимальную структуру Memora в tmpdir."""
        # Директории
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        (self.path / "memory-bank" / ".local").mkdir(parents=True, exist_ok=True)

        # Минимальный CLAUDE.md — инструкция для агента
        (self.path / "CLAUDE.md").write_text(_CLAUDE_MD, encoding="utf-8")

        # Копируем INDEX.md для корректной маршрутизации (если есть)
        src_index = MEMORA_ROOT / "memory-bank" / "INDEX.md"
        if src_index.exists():
            shutil.copy(src_index, self.path / "memory-bank" / "INDEX.md")

        # Пустые CURRENT.md и HANDOFF.md
        (self.path / "memory-bank" / ".local" / "CURRENT.md").write_text(
            "# Current\n\n(benchmark session — no active tasks)\n", encoding="utf-8"
        )
        (self.path / "memory-bank" / ".local" / "HANDOFF.md").write_text(
            "# Handoff\n\n(benchmark session)\n", encoding="utf-8"
        )


# ─────────────────────────────────────────────────────────────────────────────
# CLAUDE.md template для benchmark workspace
# ─────────────────────────────────────────────────────────────────────────────

_CLAUDE_MD = """\
# LongMemEval Benchmark Workspace

Ты участвуешь в бенчмарке LongMemEval.

## Твоя задача
1. Прочитай все файлы сессий из `memory-bank/.local/SESSIONS/`
2. На основе прочитанного ответь на вопрос пользователя
3. Выведи ТОЛЬКО финальный ответ в формате: `ANSWER: <ответ>`

## Правила
- Читай ТОЛЬКО файлы из `memory-bank/.local/SESSIONS/`
- Не читай другие файлы и не запускай команды
- Если информации недостаточно — отвечай `ANSWER: I don't know`
- Ответ должен быть кратким: 1-2 предложения максимум
- Если вопрос про время — используй дату сессий как контекст
"""
