"""
claude_cli.py — обёртка над Claude Code CLI для headless-режима.

Использует: claude --print "prompt"
Агент использует memory-restore skill и отвечает через ANSWER: маркер.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path


_CLAUDE_CANDIDATES = [
    "claude",
    os.path.expanduser("~/.claude/local/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
]


def _find_claude() -> str:
    found = shutil.which("claude")
    if found:
        return found
    for path in _CLAUDE_CANDIDATES[1:]:
        if Path(path).exists():
            return path
    raise RuntimeError(
        "Claude Code CLI не найден.\n"
        "Установи: npm install -g @anthropic-ai/claude-code\n"
        "Или укажи путь явно: ClaudeAgent(binary='/path/to/claude')"
    )


class ClaudeAgent:
    """
    Запускает Claude Code CLI в headless-режиме.

    Агент получает полный Memora workspace (skills, AGENTS.md, CURRENT.md с
    индексом всех сессий) и использует memory-restore для загрузки контекста.
    """

    def __init__(
        self,
        model: str = "sonnet",
        timeout: int = 180,
        binary: str | None = None,
    ):
        self.model = model
        self.timeout = timeout
        self._binary = binary or _find_claude()

    def answer(self, question: str, question_date: str, workspace: Path) -> str:
        """
        Запускает агента в workspace и возвращает ответ.

        Агент:
        1. Запускает memory-restore (читает HANDOFF → CURRENT с индексом сессий → Essential Story)
        2. Из CURRENT.md видит полный список всех сессий
        3. Читает релевантные SESSIONS/*.md
        4. Отвечает на вопрос
        """
        prompt = _build_prompt(question, question_date)

        cmd = [
            self._binary,
            "--print",
            "--model", self.model,
            "--allowedTools", "Read,Glob",
            "--no-session-persistence",
            prompt,
        ]

        try:
            result = subprocess.run(
                cmd,
                cwd=str(workspace),
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            return _extract_answer(result.stdout)
        except subprocess.TimeoutExpired:
            return "I don't know"
        except FileNotFoundError:
            raise RuntimeError(f"Claude CLI не найден: {self._binary}")

    def __repr__(self) -> str:
        return f"ClaudeAgent(model={self.model!r})"


# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(question: str, question_date: str) -> str:
    return f"""\
The question was asked on {question_date}.

Step 1: Run memory-restore to load context.
  - Read memory-bank/.local/HANDOFF.md
  - Read memory-bank/.local/CURRENT.md — it contains an index of ALL available sessions
  - Based on the session index in CURRENT.md, identify which sessions are relevant
  - Read those session files from memory-bank/.local/SESSIONS/

Step 2: Answer the question based on the loaded context.

Output ONLY: ANSWER: <your answer>
If the information is not found: ANSWER: I don't know

Question: {question}"""


def _extract_answer(output: str) -> str:
    matches = re.findall(r"ANSWER:\s*(.+?)(?:\n|$)", output, re.IGNORECASE)
    if matches:
        return matches[-1].strip()
    lines = [l.strip() for l in output.splitlines() if l.strip()]
    if lines:
        last = re.sub(r"^[*_`#>]+|[*_`]+$", "", lines[-1]).strip()
        return last or "I don't know"
    return "I don't know"
