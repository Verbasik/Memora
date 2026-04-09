"""
stats.py — статистический анализ результатов бенчмарка.

Использование:
    # Анализ одного прогона
    python memora_longmemeval/stats.py results.jsonl data/longmemeval_oracle.json

    # Сравнение двух прогонов (McNemar's test)
    python memora_longmemeval/stats.py results_a.jsonl data/longmemeval_oracle.json \\
        --compare results_b.jsonl --labels "Memora" "Baseline"
"""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import defaultdict


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_results(path: str) -> dict[str, dict]:
    """
    Загружает JSONL и возвращает dict[question_id -> result metadata].

    `autoeval_label`:
      1 -> correct
      0 -> incorrect
     -1 -> judge error / missing verdict
    """
    results: dict[str, dict] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            qid = data["question_id"]
            label = data.get("autoeval_label")
            if label is None:
                label = 0
            label = int(label)
            judge_error = data.get("judge_error")
            if label == -1 and not judge_error:
                judge_error = "missing_verdict"
            results[qid] = {
                "label": label,
                "judge_error": judge_error,
                "question_type": data.get("question_type"),
                "mode": data.get("mode"),
                "agent": data.get("agent"),
                "model": data.get("model"),
                "retrieved_session_ids": data.get("retrieved_session_ids") or [],
            }
    return results


