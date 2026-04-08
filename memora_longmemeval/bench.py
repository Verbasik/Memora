#!/usr/bin/env python3
"""
Memora × LongMemEval Benchmark
================================

Тестирует Memora на бенчмарке LongMemEval через CLI-агентов (Claude Code / Codex).

Двухфазный pipeline для каждого из 500 вопросов:

  Фаза 1 — INGESTION (симулирует реальную работу с Memora):
    · Записывает haystack_sessions в SESSIONS/*.md (хронологически)
    · Строит компактный индекс всех сессий в CURRENT.md
    · Наполняет Knowledge Graph темпоральными фактами
    · Пишет HANDOFF.md с контекстом

  Фаза 2 — QUERY (агент использует Memora memory-restore):
    · Читает HANDOFF.md и CURRENT.md (индекс сессий)
    · Определяет релевантные сессии по индексу
    · Читает нужные SESSIONS/*.md
    · Отвечает на вопрос

Агент использует полный набор Memora skills (.claude/skills/),
AGENTS.md и PATTERNS/ — точно как в реальной работе.

Usage:
    # Первые 20 вопросов (oracle dataset — самый честный тест)
    python memora_longmemeval/bench.py data/longmemeval_oracle.json --limit 20

    # Полный прогон (oracle)
    python memora_longmemeval/bench.py data/longmemeval_oracle.json

    # С другим агентом или моделью
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --agent claude --model opus

    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --agent codex --model o4-mini

    # Фильтр по типу вопроса
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --question-type temporal-reasoning

    # Параллельный запуск
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --concurrency 4 --limit 100

    # Отладка: сохранить workspace первого вопроса
    python memora_longmemeval/bench.py data/longmemeval_oracle.json \\
        --limit 1 --keep-workspace

Evaluation:
    После прогона запусти evaluate_qa.py из оригинального LongMemEval репозитория:

    export OPENAI_API_KEY=...
    cd <longmemeval_repo>/src/evaluation
    python3 evaluate_qa.py gpt-4o \\
        ../../Memora/<output>.jsonl \\
        ../../Memora/data/longmemeval_oracle.json

    Затем статистический анализ:
    python memora_longmemeval/stats.py <output>.log data/longmemeval_oracle.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from memora_longmemeval.ingestor import ingest
from memora_longmemeval.workspace import MemoraWorkspace
from memora_longmemeval.agents import ClaudeAgent, CodexAgent


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Memora × LongMemEval — двухфазный CLI-agent benchmark",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("data_file", help="Путь к longmemeval_*.json")
    p.add_argument(
        "--agent",
        choices=["claude", "codex"],
        default="claude",
        help="CLI-агент (default: claude)",
    )
    p.add_argument(
        "--model",
        default=None,
        help="Модель: claude→sonnet/opus/haiku, codex→o4-mini/o3/gpt-4o",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Максимум вопросов (для быстрого теста)",
    )
    p.add_argument(
        "--question-type",
        default=None,
        help="Фильтр: single-session-user, temporal-reasoning, multi-session, …",
    )
    p.add_argument(
        "--output",
        default=None,
        help="Путь к выходному JSONL (default: авто)",
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Таймаут на один вопрос в секундах (default: 180)",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Параллельных агентов (default: 1)",
    )
    p.add_argument(
        "--keep-workspace",
        action="store_true",
        help="Не удалять workspace первого вопроса (для отладки)",
    )
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Данные ────────────────────────────────────────────────────────────────
    data_path = Path(args.data_file)
    if not data_path.exists():
        print(f"[ERROR] Файл не найден: {data_path}", file=sys.stderr)
        _print_download_hint()
        sys.exit(1)

    with open(data_path, encoding="utf-8") as f:
        dataset = json.load(f)
    print(f"[INFO] Загружено {len(dataset)} вопросов из {data_path.name}")

    if args.question_type:
        dataset = [q for q in dataset if q.get("question_type") == args.question_type]
        print(f"[INFO] После фильтра '{args.question_type}': {len(dataset)} вопросов")

    if args.limit:
        dataset = dataset[: args.limit]
        print(f"[INFO] Ограничение: первые {args.limit}")

    # ── Агент ─────────────────────────────────────────────────────────────────
    agent = _make_agent(args)
    print(f"[INFO] Агент: {agent}")
    print(f"[INFO] Pipeline: двухфазный (ingestion → memory-restore → answer)")

    # ── Вывод ─────────────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    agent_tag = f"{args.agent}_{(args.model or 'default').replace('/', '-')}"
    output_path = Path(args.output) if args.output else Path(
        f"{data_path.stem}_memora_{agent_tag}_{ts}.jsonl"
    )
    print(f"[INFO] Вывод → {output_path}\n")

    # ── Запуск ────────────────────────────────────────────────────────────────
    if args.concurrency > 1:
        results = _run_concurrent(dataset, agent, args)
    else:
        results = _run_sequential(dataset, agent, args)

    # ── Сохранение (финальная запись — для sequential режима) ─────────────────
    # Concurrent режим пишет построчно в процессе работы (см. _run_concurrent)
    if args.concurrency == 1:
        with open(output_path, "w", encoding="utf-8") as f:
            for r in results:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    _print_done(results, output_path, data_path)


# ─────────────────────────────────────────────────────────────────────────────
# Runners
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

        print(f"[{i+1:3d}/{total}] {qid}  ({qtype})")
        print(f"        Q: {question[:90]}{'…' if len(question) > 90 else ''}")

        t0 = time.time()
        keep = args.keep_workspace and i == 0

        with MemoraWorkspace(keep=keep) as ws:
            if keep:
                print(f"        workspace: {ws.path}")

            # ── Фаза 1: Ingestion ──────────────────────────────────────────
            meta = ingest(item=item, workspace_path=ws.path, sessions_dir=ws.sessions_dir)

            # ── Фаза 2: Query ──────────────────────────────────────────────
            hypothesis = agent.answer(
                question=question,
                question_date=question_date,
                workspace=ws.path,
            )

        elapsed = time.time() - t0
        print(f"        A: {hypothesis[:90]}{'…' if len(hypothesis) > 90 else ''}")
        print(f"        sessions={meta['n_sessions']} kg_triples={meta['n_kg_triples']} time={elapsed:.1f}s\n")

        results.append({
            "question_id": qid,
            "hypothesis": hypothesis,
            "question_type": qtype,
            "elapsed_s": round(elapsed, 2),
            "n_sessions": meta["n_sessions"],
            "n_kg_triples": meta["n_kg_triples"],
        })

    return results


def _run_concurrent(
    dataset: list[dict],
    agent: ClaudeAgent | CodexAgent,
    args: argparse.Namespace,
) -> list[dict]:
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []
    total = len(dataset)
    concurrency = min(args.concurrency, total)
    print(f"[INFO] Параллельность: {concurrency} агентов")

    def process(idx_item):
        i, item = idx_item
        t0 = time.time()
        with MemoraWorkspace() as ws:
            meta = ingest(item=item, workspace_path=ws.path, sessions_dir=ws.sessions_dir)
            hypothesis = agent.answer(
                question=item["question"],
                question_date=item.get("question_date", "unknown"),
                workspace=ws.path,
            )
        return {
            "question_id": item["question_id"],
            "hypothesis": hypothesis,
            "question_type": item.get("question_type", "unknown"),
            "elapsed_s": round(time.time() - t0, 2),
            "n_sessions": meta["n_sessions"],
            "n_kg_triples": meta["n_kg_triples"],
        }

    output_path = Path(args.output) if args.output else Path(
        f"{Path(args.data_file).stem}_memora_{args.agent}_{(args.model or 'default')}_{__import__('datetime').datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"
    )

    with open(output_path, "w", encoding="utf-8") as out_f:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            futures = {pool.submit(process, (i, item)): i for i, item in enumerate(dataset)}
            done = 0
            for fut in as_completed(futures):
                done += 1
                r = fut.result()
                # Инкрементальная запись — результат не теряется при остановке
                out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
                out_f.flush()
                print(f"  [{done}/{total}] {r['question_id']} → {r['hypothesis'][:60]}… ({r['elapsed_s']}s)")
                results.append(r)

    id_order = {item["question_id"]: idx for idx, item in enumerate(dataset)}
    results.sort(key=lambda r: id_order.get(r["question_id"], 0))
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_agent(args):
    if args.agent == "claude":
        return ClaudeAgent(model=args.model or "sonnet", timeout=args.timeout)
    return CodexAgent(model=args.model or "o4-mini", timeout=args.timeout)


def _print_done(results: list[dict], output_path: Path, data_path: Path):
    from collections import defaultdict
    total = len(results)
    avg_t = sum(r["elapsed_s"] for r in results) / total if total else 0
    total_t = sum(r["elapsed_s"] for r in results)
    avg_kg = sum(r["n_kg_triples"] for r in results) / total if total else 0

    by_type = defaultdict(int)
    for r in results:
        by_type[r["question_type"]] += 1

    print(f"{'─'*60}")
    print(f"  Вопросов обработано: {total}")
    print(f"  Avg time/вопрос:     {avg_t:.1f}s")
    print(f"  Общее время:         {total_t/60:.1f} мин")
    print(f"  Avg KG triples:      {avg_kg:.1f}")
    print(f"  По типам:            {dict(sorted(by_type.items()))}")
    print(f"{'─'*60}")
    print(f"\n[DONE] → {output_path}")
    print(f"\nШаг 1: Оценка через evaluate_qa.py:")
    print(f"  export OPENAI_API_KEY=...")
    print(f"  cd <longmemeval_repo>/src/evaluation")
    print(f"  python3 evaluate_qa.py gpt-4o {output_path.resolve()} {data_path.resolve()}")
    print(f"\nШаг 2: Статистический анализ:")
    print(f"  python memora_longmemeval/stats.py {output_path.stem}.log {data_path}")


def _print_download_hint():
    print("  Скачай данные:", file=sys.stderr)
    print("    mkdir -p data/ && cd data/", file=sys.stderr)
    print("    wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json", file=sys.stderr)
    print("    wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json", file=sys.stderr)


if __name__ == "__main__":
    main()
