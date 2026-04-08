"""
claude_cli.py — обёртка над Claude Code CLI для headless-режима.

Использует --output-format json для захвата tool calls и верификации
что агент действительно читал Memora файлы (HANDOFF, CURRENT, SESSIONS/).
"""

from __future__ import annotations

import json
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

# Файлы Memora которые агент ДОЛЖЕН прочитать для верификации
_MEMORA_CORE_FILES = {
    "handoff":  "memory-bank/.local/HANDOFF.md",
    "current":  "memory-bank/.local/CURRENT.md",
}
_SESSIONS_PREFIX = "memory-bank/.local/SESSIONS/"


def _find_claude() -> str:
    found = shutil.which("claude")
    if found:
        return found
    for path in _CLAUDE_CANDIDATES[1:]:
        if Path(path).exists():
            return path
    raise RuntimeError(
        "Claude Code CLI не найден.\n"
        "Установи: npm install -g @anthropic-ai/claude-code"
    )


class ClaudeAgent:
    """
    Запускает Claude Code CLI в headless-режиме с верификацией Memora usage.

    Использует --output-format json чтобы захватить все tool calls и проверить
    что агент реально читал HANDOFF.md, CURRENT.md и SESSIONS/*.md.
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

    def answer(self, question: str, question_date: str, workspace: Path) -> tuple[str, dict]:
        """
        Запускает агента и возвращает (hypothesis, memora_trace).

        memora_trace содержит:
            read_handoff:   bool — читал ли HANDOFF.md
            read_current:   bool — читал ли CURRENT.md
            sessions_read:  int  — сколько SESSIONS/*.md прочитано
            files_read:     list — все прочитанные файлы
            memora_used:    bool — True если читал хотя бы CURRENT.md + 1 session
        """
        prompt = _build_prompt(question, question_date)

        cmd = [
            self._binary,
            "--print",
            "--output-format", "stream-json",
            "--verbose",
            "--model", self.model,
            "--allowedTools", "Read,Glob,Bash",
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
            return _parse_output(result.stdout)
        except subprocess.TimeoutExpired:
            return "I don't know", _empty_trace()
        except FileNotFoundError:
            raise RuntimeError(f"Claude CLI не найден: {self._binary}")

    def __repr__(self) -> str:
        return f"ClaudeAgent(model={self.model!r})"


# ─────────────────────────────────────────────────────────────────────────────
# Output parsing
# ─────────────────────────────────────────────────────────────────────────────

def _parse_output(raw: str) -> tuple[str, dict]:
    """
    Парсит NDJSON stream-json вывод Claude CLI (--output-format stream-json --verbose).

    Каждая строка — отдельный JSON event:
      {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read",...}]}}
      {"type":"result","result":"...","num_turns":N,...}

    Извлекаем:
      - финальный текст из event type=result
      - все tool_use блоки type=Read → список прочитанных файлов
    """
    trace = _empty_trace()
    hypothesis = "I don't know"
    files_read: list[str] = []

    result_text = ""
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue

        etype = event.get("type", "")

        if etype == "result":
            result_text = event.get("result", "")

        elif etype == "assistant":
            # Извлекаем tool_use блоки из assistant message
            content = event.get("message", {}).get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use" and block.get("name") == "Read":
                    path = block.get("input", {}).get("file_path", "")
                    rel = _to_relative(path)
                    if rel:
                        files_read.append(rel)

    # Если stream-json не вернул ничего — fallback на plain text
    if not result_text and not files_read:
        hypothesis = _extract_answer_text(raw)
        return hypothesis, trace

    hypothesis = _extract_answer_text(result_text) if result_text else "I don't know"

    # Строим trace
    trace["files_read"] = files_read
    trace["read_handoff"] = any(
        _MEMORA_CORE_FILES["handoff"] in f for f in files_read
    )
    trace["read_current"] = any(
        _MEMORA_CORE_FILES["current"] in f for f in files_read
    )
    sessions = [f for f in files_read if _SESSIONS_PREFIX in f]
    trace["sessions_read"] = len(sessions)
    trace["memora_used"] = trace["read_current"] and trace["sessions_read"] > 0

    return hypothesis, trace


def _to_relative(path: str) -> str:
    """Конвертирует абсолютный путь к относительному для унификации."""
    if not path:
        return ""
    # Убираем всё до memory-bank/ или .claude/
    for marker in ("memory-bank/", ".claude/", "AGENTS.md", "CLAUDE.md"):
        idx = path.find(marker)
        if idx != -1:
            return path[idx:]
    return path


def _extract_answer_text(text: str) -> str:
    """Извлекает ANSWER: из текста."""
    matches = re.findall(r"ANSWER:\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    if matches:
        return matches[-1].strip()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines:
        last = re.sub(r"^[*_`#>]+|[*_`]+$", "", lines[-1]).strip()
        return last or "I don't know"
    return "I don't know"


def _empty_trace() -> dict:
    return {
        "read_handoff":  False,
        "read_current":  False,
        "sessions_read": 0,
        "files_read":    [],
        "memora_used":   False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Prompt
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