def load_dataset(path: str) -> dict[str, dict]:
    """Загружает LongMemEval JSON → dict[question_id → item]."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {item["question_id"]: item for item in data}


# ─────────────────────────────────────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────────────────────────────────────

def accuracy(labels: list[int]) -> float:
    if not labels:
        return 0.0
    return sum(labels) / len(labels)


def bootstrap_ci(
    labels: list[int],
    n_bootstrap: int = 10_000,
    confidence: float = 0.95,
    seed: int = 42,
) -> tuple[float, float]:
    """Bootstrap confidence interval для accuracy."""
    rng = random.Random(seed)
    n = len(labels)
    if n == 0:
        return (0.0, 0.0)
    boot_accs = []
    for _ in range(n_bootstrap):
        sample = [labels[rng.randint(0, n - 1)] for _ in range(n)]
        boot_accs.append(sum(sample) / n)
    boot_accs.sort()
    alpha = (1 - confidence) / 2
    lo = boot_accs[int(alpha * n_bootstrap)]
    hi = boot_accs[int((1 - alpha) * n_bootstrap)]
    return (lo, hi)


def paired_bootstrap_delta_ci(
    labels_a: list[int],
    labels_b: list[int],
    n_bootstrap: int = 10_000,
    confidence: float = 0.95,
    seed: int = 42,
) -> tuple[float, float]:
    """Paired bootstrap CI for accuracy delta (A - B)."""
    assert len(labels_a) == len(labels_b), "Одинаковое количество вопросов"
    rng = random.Random(seed)
    n = len(labels_a)
    if n == 0:
        return (0.0, 0.0)

    deltas = []
    for _ in range(n_bootstrap):
        sample_idx = [rng.randint(0, n - 1) for _ in range(n)]
        sample_a = [labels_a[i] for i in sample_idx]
        sample_b = [labels_b[i] for i in sample_idx]
        deltas.append((sum(sample_a) - sum(sample_b)) / n)

    deltas.sort()
    alpha = (1 - confidence) / 2
    lo = deltas[int(alpha * n_bootstrap)]
    hi = deltas[int((1 - alpha) * n_bootstrap)]
    return (lo, hi)


def mcnemar_test(
    labels_a: list[int],
    labels_b: list[int],
) -> tuple[float, float, int, int]:
    """
    McNemar's test для сравнения двух систем на одних вопросах.
    Возвращает (chi2, p_value, b, c).
    """
    assert len(labels_a) == len(labels_b), "Одинаковое количество вопросов"

    b = sum(1 for a, b_ in zip(labels_a, labels_b) if a == 1 and b_ == 0)
    c = sum(1 for a, b_ in zip(labels_a, labels_b) if a == 0 and b_ == 1)

    if b + c == 0:
        return (0.0, 1.0, b, c)

    chi2 = (abs(b - c) - 1) ** 2 / (b + c)
    p = _chi2_sf(chi2, df=1)
    return (chi2, p, b, c)


def _chi2_sf(x: float, df: int = 1) -> float:
    """Survival function chi-squared (1 df), аппроксимация через erfc."""
    t = math.sqrt(x / 2)
    return _erfc(t)


def _erfc(x: float) -> float:
    if x < 0:
        return 2.0 - _erfc(-x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    poly = t * (
        0.254829592
        + t * (-0.284496736
        + t * (1.421413741
        + t * (-1.453152027
        + t * 1.061405429)))
    )
    return poly * math.exp(-x * x)


def retrieval_report(
    results: dict[str, dict],
    dataset: dict[str, dict],
) -> dict | None:
    """
    Session-level retrieval metrics against dataset `answer_session_ids`.

    Returns None if the result file does not include retrieval IDs.
    """
    rows = []
    for qid, record in results.items():
        if qid not in dataset:
            continue
        retrieved = record.get("retrieved_session_ids")
        if not retrieved:
            continue
        gold = dataset[qid].get("answer_session_ids") or []
        if not gold:
            continue
        rows.append((retrieved, list(gold)))

    if not rows:
        return None

    r1 = []
    r3 = []
    r5 = []
    reciprocal_ranks = []
    ndcg5 = []

    for retrieved, gold in rows:
        gold_set = set(gold)
        r1.append(1 if any(session_id in gold_set for session_id in retrieved[:1]) else 0)
        r3.append(1 if any(session_id in gold_set for session_id in retrieved[:3]) else 0)
        r5.append(1 if any(session_id in gold_set for session_id in retrieved[:5]) else 0)

        first_rank = 0.0
        for idx, session_id in enumerate(retrieved, start=1):
            if session_id in gold_set:
                first_rank = 1.0 / idx
                break
        reciprocal_ranks.append(first_rank)

        dcg = 0.0
        for idx, session_id in enumerate(retrieved[:5], start=1):
            if session_id in gold_set:
                dcg += 1.0 / math.log2(idx + 1)
        ideal_hits = min(len(gold_set), 5)
        idcg = sum(1.0 / math.log2(idx + 1) for idx in range(1, ideal_hits + 1))
        ndcg5.append(dcg / idcg if idcg else 0.0)

    return {
        "n": len(rows),
        "recall@1": accuracy(r1),
        "recall@3": accuracy(r3),
        "recall@5": accuracy(r5),
        "mrr": sum(reciprocal_ranks) / len(reciprocal_ranks),
        "ndcg@5": sum(ndcg5) / len(ndcg5),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────────────────────

def report(
    results: dict[str, dict],
    dataset: dict[str, dict],
    label: str = "System",
) -> dict:
    """Печатает полный отчёт и возвращает структуру данных для сравнения."""
    by_type: dict[str, list[int]] = defaultdict(list)
    scored_by_qid: dict[str, int] = {}
    total = 0
    errors = 0

    for qid, record in results.items():
        if qid not in dataset:
            continue
        total += 1
        result_label = record["label"]
        qtype = dataset[qid].get("question_type", "unknown")
        if qid.endswith("_abs"):
            qtype = "abstention"

        if result_label in (0, 1):
            by_type[qtype].append(result_label)
            scored_by_qid[qid] = result_label
        else:
            errors += 1

    all_labels = [value for values in by_type.values() for value in values]
    overall_acc = accuracy(all_labels)
    lo, hi = bootstrap_ci(all_labels)
    retrieval = retrieval_report(results, dataset)

    print(f"\n{'═' * 60}")
    print(f"  {label}")
    print(f"{'═' * 60}")
    print(f"  Вопросов всего:  {total}")
    print(f"  Вопросов оценено: {len(all_labels)}")
    print(f"  Ошибок judge:     {errors} ({errors / total:.1%})" if total else "  Ошибок judge:     0")
    print(f"  Overall Accuracy: {overall_acc:.1%}  [{lo:.1%}, {hi:.1%}] 95% CI")
    print(f"{'─' * 60}")
    print(f"  {'Тип вопроса':<35} {'N':>4}  {'Acc':>6}  {'95% CI'}")
    print(f"{'─' * 60}")

    type_stats = {}
    for qtype in sorted(by_type):
        labels = by_type[qtype]
        acc = accuracy(labels)
        lo_t, hi_t = bootstrap_ci(labels)
        print(f"  {qtype:<35} {len(labels):>4}  {acc:>6.1%}  [{lo_t:.1%}, {hi_t:.1%}]")
        type_stats[qtype] = {"n": len(labels), "acc": acc, "ci": (lo_t, hi_t)}

    if retrieval:
        print(f"{'─' * 60}")
        print(
            "  Retrieval:"
            f" R@1={retrieval['recall@1']:.1%}"
            f" R@3={retrieval['recall@3']:.1%}"
            f" R@5={retrieval['recall@5']:.1%}"
            f" MRR={retrieval['mrr']:.3f}"
            f" NDCG@5={retrieval['ndcg@5']:.3f}"
        )

    print(f"{'═' * 60}\n")

    return {
        "label": label,
        "n_total": total,
        "n_scored": len(all_labels),
        "n_errors": errors,
        "overall_acc": overall_acc,
        "ci": (lo, hi),
        "by_type": type_stats,
        "scored_by_qid": scored_by_qid,
        "retrieval": retrieval,
    }


def compare_two(stats_a: dict, stats_b: dict):
    """Сравнение двух систем с McNemar's test на общих корректно оценённых вопросах."""

    qids_a = set(stats_a["scored_by_qid"])
    qids_b = set(stats_b["scored_by_qid"])
    common = sorted(qids_a & qids_b)

    if not common:
        print("Нет общих question_id со скорингом для сравнения.")
        return

    labels_a = [stats_a["scored_by_qid"][qid] for qid in common]
    labels_b = [stats_b["scored_by_qid"][qid] for qid in common]

    chi2, p, b, c = mcnemar_test(labels_a, labels_b)
    acc_a = accuracy(labels_a)
    acc_b = accuracy(labels_b)
    delta = acc_a - acc_b
    lo, hi = paired_bootstrap_delta_ci(labels_a, labels_b)

    print(f"{'═' * 60}")
    print(f"  Сравнение: {stats_a['label']} vs {stats_b['label']}")
    print(f"{'─' * 60}")
    print(f"  Общих оценённых вопросов: {len(common)}")
    print(f"  {stats_a['label']:30s}: {acc_a:.1%}")
    print(f"  {stats_b['label']:30s}: {acc_b:.1%}")
    print(f"  Δ (A − B): {delta:+.1%}  [{lo:+.1%}, {hi:+.1%}] 95% CI")
    print(f"{'─' * 60}")
    print("  McNemar's test:")
    print(f"    discordant A=1,B=0: {b}")
    print(f"    discordant A=0,B=1: {c}")
    print(f"    χ² = {chi2:.3f}")
    print(f"    p  = {p:.4f}  {'*** ЗНАЧИМО (p<0.05)' if p < 0.05 else '(не значимо)'}")
    if p < 0.001:
        print("         p < 0.001 *** высокая значимость")
    elif p < 0.01:
        print("         p < 0.01  ** значимо")
    elif p < 0.05:
        print("         p < 0.05  * значимо")
    else:
        print("         H0 не отвергается — разница может быть случайной")
    print(f"{'═' * 60}\n")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Статистический анализ результатов LongMemEval")
    parser.add_argument("results", help="JSONL с autoeval_label")
    parser.add_argument("dataset", help="Исходный longmemeval_*.json")
    parser.add_argument("--compare", help="Второй JSONL для сравнения (McNemar's test)")
    parser.add_argument("--labels", nargs=2, default=["System A", "System B"],
                        help="Имена систем для сравнения")
    args = parser.parse_args()

    dataset = load_dataset(args.dataset)

    results_a = load_results(args.results)
    stats_a = report(results_a, dataset, label=args.labels[0])

    if args.compare:
        results_b = load_results(args.compare)
        stats_b = report(results_b, dataset, label=args.labels[1])
        compare_two(stats_a, stats_b)


if __name__ == "__main__":
    main()
