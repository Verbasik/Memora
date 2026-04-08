#!/usr/bin/env python3
"""
evaluate.py — LLM-судья на основе CLI-агентов (Codex / Claude).

Заменяет evaluate_qa.py из LongMemEval репозитория.
Не требует OPENAI_API_KEY — использует Codex CLI или Claude CLI.

Usage:
    # Codex как судья (default)
    python memora_longmemeval/evaluate.py \\
        results/longmemeval_oracle_memora_haiku.jsonl \\
        data/longmemeval_oracle.json

    # Claude как судья
    python memora_longmemeval/evaluate.py \\
        results/longmemeval_oracle_memora_haiku.jsonl \\
        data/longmemeval_oracle.json \\
        --judge claude --judge-model haiku

    # С параллельностью (быстрее)
    python memora_longmemeval/evaluate.py \\
        results/longmemeval_oracle_memora_haiku.jsonl \\
        data/longmemeval_oracle.json \\
        --concurrency 8

Output:
    Создаёт <input>.log — JSONL с добавленным полем autoeval_label (0/1).
    Совместим со stats.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


# ─────────────────────────────────────────────────────────────────────────────
# Judge prompt
# ─────────────────────────────────────────────────────────────────────────────

_JUDGE_PROMPT = """\
You are evaluating whether a system's answer is correct.

Question: {question}
Correct answer: {correct_answer}
System answer: {hypothesis}

Is the system answer correct?
Rules:
- Minor wording differences are OK (e.g. "Italian food" == "He prefers Italian cuisine")
- Partial answers that contain the key information count as CORRECT
- "I don't know" when there IS a correct answer is INCORRECT
- Extra details beyond the correct answer are OK

