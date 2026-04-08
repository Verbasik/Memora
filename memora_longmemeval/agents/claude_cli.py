"""
claude_cli.py — обёртка над Claude Code CLI для headless-режима.

Использует: claude -p "prompt" --allowedTools "Read,Glob"
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path


# Пути где может лежать claude CLI (в порядке приоритета)
_CLAUDE_CANDIDATES = [
    "claude",                                          # на PATH (если есть)
    os.path.expanduser("~/.claude/local/claude"),     # стандартный путь установки
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
]


def _find_claude() -> str:
    """Возвращает путь к claude CLI или поднимает RuntimeError."""
    # Сначала пробуем shutil.which — найдёт если в PATH
    found = shutil.which("claude")
    if found:
        return found
    # Затем известные фиксированные пути
    for candidate in _CLAUDE_CANDIDATES[1:]:
        if Path(candidate).exists():
            return candidate
    raise RuntimeError(
        "Claude Code CLI не найден.\n"
        "Установи: npm install -g @anthropic-ai/claude-code\n"
        "Или укажи путь явно: ClaudeAgent(binary='/path/to/claude')"
    )


class ClaudeAgent:
    """
    Запускает Claude Code CLI в headless-режиме (-p/--print).

    Args:
        model:          алиас модели (sonnet, opus, haiku) или полное имя
        timeout:        таймаут на один вопрос в секундах
        allowed_tools:  инструменты разрешённые агенту
    """

    def __init__(
        self,
        model: str = "sonnet",
        timeout: int = 120,
        allowed_tools: str = "Read,Glob",
        binary: str | None = None,
    ):
        self.model = model
        self.timeout = timeout
        self.allowed_tools = allowed_tools
        self._binary = binary or _find_claude()

    def answer(
        self,
        question: str,
        question_date: str,
        workspace: Path,
        mode: str = "direct",
    ) -> str:
        """
        Запускает агента в workspace и возвращает извлечённый ответ.

        Args:
            mode: "direct" (читать SESSIONS/ напрямую) или
                  "memora" (использовать memory-restore skill)
        """
        prompt = _build_prompt(question, question_date, mode=mode)

        cmd = [
            self._binary,
            "--print",
            "--model", self.model,
            "--allowedTools", self.allowed_tools,
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
            output = result.stdout.strip()
        except subprocess.TimeoutExpired:
            return "I don't know"
        except FileNotFoundError:
            raise RuntimeError(f"Claude CLI не найден по пути: {self._binary}")

        return _extract_answer(output)

    def __repr__(self) -> str:
        return f"ClaudeAgent(model={self.model!r}, binary={self._binary!r})"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(question: str, question_date: str, mode: str = "direct") -> str:
    if mode == "memora":
        return f"""\
The question was asked on {question_date}.

Use memory-restore to load context from the memory bank (SESSIONS/ files contain the relevant chat history).
After restoring context, answer the question below.

Output ONLY your final answer in this exact format: ANSWER: <your answer>

Question: {question}"""
    else:
        return f"""\
The question was asked on {question_date}.

Instructions:
1. Use Glob to list all files in memory-bank/.local/SESSIONS/
2. Use Read to read each session file
3. Based on the sessions, answer the question below
4. Output ONLY your final answer in this exact format: ANSWER: <your answer>

Question: {question}"""


def _extract_answer(output: str) -> str:
    """Извлекает ответ из вывода CLI после маркера ANSWER:"""
    # Ищем последний ANSWER: в выводе (агент может рассуждать до этого)
    matches = re.findall(r"ANSWER:\s*(.+?)(?:\n|$)", output, re.IGNORECASE)
    if matches:
        return matches[-1].strip()

    # Fallback: последняя непустая строка
    lines = [l.strip() for l in output.splitlines() if l.strip()]
    if lines:
        last = lines[-1]
        # Убираем markdown-артефакты
        last = re.sub(r"^[*_`#>]+|[*_`]+$", "", last).strip()
        return last if last else "I don't know"

    return "I don't know"
