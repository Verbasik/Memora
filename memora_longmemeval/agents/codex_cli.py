"""
codex_cli.py — обёртка над Codex CLI для headless-режима.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


class CodexAgent:
    def __init__(self, model: str = "o4-mini", timeout: int = 180):
        self.model = model
        self.timeout = timeout

    def answer(self, question: str, question_date: str, workspace: Path) -> tuple[str, dict]:
        prompt = _build_prompt(question, question_date)
        cmd = ["codex", "--full-auto", "--quiet", "--model", self.model, prompt]
        try:
            result = subprocess.run(
                cmd, cwd=str(workspace), capture_output=True,
                text=True, timeout=self.timeout,
            )
            hypothesis = _extract_answer(result.stdout)
            # Codex CLI doesn't expose tool calls in structured format — trace is empty
            trace = {"read_handoff": False, "read_current": False,
                     "sessions_read": 0, "files_read": [], "memora_used": False}
            return hypothesis, trace
        except subprocess.TimeoutExpired:
            return "I don't know", {"read_handoff": False, "read_current": False,
                                    "sessions_read": 0, "files_read": [], "memora_used": False}
        except FileNotFoundError:
            raise RuntimeError("Codex CLI не найден. Установи: npm install -g @openai/codex")

    def __repr__(self) -> str:
        return f"CodexAgent(model={self.model!r})"


def _build_prompt(question: str, question_date: str) -> str:
    return f"""\
The question was asked on {question_date}.

Step 1: Run memory-restore to load context.
  - Read memory-bank/.local/HANDOFF.md
  - Read memory-bank/.local/CURRENT.md — contains an index of ALL sessions
  - Based on the index, identify and read relevant sessions from memory-bank/.local/SESSIONS/

Step 2: Answer the question.
Output ONLY: ANSWER: <your answer>
If not found: ANSWER: I don't know

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
