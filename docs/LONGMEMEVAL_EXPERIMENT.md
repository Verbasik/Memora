# LongMemEval Experiment Protocol

**Purpose:** define a valid experiment to assess whether Memora provides a statistically significant product benefit as a memory layer for CLI agents on LongMemEval.  
**Audience:** maintainers, evaluators, product/engineering leads.  
**Status:** draft working protocol.  
**Primary question:** does Memora improve long-term memory performance for a fixed CLI agent, beyond a fair non-Memora baseline, on LongMemEval?

---

## 1. Product Claim

This protocol is designed to support one specific product claim:

- **Primary claim:** Memora improves QA accuracy for a fixed CLI agent on LongMemEval relative to the same agent without Memora.
- **Secondary claim:** any improvement comes from memory retrieval and memory organization, not from benchmark leakage, oracle shortcuts, or instrumentation artifacts.
- **Operational claim:** the improvement remains practically useful after accounting for latency, cost, and abstention behavior.

The protocol is **not** designed to support broad claims like:

- "Memora solves long-term memory in general"
- "Memora is better than every other memory system"
- "Memora improves all CLI agents equally"

Those require additional studies.

---

## 2. Threats to Validity To Eliminate First

Do **not** run a new primary benchmark before these issues are fixed.

### 2.1 Oracle is not the primary benchmark

`longmemeval_oracle.json` must not be used for the main product claim.

Reason:

- it is an oracle-retrieval setting, not the full needle-in-a-haystack condition;
- in the current local analysis, all `haystack_session_ids == answer_session_ids`;
- average session count is very small compared with the full benchmark setting.

Use `oracle` only as:

- upper bound for reader quality after perfect retrieval;
- ablation for "how good is the agent if the relevant sessions are already isolated?"

### 2.2 Remove all benchmark leakage

Agent-visible workspace material must not expose gold labels or evidence hints.

Forbidden in runtime files:

- `answer_session_ids`
- `has_answer`
- `# evidence session`
- visible turn markers like `⭐`
- filenames or IDs like `answer_*`
- KG facts like `contains_answer = true`

### 2.3 Runtime path must match the product claim

If the product claim includes:

- `HANDOFF.md`
- `CURRENT.md`
- `memory-restore`
- session routing
- KG-based retrieval

then the benchmark workspace must actually provide and use those components.

If a component is not truly active in runtime, it must not be included in the claim.

### 2.4 Statistics must separate errors from correctness

Judge failures are not incorrect answers.

Any `autoeval_label = -1` must be treated as:

- missing / judge_error

and excluded from:

- accuracy
- confidence intervals
- McNemar calculations

---

## 3. Primary Dataset and Study Matrix

### 3.1 Primary dataset

Use:

- `data/longmemeval_s_cleaned.json`

Why:

- it contains the real long-history noise setting;
- it is the right benchmark for a practical memory product claim.

### 3.2 Secondary datasets

Use later:

- `data/longmemeval_m_cleaned.json` as a stress test
- `data/longmemeval_oracle.json` as an upper-bound ablation

### 3.3 Primary model / agent policy

Choose one primary CLI agent before running the experiment and keep it fixed.

Recommended options:

- `Claude Haiku` if the claim is about low-cost practical memory for automation
- `Codex gpt-5.2` if the claim is about stronger coding-agent workflows

Any second agent should be treated as a replication study, not as the primary result.

---

## 4. Experimental Conditions

All comparisons must be **paired**: same question, same agent family, same model, different memory condition.

### 4.1 Condition A: Flat Baseline

Goal:

- measure the same agent on the same session files without Memora scaffolding.

Allowed:

- raw session files

Not allowed:

- `HANDOFF.md`
- `CURRENT.md`
- `memory-restore`
- Memora routing/indexing behavior
- KG assistance

### 4.2 Condition B: Memora-Min

Goal:

- isolate the practical value of the Memora workflow without adding optional KG complexity.

Includes:

- `HANDOFF.md`
- `CURRENT.md`
- `memory-restore`
- Memora session routing

Excludes:

- KG retrieval unless explicitly enabled and working