Answer with exactly one word: CORRECT or INCORRECT"""


# ─────────────────────────────────────────────────────────────────────────────
# CLI wrappers
# ─────────────────────────────────────────────────────────────────────────────

def _find_claude() -> str:
    found = shutil.which("claude")
    if found:
        return found
    candidate = os.path.expanduser("~/.claude/local/claude")
    if Path(candidate).exists():
        return candidate
    raise RuntimeError("Claude CLI не найден")


def _judge_with_codex(prompt: str, model: str, timeout: int) -> int:
    cmd = ["codex", "--full-auto", "--quiet", "--model", model, prompt]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return _parse_verdict(r.stdout)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return -1  # ошибка


def _judge_with_claude(prompt: str, model: str, timeout: int, binary: str) -> int:
    cmd = [binary, "--print", "--model", model,
           "--no-session-persistence", prompt]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return _parse_verdict(r.stdout)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return -1


def _parse_verdict(output: str) -> int:
    """1 = CORRECT, 0 = INCORRECT, -1 = не распознано."""
    text = output.strip().upper()
    # Ищем последнее вхождение CORRECT/INCORRECT
    matches = re.findall(r"\b(CORRECT|INCORRECT)\b", text)
    if matches:
        return 1 if matches[-1] == "CORRECT" else 0
    # Fallback по ключевым словам
    if "INCORRECT" in text or "WRONG" in text or "NO" == text:
        return 0
    if "CORRECT" in text or "YES" == text:
        return 1
    return -1


# ─────────────────────────────────────────────────────────────────────────────
# Main evaluation logic
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_one(
    result: dict,
    dataset: dict[str, dict],
    judge: str,
    judge_model: str,
    timeout: int,
    claude_binary: str | None = None,
) -> dict:
    qid = result["question_id"]
    hypothesis = result.get("hypothesis", "")

    if qid not in dataset:
        return {**result, "autoeval_label": -1, "judge_error": "qid not in dataset"}

    item = dataset[qid]
    question = item["question"]
    correct_answer = item["answer"]

    prompt = _JUDGE_PROMPT.format(
        question=question,
        correct_answer=correct_answer,
        hypothesis=hypothesis,
    )

    t0 = time.time()
    if judge == "codex":
        label = _judge_with_codex(prompt, judge_model, timeout)
    else:
        label = _judge_with_claude(prompt, judge_model, timeout, claude_binary or _find_claude())
    elapsed = round(time.time() - t0, 2)

    return {
        **result,
        "autoeval_label": label,
        "judge_elapsed_s": elapsed,
        "correct_answer": correct_answer,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

def run_evaluation(
    results_path: str,
    dataset_path: str,
    judge: str = "codex",
    judge_model: str | None = None,
    output_path: str | None = None,
    concurrency: int = 4,
    timeout: int = 60,
    limit: int | None = None,
) -> list[dict]:

    # ── Загрузка ──────────────────────────────────────────────────────────────
    results = []
    with open(results_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                results.append(json.loads(line))

    with open(dataset_path, encoding="utf-8") as f:
        dataset_list = json.load(f)
    dataset = {item["question_id"]: item for item in dataset_list}

    if limit:
        results = results[:limit]

    # ── Дефолтные модели ──────────────────────────────────────────────────────
    if judge_model is None:
        judge_model = "o4-mini" if judge == "codex" else "haiku"

    # ── Claude binary ─────────────────────────────────────────────────────────
    claude_binary = None
    if judge == "claude":
        claude_binary = _find_claude()

    total = len(results)
    print(f"[INFO] Судья: {judge} ({judge_model})")
    print(f"[INFO] Вопросов: {total} | Параллельность: {concurrency}")

    output_file = output_path or (results_path + ".log")

    # ── Параллельная оценка ───────────────────────────────────────────────────
    evaluated: list[dict] = []
    errors = 0

    def judge_one(r):
        return evaluate_one(r, dataset, judge, judge_model, timeout, claude_binary)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(judge_one, r): i for i, r in enumerate(results)}
        done = 0
        for fut in as_completed(futures):
            done += 1
            r = fut.result()
            label = r.get("autoeval_label", -1)
            status = "✓" if label == 1 else ("✗" if label == 0 else "?")
            qtype = r.get("question_type", "")[:20]
            hyp = r.get("hypothesis", "")[:50]
            print(f"  [{done:3d}/{total}] {status} [{qtype:20s}] {hyp}…")
            if label == -1:
                errors += 1
            evaluated.append(r)

    # Восстанавливаем порядок
    id_order = {r["question_id"]: i for i, r in enumerate(results)}
    evaluated.sort(key=lambda r: id_order.get(r["question_id"], 0))

    # ── Запись вывода ─────────────────────────────────────────────────────────
    with open(output_file, "w", encoding="utf-8") as f:
        for r in evaluated:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ── Отчёт ─────────────────────────────────────────────────────────────────
    _print_report(evaluated, errors, output_file)

    return evaluated


def _print_report(evaluated: list[dict], errors: int, output_file: str):
    labels = [r["autoeval_label"] for r in evaluated if r["autoeval_label"] != -1]
    total = len(evaluated)
    scored = len(labels)
    correct = sum(labels)
    acc = correct / scored if scored else 0

    by_type: dict[str, list[int]] = defaultdict(list)
    for r in evaluated:
        if r["autoeval_label"] == -1:
            continue
        qtype = r.get("question_type", "unknown")
        by_type[qtype].append(r["autoeval_label"])

    print(f"\n{'═' * 55}")
    print(f"  Overall Accuracy: {acc:.1%}  ({correct}/{scored})")
    if errors:
        print(f"  Ошибок оценки:   {errors} (judge не ответил)")
    print(f"{'─' * 55}")
    print(f"  {'Тип вопроса':<35} {'N':>4}  {'Acc':>6}")
    print(f"{'─' * 55}")
    for qtype in sorted(by_type):
        lbls = by_type[qtype]
        a = sum(lbls) / len(lbls) if lbls else 0
        print(f"  {qtype:<35} {len(lbls):>4}  {a:>6.1%}")
    print(f"{'═' * 55}")
    print(f"\n[DONE] → {output_file}")
    print(f"\nДля сравнения двух прогонов:")
    print(f"  python memora_longmemeval/stats.py {output_file} <dataset.json>")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="LLM-оценщик результатов бенчмарка через CLI-агентов",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("results", help="JSONL с hypothesis (вывод bench.py)")
    p.add_argument("dataset", help="longmemeval_*.json")
    p.add_argument(
        "--judge",
        choices=["codex", "claude"],
        default="codex",
        help="CLI-агент-судья (default: codex)",
    )
    p.add_argument(
        "--judge-model",
        default=None,
        help="Модель судьи (default: o4-mini для codex, haiku для claude)",
    )
    p.add_argument("--output", default=None, help="Путь к выходному .log файлу")
    p.add_argument("--concurrency", type=int, default=4,
                   help="Параллельных оценок (default: 4)")
    p.add_argument("--timeout", type=int, default=60,
                   help="Таймаут на одну оценку в секундах (default: 60)")
    p.add_argument("--limit", type=int, default=None,
                   help="Оценить только первые N результатов")
    args = p.parse_args()

    run_evaluation(
        results_path=args.results,
        dataset_path=args.dataset,
        judge=args.judge,
        judge_model=args.judge_model,
        output_path=args.output,
        concurrency=args.concurrency,
        timeout=args.timeout,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
