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
import sys
from collections import defaultdict
from pathlib import Path


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_results(path: str) -> dict[str, str]:
    """Загружает JSONL с полями question_id + autoeval_label (или hypothesis)."""
    results = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            qid = d["question_id"]
            # Поддерживаем оба формата: evaluate_qa.py output и наш JSONL
            label = d.get("autoeval_label")
            if label is None:
                # Fallback: нет оценки — считаем неверным
                label = 0
            results[qid] = int(label)
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


def mcnemar_test(
    labels_a: list[int],
    labels_b: list[int],
) -> tuple[float, float]:
    """
    McNemar's test для сравнения двух систем на одних вопросах.
    Возвращает (chi2, p_value).

    H0: обе системы одинаково хороши.
    p < 0.05 → статистически значимая разница.
    """
    assert len(labels_a) == len(labels_b), "Одинаковое количество вопросов"

    # Таблица несогласий
    b = sum(1 for a, b_ in zip(labels_a, labels_b) if a == 1 and b_ == 0)  # A верно, B неверно
    c = sum(1 for a, b_ in zip(labels_a, labels_b) if a == 0 and b_ == 1)  # A неверно, B верно

    if b + c == 0:
        return (0.0, 1.0)  # нет несогласий → нет разницы

    # Chi-squared с поправкой Йейтса
    chi2 = (abs(b - c) - 1) ** 2 / (b + c)

    # p-value (chi-squared df=1, аппроксимация)
    p = _chi2_sf(chi2, df=1)
    return (chi2, p)


def _chi2_sf(x: float, df: int = 1) -> float:
    """Survival function chi-squared (1 df), аппроксимация через регуляризованную гамму."""
    # Для df=1: chi2_sf(x) = 1 - erf(sqrt(x/2))
    # Аппроксимация Абрамовица и Стегуна
    t = math.sqrt(x / 2)
    # erfc через стандартное приближение
    erfc_val = _erfc(t)
    return erfc_val


def _erfc(x: float) -> float:
    """erfc(x) = 1 - erf(x), приближение Чебышёва."""
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


# ─────────────────────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────────────────────

def report(
    results: dict[str, int],
    dataset: dict[str, dict],
    label: str = "System",
) -> dict:
    """Печатает полный отчёт и возвращает структуру данных для сравнения."""

    # Группируем по типу вопроса
    by_type: dict[str, list[int]] = defaultdict(list)
    for qid, correct in results.items():
        if qid not in dataset:
            continue
        qtype = dataset[qid].get("question_type", "unknown")
        # Abstention вопросы имеют суффикс _abs
        if qid.endswith("_abs"):
            qtype = "abstention"
        by_type[qtype].append(correct)

    all_labels = [v for vs in by_type.values() for v in vs]
    overall_acc = accuracy(all_labels)
    lo, hi = bootstrap_ci(all_labels)

    print(f"\n{'═' * 60}")
    print(f"  {label}")
    print(f"{'═' * 60}")
    print(f"  Вопросов оценено: {len(all_labels)}")
    print(f"  Overall Accuracy: {overall_acc:.1%}  [{lo:.1%}, {hi:.1%}] 95% CI")
    print(f"{'─' * 60}")
    print(f"  {'Тип вопроса':<35} {'N':>4}  {'Acc':>6}  {'95% CI'}")
    print(f"{'─' * 60}")

    type_stats = {}
    for qtype in sorted(by_type):
        lbls = by_type[qtype]
        acc = accuracy(lbls)
        lo_t, hi_t = bootstrap_ci(lbls)
        print(f"  {qtype:<35} {len(lbls):>4}  {acc:>6.1%}  [{lo_t:.1%}, {hi_t:.1%}]")
        type_stats[qtype] = {"n": len(lbls), "acc": acc, "ci": (lo_t, hi_t)}

    print(f"{'═' * 60}\n")

    return {
        "label": label,
        "n": len(all_labels),
        "overall_acc": overall_acc,
        "ci": (lo, hi),
        "by_type": type_stats,
        "labels": all_labels,
        "labels_by_qid": results,
    }


def compare_two(stats_a: dict, stats_b: dict):
    """Сравнение двух систем с McNemar's test на общих вопросах."""

    qids_a = set(stats_a["labels_by_qid"])
    qids_b = set(stats_b["labels_by_qid"])
    common = sorted(qids_a & qids_b)

    if not common:
        print("Нет общих question_id для сравнения.")
        return

    labels_a = [stats_a["labels_by_qid"][qid] for qid in common]
    labels_b = [stats_b["labels_by_qid"][qid] for qid in common]

    chi2, p = mcnemar_test(labels_a, labels_b)

    acc_a = accuracy(labels_a)
    acc_b = accuracy(labels_b)
    delta = acc_a - acc_b

    print(f"{'═' * 60}")
    print(f"  Сравнение: {stats_a['label']} vs {stats_b['label']}")
    print(f"{'─' * 60}")
    print(f"  Общих вопросов: {len(common)}")
    print(f"  {stats_a['label']:30s}: {acc_a:.1%}")
    print(f"  {stats_b['label']:30s}: {acc_b:.1%}")
    print(f"  Δ (A − B): {delta:+.1%}")
    print(f"{'─' * 60}")
    print(f"  McNemar's test:")
    print(f"    χ² = {chi2:.3f}")
    print(f"    p  = {p:.4f}  {'*** ЗНАЧИМО (p<0.05)' if p < 0.05 else '(не значимо)'}")
    if p < 0.001:
        print(f"         p < 0.001 *** высокая значимость")
    elif p < 0.01:
        print(f"         p < 0.01  ** значимо")
    elif p < 0.05:
        print(f"         p < 0.05  * значимо")
    else:
        print(f"         H0 не отвергается — разница случайна")
    print(f"{'═' * 60}\n")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Статистический анализ результатов LongMemEval")
    p.add_argument("results", help="JSONL с autoeval_label (вывод evaluate_qa.py)")
    p.add_argument("dataset", help="Исходный longmemeval_*.json")
    p.add_argument("--compare", help="Второй JSONL для сравнения (McNemar's test)")
    p.add_argument("--labels", nargs=2, default=["System A", "System B"],
                   help="Имена систем для сравнения")
    args = p.parse_args()

    dataset = load_dataset(args.dataset)

    results_a = load_results(args.results)
    stats_a = report(results_a, dataset, label=args.labels[0])

    if args.compare:
        results_b = load_results(args.compare)
        stats_b = report(results_b, dataset, label=args.labels[1])
        compare_two(stats_a, stats_b)


if __name__ == "__main__":
    main()
