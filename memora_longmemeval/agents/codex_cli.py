"""
codex_cli.py — обёртка над Codex CLI для headless-режима.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from memora_longmemeval.modes import MODE_FLAT_BASELINE, MODE_MEMORA_FULL


class CodexAgent:
    def __init__(self, model: str = "gpt-5.2", timeout: int = 180):
        self.model = model
        self.timeout = timeout

    def answer(
        self,
        question: str,
        question_date: str,
        workspace: Path,
        mode: str,
    ) -> tuple[str, dict]:
        prompt = _build_prompt(question, question_date, mode)
        with tempfile.NamedTemporaryFile(prefix="codex-last-", suffix=".txt", delete=False) as tmp:
            output_path = tmp.name
        cmd = [
            "codex",
            "exec",
            "--full-auto",
            "--skip-git-repo-check",
            "--color",
            "never",
            "--model",
            self.model,
            "-o",
            output_path,
            prompt,
        ]
        try:
            result = subprocess.run(
                cmd, cwd=str(workspace), capture_output=True,
                text=True, timeout=self.timeout,
            )
            last_message = _read_last_message(output_path)
            hypothesis = _extract_answer(last_message or result.stdout)
            # Codex CLI doesn't expose tool calls in structured format — trace is empty
            trace = {"read_handoff": False, "read_current": False,
                     "sessions_read": 0, "files_read": [], "retrieved_files": [],
                     "memora_used": None}
            return hypothesis, trace
        except subprocess.TimeoutExpired:
            return "I don't know", {"read_handoff": False, "read_current": False,
                                    "sessions_read": 0, "files_read": [], "retrieved_files": [],
                                    "memora_used": None}
        except FileNotFoundError:
            raise RuntimeError("Codex CLI не найден. Установи: npm install -g @openai/codex")
        finally:
            Path(output_path).unlink(missing_ok=True)

    def __repr__(self) -> str:
        return f"CodexAgent(model={self.model!r})"


def _build_prompt(question: str, question_date: str, mode: str) -> str:
    if mode == MODE_FLAT_BASELINE:
        return f"""\
The question was asked on {question_date}.

You are in a flat benchmark workspace without Memora scaffolding.

Read the relevant session files directly from:
  - history/SESSIONS/

Output ONLY: ANSWER: <your answer>
If not found: ANSWER: I don't know

Question: {question}"""

    kg_hint = ""
    if mode == MODE_MEMORA_FULL:
        kg_hint = """
  - If helpful, query the temporal KG via:
    python3 memory-bank/scripts/knowledge_graph.py query <entity>"""

    return f"""\
The question was asked on {question_date}.

Step 1: Run memory-restore to load context.
  - Read memory-bank/.local/HANDOFF.md
  - Read memory-bank/.local/CURRENT.md — contains a neutral index of all sessions
  - Based on the index, identify and read relevant sessions from memory-bank/.local/SESSIONS/
{kg_hint}

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


def _read_last_message(path: str) -> str:
    file_path = Path(path)
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8").strip()
