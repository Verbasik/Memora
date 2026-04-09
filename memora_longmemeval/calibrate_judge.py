#!/usr/bin/env python3
"""
calibrate_judge.py — workflow для калибровки judge against a reference evaluator.

Поддерживает два сценария:
1. Сгенерировать стратифицированную выборку question_id для calibration study.
2. Сравнить два verdict-лога по одной и той же выборке и принять/отклонить judge.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from memora_longmemeval.stats import load_dataset


DEFAULT_CRITICAL_TYPES = ("abstention", "knowledge-update")


def normalize_question_type(item: dict) -> str:
    qid = item["question_id"]
    if qid.endswith("_abs"):
        return "abstention"
    return item.get("question_type", "unknown")


def group_question_ids(dataset: dict[str, dict]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for qid, item in dataset.items():
        grouped[normalize_question_type(item)].append(qid)
    return {qtype: sorted(qids) for qtype, qids in sorted(grouped.items())}


def stratified_sample_question_ids(
    dataset: dict[str, dict],
    sample_size: int,
    seed: int = 42,
) -> dict:
    grouped = group_question_ids(dataset)
    type_count = len(grouped)
    total = sum(len(qids) for qids in grouped.values())

    if sample_size <= 0:
        raise ValueError("sample_size должен быть > 0")
    if sample_size > total:
        raise ValueError("sample_size не может превышать размер датасета")
    if sample_size < type_count:
        raise ValueError("sample_size должен покрывать хотя бы по одному примеру на тип")

    allocations = {qtype: 1 for qtype in grouped}
    remaining = sample_size - type_count
    remaining_pool = total - type_count

    remainders: list[tuple[float, int, str]] = []
    if remaining > 0 and remaining_pool > 0:
        for qtype, qids in grouped.items():
            capacity = len(qids) - 1
            if capacity <= 0:
                continue
            quota = remaining * capacity / remaining_pool
            extra = min(int(quota), capacity)
            allocations[qtype] += extra
            remainders.append((quota - extra, capacity - extra, qtype))

        used = sum(allocations.values())
        slots_left = sample_size - used
        for _, _, qtype in sorted(remainders, key=lambda row: (-row[0], row[2])):
            if slots_left <= 0:
                break
            capacity_left = len(grouped[qtype]) - allocations[qtype]
            if capacity_left <= 0:
                continue
            allocations[qtype] += 1
            slots_left -= 1

    rng = random.Random(seed)
    question_ids_by_type: dict[str, list[str]] = {}
    question_ids: list[str] = []
    for qtype, qids in grouped.items():
        picks = sorted(rng.sample(qids, allocations[qtype]))
        question_ids_by_type[qtype] = picks
        question_ids.extend(picks)

    question_ids.sort()
    return {
        "sample_size": len(question_ids),
        "seed": seed,
        "question_ids": question_ids,
        "question_ids_by_type": question_ids_by_type,
        "counts_by_type": {qtype: len(qids) for qtype, qids in question_ids_by_type.items()},
    }


def load_log_records(path: str) -> dict[str, dict]:
    records: dict[str, dict] = {}
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
            records[qid] = {
                "label": int(label),
                "judge_error": data.get("judge_error"),
                "hypothesis": data.get("hypothesis"),
                "question_type": data.get("question_type"),
            }
    return records


def load_sample_manifest(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:
        if path.endswith(".json"):
            data = json.load(f)
            if isinstance(data, dict) and "question_ids" in data:
                return list(data["question_ids"])
            if isinstance(data, list):
                return list(data)
            raise ValueError("JSON sample manifest должен быть list[str] или dict с ключом question_ids")

        return [line.strip() for line in f if line.strip()]


def compare_judges(
    dataset: dict[str, dict],
    reference_records: dict[str, dict],
    candidate_records: dict[str, dict],
    sample_qids: list[str] | None = None,
    agreement_threshold: float = 0.95,
    critical_types: tuple[str, ...] = DEFAULT_CRITICAL_TYPES,
    critical_threshold: float = 0.90,
) -> dict:
    target_qids = sample_qids or sorted(set(dataset) & set(reference_records) & set(candidate_records))
    by_type: dict[str, dict] = defaultdict(lambda: {"n": 0, "agreements": 0, "disagreements": 0})
    disagreements: list[dict] = []
    skipped = {
        "missing_dataset_qid": 0,
        "missing_reference": 0,
        "missing_candidate": 0,
        "reference_judge_error": 0,
        "candidate_judge_error": 0,
    }

    compared = 0
    agreed = 0

    for qid in target_qids:
        if qid not in dataset:
            skipped["missing_dataset_qid"] += 1
            continue
        reference = reference_records.get(qid)
        if reference is None:
            skipped["missing_reference"] += 1
            continue
        candidate = candidate_records.get(qid)
        if candidate is None:
            skipped["missing_candidate"] += 1
            continue
        if reference["label"] not in (0, 1):
            skipped["reference_judge_error"] += 1
            continue
        if candidate["label"] not in (0, 1):
            skipped["candidate_judge_error"] += 1
            continue

        qtype = normalize_question_type(dataset[qid])
        matches = int(reference["label"] == candidate["label"])
        compared += 1
        agreed += matches
        by_type[qtype]["n"] += 1
        by_type[qtype]["agreements"] += matches
        by_type[qtype]["disagreements"] += 1 - matches

        if not matches:
            disagreements.append(
                {
                    "question_id": qid,
                    "question_type": qtype,
                    "reference_label": reference["label"],
                    "candidate_label": candidate["label"],
                    "hypothesis": candidate.get("hypothesis") or reference.get("hypothesis"),
                }
            )

    by_type_report = {}
    for qtype, values in sorted(by_type.items()):
        n = values["n"]
        agreement = values["agreements"] / n if n else 0.0
        by_type_report[qtype] = {
            "n": n,
            "agreement": agreement,
            "disagreements": values["disagreements"],
        }

    overall_agreement = agreed / compared if compared else 0.0
    critical_report = {}
    critical_pass = True
    for qtype in critical_types:
        qtype_stats = by_type_report.get(qtype)
        if qtype_stats is None:
            critical_report[qtype] = {"n": 0, "agreement": None, "passed": False}
            critical_pass = False
            continue
        passed = qtype_stats["agreement"] >= critical_threshold
        critical_report[qtype] = {
            "n": qtype_stats["n"],
            "agreement": qtype_stats["agreement"],
            "passed": passed,
        }
        critical_pass = critical_pass and passed

    return {
        "n_requested": len(target_qids),
        "n_compared": compared,
        "overall_agreement": overall_agreement,
        "agreement_threshold": agreement_threshold,
        "passed_overall": overall_agreement >= agreement_threshold,
        "critical_types": list(critical_types),
        "critical_threshold": critical_threshold,
        "critical_report": critical_report,
        "passed": (overall_agreement >= agreement_threshold) and critical_pass,
        "skipped": skipped,
        "by_type": by_type_report,
        "disagreements": disagreements,
    }


def print_sample_report(sample: dict):
    print(f"[SAMPLE] question_ids: {sample['sample_size']} | seed={sample['seed']}")
    for qtype, count in sample["counts_by_type"].items():
        print(f"  - {qtype:<28} {count:>3}")


def print_comparison_report(report: dict):
    print(f"[COMPARE] requested={report['n_requested']} compared={report['n_compared']}")
    print(
        f"  overall agreement: {report['overall_agreement']:.1%}"
        f" (threshold {report['agreement_threshold']:.1%})"
    )
    print(f"  passed overall: {'yes' if report['passed_overall'] else 'no'}")
    print("  skipped:")
    for reason, count in report["skipped"].items():
        print(f"    - {reason}: {count}")

    print("  by type:")
    for qtype, values in report["by_type"].items():
        print(
            f"    - {qtype:<28} n={values['n']:>3}"
            f" agreement={values['agreement']:.1%}"
            f" disagreements={values['disagreements']}"
        )

    print("  critical types:")
    for qtype, values in report["critical_report"].items():
        agreement = values["agreement"]
        agreement_text = "n/a" if agreement is None else f"{agreement:.1%}"
        print(
            f"    - {qtype:<28} n={values['n']:>3}"
            f" agreement={agreement_text}"
            f" passed={'yes' if values['passed'] else 'no'}"
        )

    print(f"  acceptance decision: {'PASS' if report['passed'] else 'FAIL'}")
    if report["disagreements"]:
        print(f"  disagreements saved: {len(report['disagreements'])}")


def _default_sample_output(dataset_path: str, sample_size: int) -> str:
    stem = Path(dataset_path).stem
    return f"results/{stem}_judge_calibration_sample_{sample_size}.json"


def _default_report_output(candidate_path: str) -> str:
    return str(Path(candidate_path).with_suffix(Path(candidate_path).suffix + ".calibration.json"))


def main():
    parser = argparse.ArgumentParser(description="Judge calibration workflow for LongMemEval")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sample_parser = subparsers.add_parser("sample", help="Generate a stratified calibration sample")
    sample_parser.add_argument("dataset", help="Path to longmemeval_*.json")
    sample_parser.add_argument("--sample-size", type=int, default=150, help="Sample size (default: 150)")
    sample_parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    sample_parser.add_argument("--output", default=None, help="Output manifest path")

    compare_parser = subparsers.add_parser("compare", help="Compare candidate judge vs reference")
    compare_parser.add_argument("dataset", help="Path to longmemeval_*.json")
    compare_parser.add_argument("--reference", required=True, help="Reference evaluated JSONL log")
    compare_parser.add_argument("--candidate", required=True, help="Candidate evaluated JSONL log")
    compare_parser.add_argument("--sample", default=None, help="Sample manifest (.json or .txt)")
    compare_parser.add_argument("--sample-size", type=int, default=None, help="Generate sample on the fly")
    compare_parser.add_argument("--seed", type=int, default=42, help="Random seed for generated sample")
    compare_parser.add_argument("--agreement-threshold", type=float, default=0.95,
                                help="Minimum overall agreement (default: 0.95)")
    compare_parser.add_argument("--critical-types", nargs="+", default=list(DEFAULT_CRITICAL_TYPES),
                                help="Question types that must not underperform")
    compare_parser.add_argument("--critical-threshold", type=float, default=0.90,
                                help="Minimum agreement for critical types (default: 0.90)")
    compare_parser.add_argument("--output", default=None, help="Output report path")

    args = parser.parse_args()
    dataset = load_dataset(args.dataset)

    if args.command == "sample":
        sample = stratified_sample_question_ids(dataset, sample_size=args.sample_size, seed=args.seed)
        sample["dataset"] = args.dataset
        output = args.output or _default_sample_output(args.dataset, args.sample_size)
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print_sample_report(sample)
        print(f"[DONE] → {output}")
        return

    sample_qids = None
    sample_manifest = None
    if args.sample:
        sample_qids = load_sample_manifest(args.sample)
        sample_manifest = args.sample
    elif args.sample_size:
        sample_manifest = {
            "dataset": args.dataset,
            **stratified_sample_question_ids(dataset, sample_size=args.sample_size, seed=args.seed),
        }
        sample_qids = sample_manifest["question_ids"]

    report = compare_judges(
        dataset=dataset,
        reference_records=load_log_records(args.reference),
        candidate_records=load_log_records(args.candidate),
        sample_qids=sample_qids,
        agreement_threshold=args.agreement_threshold,
        critical_types=tuple(args.critical_types),
        critical_threshold=args.critical_threshold,
    )
    if sample_manifest is not None:
        report["sample"] = sample_manifest
    report["dataset"] = args.dataset
    report["reference"] = args.reference
    report["candidate"] = args.candidate

    output = args.output or _default_report_output(args.candidate)
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print_comparison_report(report)
    print(f"[DONE] → {output}")


if __name__ == "__main__":
    main()