### 4.3 Condition C: Memora-Full

Goal:

- evaluate the full product path if KG and other advanced features are truly active.

Includes:

- everything in Memora-Min
- KG-assisted retrieval, if actually wired into runtime

### 4.4 Condition D: Oracle

Goal:

- estimate reader/reasoning quality after perfect retrieval.

Do not use this condition for the primary product claim.

---

## 5. Primary and Secondary Endpoints

### 5.1 Primary endpoint

- overall QA accuracy on the full `longmemeval_s_cleaned.json`

This is the only endpoint used for the top-line significance claim.

### 5.2 Secondary QA endpoints

- accuracy by question type:
- `single-session-user`
- `single-session-assistant`
- `single-session-preference`
- `multi-session`
- `knowledge-update`
- `temporal-reasoning`
- `abstention`

### 5.3 Retrieval endpoints

If the system logs retrieved session IDs, calculate:

- `Recall@1`
- `Recall@3`
- `Recall@5`
- `MRR`
- `NDCG@k`

These metrics support the explanation of *why* Memora helps.

### 5.4 Operational endpoints

Track per question:

- elapsed time
- files read
- sessions read
- approximate token / cost signal if available
- judge error rate

These metrics support the product practicality claim.

---

## 6. Statistical Design

### 6.1 Primary significance test

Use:

- **McNemar's test** on paired correctness labels

Comparison:

- `Memora-Min` vs `Flat Baseline`

Primary null hypothesis:

- both systems have equal probability of getting a question correct

### 6.2 Effect size

Always report:

- `delta accuracy` in percentage points
- `95% paired bootstrap CI`

Do not report p-value alone.

### 6.3 Secondary tests

For secondary slices:

- paired bootstrap CI for delta
- optional McNemar by question type

Apply multiple-comparison correction:

- `Holm-Bonferroni`

### 6.4 Judge errors

If judge failures exceed `2%` of examples in a primary run:

- do not finalize the run;
- fix the evaluation path or rerun the affected questions.

### 6.5 Success threshold

Memora is considered statistically and practically validated only if all hold:

- `p < 0.05` on the primary comparison
- `delta accuracy >= +5 pp` overall
- no material regression in `abstention` greater than `2 pp`
- operational cost remains acceptable for the intended use case

Stronger evidence:

- `+8 pp` or more on `multi-session` and/or `knowledge-update`
- replication on a second agent or second full run

---

## 7. Judge Policy

### 7.1 Preferred evaluator

Primary preference:

- official LongMemEval evaluator or an evaluator calibrated against it

### 7.2 Codex judge policy

`Codex gpt-5.2` may be used as the practical judge only after calibration.

Calibration protocol:

- sample at least 150 questions from `s_cleaned`
- stratify across all question types, including abstention
- compare `Codex judge` verdicts against the official evaluator

Acceptance threshold:

- overall agreement `>= 95%`
- no systematic weakness on `abstention` or `knowledge-update`

If calibration fails:

- keep Codex judge only as a secondary evaluator

---

## 8. Instrumentation Requirements

### 8.1 Required run metadata

Every result row must include:

- `question_id`
- `question_type`
- `dataset`
- `mode`
- `agent`
- `model`
- `run_id`
- `elapsed_s`
- `hypothesis`
- `judge_label`
- `judge_error` if any

### 8.2 Retrieval trace

If available, include:

- `retrieved_session_ids`
- `sessions_read`
- `files_read`

### 8.3 Usage diagnostics

`memora_used` may be logged, but it is only a diagnostic signal.

It must not be used as:

- primary evidence of product value
- substitute for retrieval metrics

If a toolchain cannot support reliable usage tracing, use:

- `null`
- `unsupported`

not `false`.

---

## 9. Required Implementation Backlog

### PR1 — Remove leakage and fix benchmark materialization

Files:

- `memora_longmemeval/session_adapter.py`
- `memora_longmemeval/ingestor.py`
- `memora_longmemeval/workspace.py`

Tasks:

