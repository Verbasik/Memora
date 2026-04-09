---
title: "HANDOFF — передача контекста между сессиями"
type: "LOCAL"
authority: "free"
status: "active"
max_lines: 40
---

# Handoff — 2026-04-08 15:05

## Request
Восстановление контекста проекта через исследование последних 5 коммитов.

## Investigated
`memory-bank/INDEX.md`, `memory-bank/CONSTITUTION.md`, `.local/CURRENT.md`, `.local/HANDOFF.md`,
последние 5 git-коммитов, ключевые файлы `memora_longmemeval/{bench,evaluate,ingestor,workspace}.py`,
`memora_longmemeval/agents/{claude_cli,codex_cli}.py`

## Learned
- Память проекта отстаёт от git: `CURRENT.md` и `HANDOFF.md` описывают mempalace integration, но последние 5 коммитов уже про `memora_longmemeval`
- Актуальный фокус последних коммитов: полноценный benchmark Memora на LongMemEval
- `bench.py` теперь реализует двухфазный pipeline: ingestion → query через memory-restore
- `evaluate.py` заменяет внешний `evaluate_qa.py` локальным CLI-судьёй (Codex/Claude), без `OPENAI_API_KEY`
- Для Claude верификация использования Memora переведена с `json` на `stream-json`, потому что plain `json` не отдавал tool calls
- Последний фикс `95c6a03` устраняет падение judge-режима Claude из-за пустого `--allowedTools ""`

## Completed
- Контекст проекта восстановлен по memory-bank и git history
- `CURRENT.md` синхронизирован с выводами по последним 5 коммитам
- Зафиксировано ключевое расхождение между локальной памятью и историей ветки

## Next steps
1. Если benchmark-трек теперь основной, промотировать его в `DECISIONS.md` и/или `PATTERNS/`
2. Прогнать `memora_longmemeval/bench.py` и `evaluate.py` на актуальном датасете и сохранить результаты
3. Решить, нужен ли отдельный handoff для mempalace integration как вторичного трека

## Risks
- `CONSTITUTION.md` остаётся шаблонным и не даёт реальных инвариантов для review
- В рабочем дереве есть untracked `data/`, `mempalace/`, `results/` — возможно, это рабочие артефакты benchmark
- Без отдельной промоции в canonical memory следующий агент снова увидит устаревший high-level контекст

## Active files
`memora_longmemeval/bench.py`, `memora_longmemeval/evaluate.py`,
`memora_longmemeval/agents/claude_cli.py`, `memora_longmemeval/agents/codex_cli.py`,
`memory-bank/.local/CURRENT.md`, `memory-bank/.local/HANDOFF.md`

## Update 2026-04-09 01:35
- Реализованы PR1+PR3 core changes: leakage removal, fair modes, stats fix
- `bench.py` теперь пишет `mode`, `run_id`, `retrieved_session_ids`
- `stats.py` больше не учитывает `-1` как отрицательную accuracy и умеет печатать retrieval metrics
- Тесты: `python3 -m pytest memora_longmemeval/tests -q` → 11 passed
- Блокирующий следующий шаг: judge calibration и smoke-run на `longmemeval_s_cleaned.json`

## Update 2026-04-09 09:55
- Добавлен `memora_longmemeval/calibrate_judge.py` с двумя режимами:
  `sample` — стратифицированная выборка qids,
  `compare` — agreement report между reference и candidate judge
- Добавлен `docs/JUDGE_CALIBRATION.md` с командами и acceptance policy
- Тесты обновлены: `python3 -m pytest memora_longmemeval/tests -q` → 14 passed
- Smoke на текущем `oracle` датасете успешен: создан `results/_judge_calibration_sample_oracle_20.json`
- Реальный следующий блок всё ещё заблокирован отсутствием `data/longmemeval_s_cleaned.json` и reference evaluator log

## Update 2026-04-09 10:10
- `data/longmemeval_s_cleaned.json` скачан; создан реальный calibration sample
  `results/s_cleaned_judge_calibration_sample_150.json`
- Исправлен `Codex` non-interactive path:
  `agents/codex_cli.py` и `evaluate.py` переведены на `codex exec` + `--output-last-message`
- Новый end-to-end smoke на `s_cleaned` успешен:
  `bench.py` → `evaluate.py` → `stats.py --compare` для `Codex o4-mini`
- Важное ограничение: `claude` CLI не залогинена в текущем shell; `Claude Haiku` benchmark пока блокирован ответом
  `Not logged in · Please run /login`
- Важное открытое место: для `Codex` нет достоверного retrieval trace, поэтому usage-analysis пока неполный

## Update 2026-04-09 10:25
- `o4-mini` исключён как default для Codex: в текущем аккаунте модель не поддерживается
- Новый default для Codex в benchmark/evaluator: `gpt-5.2`
- Проверка `codex exec --model gpt-5.2` успешна; judge на этой модели реально работает
- `Claude Haiku` smoke повторно проверен с judge=`Codex gpt-5.2`:
  оба условия scored как correct, retrieval advantage пока только у `memora-min`
