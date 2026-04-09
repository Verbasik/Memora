"""Benchmark execution modes for Memora × LongMemEval."""

from __future__ import annotations


MODE_FLAT_BASELINE = "flat-baseline"
MODE_MEMORA_MIN = "memora-min"
MODE_MEMORA_FULL = "memora-full"
MODE_ORACLE = "oracle"

ALL_MODES = (
    MODE_FLAT_BASELINE,
    MODE_MEMORA_MIN,
    MODE_MEMORA_FULL,
    MODE_ORACLE,
)


def is_memora_mode(mode: str) -> bool:
    return mode in {MODE_MEMORA_MIN, MODE_MEMORA_FULL, MODE_ORACLE}


def uses_kg(mode: str) -> bool:
    return mode == MODE_MEMORA_FULL


def sessions_prefix(mode: str) -> str:
    if is_memora_mode(mode):
        return "memory-bank/.local/SESSIONS/"
    return "history/SESSIONS/"
