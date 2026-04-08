#!/usr/bin/env python3
"""
Memora × LongMemEval Benchmark
================================

Тестирует Memora на бенчмарке LongMemEval через CLI-агентов (Claude Code / Codex).

Для каждого из 500 вопросов:
1. Создаёт изолированный Memora workspace во временной директории
2. Конвертирует haystack_sessions → SESSIONS/*.md
3. Запускает CLI-агента (claude -p / codex --full-auto) в этом workspace
4. Собирает ответ → JSONL для evaluate_qa.py

Usage:
    # Базовый запуск (Claude, oracle dataset, первые 20 вопросов)
    python memora_longmemeval/bench.py data/longmemeval_oracle.json

    # С ограничением и явным агентом
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --agent claude --model sonnet --limit 50

    # Codex агент
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --agent codex --model o4-mini --limit 20

    # Фильтрация по типу вопроса
    python memora_longmemeval/bench.py data/longmemeval_s_cleaned.json \\
        --question-type temporal-reasoning --limit 30

    # Сохранить workspace для отладки (первый вопрос)
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --limit 1 --keep-workspace

Output:
    Создаёт файл <dataset_name>_<agent>_<timestamp>.jsonl
    Совместим с evaluate_qa.py из оригинального LongMemEval репозитория.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# Добавляем корень репозитория в путь
sys.path.insert(0, str(Path(__file__).parent.parent))

from memora_longmemeval.session_adapter import write_sessions
from memora_longmemeval.workspace import MemoraWorkspace
from memora_longmemeval.agents import ClaudeAgent, CodexAgent


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Memora × LongMemEval — CLI-agent benchmark runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("data_file", help="Путь к longmemeval_*.json")
    p.add_argument(
        "--agent",
        choices=["claude", "codex"],
        default="claude",
        help="CLI-агент для запуска (default: claude)",
    )
    p.add_argument(
        "--model",
        default=None,
        help="Модель агента. Claude: sonnet/opus/haiku. Codex: o4-mini/o3/gpt-4o",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Максимальное количество вопросов (для быстрого теста)",
    )
    p.add_argument(
        "--question-type",
        default=None,
        help=(
            "Фильтр по типу вопроса: single-session-user, single-session-assistant, "
            "single-session-preference, temporal-reasoning, knowledge-update, multi-session"
        ),
    )
    p.add_argument(
        "--output",
        default=None,
        help="Путь к выходному JSONL файлу (default: авто)",
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Таймаут на один вопрос в секундах (default: 120)",
    )
    p.add_argument(
        "--keep-workspace",
        action="store_true",
        help="Не удалять workspace после завершения (для отладки)",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Количество параллельных агентов (default: 1, sequential)",
    )
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Загрузка данных ───────────────────────────────────────────────────────
    data_path = Path(args.data_file)
    if not data_path.exists():
        print(f"[ERROR] Файл не найден: {data_path}", file=sys.stderr)
        print("Скачай данные:", file=sys.stderr)
        print("  mkdir -p data/", file=sys.stderr)
        print("  cd data/", file=sys.stderr)
        print("  wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json", file=sys.stderr)
        sys.exit(1)

    with open(data_path, encoding="utf-8") as f:
        dataset = json.load(f)

    print(f"[INFO] Загружено {len(dataset)} вопросов из {data_path.name}")

    # ── Фильтрация ────────────────────────────────────────────────────────────
    if args.question_type:
        dataset = [q for q in dataset if q.get("question_type") == args.question_type]
        print(f"[INFO] После фильтра {args.question_type!r}: {len(dataset)} вопросов")

    if args.limit:
        dataset = dataset[: args.limit]
        print(f"[INFO] Ограничение: первые {args.limit} вопросов")

    # ── Агент ─────────────────────────────────────────────────────────────────
    agent = _make_agent(args)
    print(f"[INFO] Агент: {agent}")

    # ── Выходной файл ─────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    agent_tag = f"{args.agent}_{(args.model or 'default').replace('/', '-')}"
    output_path = Path(args.output) if args.output else Path(
        f"{data_path.stem}_{agent_tag}_{ts}.jsonl"
    )
    print(f"[INFO] Вывод → {output_path}")

    # ── Запуск ────────────────────────────────────────────────────────────────
    if args.concurrency > 1:
        results = _run_concurrent(dataset, agent, args)
    else:
        results = _run_sequential(dataset, agent, args)

    # ── Сохранение ────────────────────────────────────────────────────────────
    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\n[DONE] Сохранено {len(results)} ответов → {output_path}")
    print(f"[DONE] Запусти оценку:")
    print(f"  cd <longmemeval_repo>/src/evaluation")
    print(f"  python3 evaluate_qa.py gpt-4o {output_path.resolve()} <data_path>")

    _print_summary(results, dataset)


# ─────────────────────────────────────────────────────────────────────────────
# Runner variants
# ─────────────────────────────────────────────────────────────────────────────

def _run_sequential(
    dataset: list[dict],
    agent: ClaudeAgent | CodexAgent,
    args: argparse.Namespace,
) -> list[dict]:
    results = []
    total = len(dataset)

    for i, item in enumerate(dataset):
        qid = item["question_id"]
        qtype = item.get("question_type", "unknown")
        question = item["question"]
        question_date = item.get("question_date", "unknown")

        print(f"\n[{i+1}/{total}] {qid} ({qtype})")
        print(f"  Q: {question[:80]}{'...' if len(question) > 80 else ''}")

        t0 = time.time()

        keep = args.keep_workspace and i == 0  # только первый сохраняем при --keep
        with MemoraWorkspace(keep=keep) as ws:
            if keep:
                print(f"  workspace: {ws.path}")

            # Конвертируем сессии в SESSIONS/*.md
            n_sessions = len(item.get("haystack_sessions", []))
            write_sessions(
                haystack_sessions=item["haystack_sessions"],
                haystack_dates=item["haystack_dates"],
                haystack_session_ids=item["haystack_session_ids"],
                sessions_dir=ws.sessions_dir,
                answer_session_ids=item.get("answer_session_ids"),
            )
            print(f"  sessions: {n_sessions} файлов")

            # Запускаем агента
            hypothesis = agent.answer(
                question=question,
                question_date=question_date,
                workspace=ws.path,
            )

        elapsed = time.time() - t0
        print(f"  A: {hypothesis[:100]}{'...' if len(hypothesis) > 100 else ''}")
        print(f"  ({elapsed:.1f}s)")

        results.append({
            "question_id": qid,
            "hypothesis": hypothesis,
            "question_type": qtype,
            "elapsed_s": round(elapsed, 2),
            "n_sessions": n_sessions,
        })

    return results


def _run_concurrent(
    dataset: list[dict],
    agent: ClaudeAgent | CodexAgent,
    args: argparse.Namespace,
) -> list[dict]:
    """Параллельный запуск через ThreadPoolExecutor."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []
    total = len(dataset)
    concurrency = min(args.concurrency, total)

    print(f"[INFO] Параллельность: {concurrency} агентов")

    def process_one(item_idx):
        i, item = item_idx
        qid = item["question_id"]
        question = item["question"]
        question_date = item.get("question_date", "unknown")
        qtype = item.get("question_type", "unknown")

        t0 = time.time()
        with MemoraWorkspace() as ws:
            write_sessions(
                haystack_sessions=item["haystack_sessions"],
                haystack_dates=item["haystack_dates"],
                haystack_session_ids=item["haystack_session_ids"],
                sessions_dir=ws.sessions_dir,
                answer_session_ids=item.get("answer_session_ids"),
            )
            hypothesis = agent.answer(
                question=question,
                question_date=question_date,
                workspace=ws.path,
            )

        return {
            "question_id": qid,
            "hypothesis": hypothesis,
            "question_type": qtype,
            "elapsed_s": round(time.time() - t0, 2),
            "n_sessions": len(item.get("haystack_sessions", [])),
        }

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(process_one, (i, item)): i for i, item in enumerate(dataset)}
        done = 0
        for fut in as_completed(futures):
            done += 1
            r = fut.result()
            print(f"  [{done}/{total}] {r['question_id']} → {r['hypothesis'][:60]}… ({r['elapsed_s']}s)")
            results.append(r)

    # Восстанавливаем порядок по question_id из исходного dataset
    id_order = {item["question_id"]: idx for idx, item in enumerate(dataset)}
    results.sort(key=lambda r: id_order.get(r["question_id"], 0))
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_agent(args: argparse.Namespace) -> ClaudeAgent | CodexAgent:
    if args.agent == "claude":
        model = args.model or "sonnet"
        return ClaudeAgent(model=model, timeout=args.timeout)
    elif args.agent == "codex":
        model = args.model or "o4-mini"
        return CodexAgent(model=model, timeout=args.timeout)
    else:
        raise ValueError(f"Неизвестный агент: {args.agent}")


def _print_summary(results: list[dict], dataset: list[dict]):
    """Печатает сводку по типам вопросов."""
    if not results:
        return

    from collections import defaultdict, Counter
    by_type: dict[str, list] = defaultdict(list)
    for r in results:
        by_type[r.get("question_type", "unknown")].append(r)

    avg_time = sum(r["elapsed_s"] for r in results) / len(results)
    total_time = sum(r["elapsed_s"] for r in results)

    print(f"\n{'─' * 50}")
    print(f"  Вопросов обработано: {len(results)}")
    print(f"  Среднее время/вопрос: {avg_time:.1f}s")
    print(f"  Общее время: {total_time/60:.1f} мин")
    print(f"  Разбивка по типам:")
    for qtype, items in sorted(by_type.items()):
        avg = sum(r["elapsed_s"] for r in items) / len(items)
        print(f"    {qtype:35s}: {len(items):3d} вопросов  ({avg:.1f}s avg)")
    print(f"{'─' * 50}")


if __name__ == "__main__":
    main()
