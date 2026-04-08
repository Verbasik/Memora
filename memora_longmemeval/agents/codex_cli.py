"""
codex_cli.py — обёртка над Codex CLI для headless-режима.

Использует: codex --full-auto --quiet "prompt"
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


class CodexAgent:
    """
    Запускает Codex CLI в headless/auto-режиме.

    Args:
        model:    имя модели (o4-mini, o3, gpt-4o, etc.)
        timeout:  таймаут на один вопрос в секундах
    """

    def __init__(
        self,
        model: str = "o4-mini",
        timeout: int = 120,
    ):
        self.model = model
        self.timeout = timeout

    def answer(self, question: str, question_date: str, workspace: Path, mode: str = "direct") -> str:
        """
        Запускает агента в workspace и возвращает извлечённый ответ.
        """
        prompt = _build_prompt(question, question_date, mode=mode)

        cmd = [
            "codex",
            "--full-auto",
            "--quiet",
            "--model", self.model,
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
            output = result.stdout.strip()
        except subprocess.TimeoutExpired:
            return "I don't know"
        except FileNotFoundError:
            raise RuntimeError(
                "Codex CLI не найден. Установи: npm install -g @openai/codex"
            )

        return _extract_answer(output)

    def __repr__(self) -> str:
        return f"CodexAgent(model={self.model!r})"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(question: str, question_date: str, mode: str = "direct") -> str:
    if mode == "memora":
        return f"""\
The question was asked on {question_date}.

Use memory-restore to load context from the memory bank (SESSIONS/ files contain the relevant chat history).
After restoring context, answer the question below.

Output ONLY: ANSWER: <your answer>

Question: {question}"""
    else:
        return f"""\
The question was asked on {question_date}.

Instructions:
1. List all files in memory-bank/.local/SESSIONS/
2. Read each session file
3. Based on the sessions, answer the question below
4. Output ONLY: ANSWER: <your answer>

Question: {question}"""


def _extract_answer(output: str) -> str:
    """Извлекает ответ из вывода CLI после маркера ANSWER:"""
    matches = re.findall(r"ANSWER:\s*(.+?)(?:\n|$)", output, re.IGNORECASE)
    if matches:
        return matches[-1].strip()

    lines = [l.strip() for l in output.splitlines() if l.strip()]
    if lines:
        last = lines[-1]
        last = re.sub(r"^[*_`#>]+|[*_`]+$", "", last).strip()
        return last if last else "I don't know"

    return "I don't know"