- remove visible evidence hints
- hide answer-derived IDs
- sort sessions chronologically
- make `CURRENT.md` a neutral index
- align runtime components with the product claim

Definition of done:

- generated workspace contains no visible gold labels

### PR2 — Add fair benchmark modes

Files:

- `memora_longmemeval/bench.py`
- `memora_longmemeval/workspace.py`
- optional new mode helper module

Tasks:

- add `flat-baseline`
- add `memora-min`
- add `memora-full`
- keep `oracle` separate

Definition of done:

- same question can be run in all modes with identical output schema

### PR3 — Fix instrumentation and statistics

Files:

- `memora_longmemeval/agents/claude_cli.py`
- `memora_longmemeval/agents/codex_cli.py`
- `memora_longmemeval/evaluate.py`
- `memora_longmemeval/stats.py`

Tasks:

- separate `judge_error` from correctness
- exclude missing labels from accuracy
- add paired bootstrap CI
- keep McNemar as primary significance test

Definition of done:

- no negative accuracy or judge-error pollution

### PR4 — Judge calibration

Files:

- `memora_longmemeval/evaluate.py`
- new calibration script / doc

Tasks:

- compare Codex judge against the official evaluator
- save disagreement report

Definition of done:

- agreement report exists and acceptance decision is explicit

Reference runbook:

- [Judge Calibration](./JUDGE_CALIBRATION.md)

### PR5 — Retrieval metrics

Files:

- `memora_longmemeval/bench.py`
- `memora_longmemeval/stats.py`
- optional retrieval metrics module

Tasks:

- log retrieved session IDs
- calculate retrieval metrics
- report QA delta and retrieval delta together

Definition of done:

- product claim can distinguish retrieval benefit from reader benefit

### PR6 — Final runbook

Files:

- this document
- optional results README

Tasks:

- document exact commands
- fix primary dataset, model, and mode order
- define success threshold

Definition of done:

- experiment is runnable end to end without ambiguity

---

## 10. Primary Run Commands

Example primary run using Claude Haiku:

```bash
python3 memora_longmemeval/bench.py data/longmemeval_s_cleaned.json \
  --agent claude --model haiku --mode flat-baseline \
  --output results/s_cleaned_flat_haiku.jsonl

python3 memora_longmemeval/bench.py data/longmemeval_s_cleaned.json \
  --agent claude --model haiku --mode memora-min \
  --output results/s_cleaned_memora_min_haiku.jsonl

python3 memora_longmemeval/evaluate.py \
  results/s_cleaned_flat_haiku.jsonl \
  data/longmemeval_s_cleaned.json \
  --judge codex --judge-model gpt-5.2 \
  --output results/s_cleaned_flat_haiku.log

python3 memora_longmemeval/evaluate.py \
  results/s_cleaned_memora_min_haiku.jsonl \
  data/longmemeval_s_cleaned.json \
  --judge codex --judge-model gpt-5.2 \
  --output results/s_cleaned_memora_min_haiku.log

python3 memora_longmemeval/stats.py \
  results/s_cleaned_memora_min_haiku.log \
  data/longmemeval_s_cleaned.json \
  --compare results/s_cleaned_flat_haiku.log \
  --labels Memora Flat
```

Run the primary experiment with:

- `concurrency = 1`
- paired question set
- randomized condition order if possible

---

## 11. Artifacts Required For Final Claim

The final experiment package must contain:

- raw benchmark outputs in `results/*.jsonl`
- evaluated outputs in `results/*.log`
- calibration report for the judge
- statistical summary table
- paired comparison report
- final product conclusion

Recommended final summary file:

- `results/report.md`

Possible final conclusions:

- `Memora shows statistically significant improvement on LongMemEval`
- `Memora helps only in oracle / upper-bound settings`
- `No statistically significant product benefit detected`

---

## 12. Current Decision

Current repository state is **not yet ready** for the primary significance run.

The correct next step is:

1. remove leakage
2. add fair baselines
3. fix stats and judge handling
4. calibrate the evaluator
5. run paired experiments on `s_cleaned`

Only after that should the project claim statistically significant product value for Memora on LongMemEval.
