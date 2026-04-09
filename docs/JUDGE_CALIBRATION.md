# Judge Calibration

**Purpose:** validate a practical judge such as `Codex gpt-5.2` against a stronger reference evaluator before using it in the primary LongMemEval claim.  
**Scope:** LongMemEval verdict calibration only.  
**Primary artifact:** JSON report with agreement, per-type breakdown, skipped rows, and disagreement cases.

---

## Workflow

Run calibration in two steps:

1. Generate a stratified sample from `longmemeval_s_cleaned.json`
2. Compare a candidate judge log against a reference evaluator log on the same sample

The reference can be:

- the official LongMemEval evaluator output
- another judge that has already been validated against it

---

## Step 1: Generate a sample

```bash
python3 memora_longmemeval/calibrate_judge.py sample \
  data/longmemeval_s_cleaned.json \
  --sample-size 150 \
  --seed 42 \
  --output results/s_cleaned_judge_calibration_sample.json
```

The sample manifest stores:

- `question_ids`
- `question_ids_by_type`
- `counts_by_type`
- `sample_size`
- `seed`

The default policy guarantees at least one example per question type.

---

## Step 2: Compare candidate vs reference

```bash
python3 memora_longmemeval/calibrate_judge.py compare \
  data/longmemeval_s_cleaned.json \
  --reference results/s_cleaned_reference_judge.log \
  --candidate results/s_cleaned_codex_gpt52_judge.log \
  --sample results/s_cleaned_judge_calibration_sample.json \
  --agreement-threshold 0.95 \
  --critical-types abstention knowledge-update \
  --critical-threshold 0.90 \
  --output results/s_cleaned_codex_gpt52_judge.calibration.json
```

If a sample manifest is not provided, the script can generate one on the fly:

```bash
python3 memora_longmemeval/calibrate_judge.py compare \
  data/longmemeval_s_cleaned.json \
  --reference results/s_cleaned_reference_judge.log \
  --candidate results/s_cleaned_codex_gpt52_judge.log \
  --sample-size 150 \
  --seed 42
```

---

## Acceptance Policy

Recommended thresholds:

- overall agreement `>= 95%`
- `abstention` agreement `>= 90%`
- `knowledge-update` agreement `>= 90%`

If the run fails these thresholds:

- do not use that judge as the primary evaluator
- keep it only as a secondary or cheap evaluator

---

## Output Contract

The calibration report contains:

- `overall_agreement`
- `passed`
- `by_type`
- `critical_report`
- `skipped`
- `disagreements`

`disagreements` should be reviewed manually before finalizing the acceptance decision.

---

## Practical Notes

- Calibration should be done before the full paired benchmark.
- If either log contains many `judge_error` rows, fix that path first.
- Use the same hypotheses for both logs; only the evaluator should differ.

---

**See also:** [LongMemEval Experiment Protocol](./LONGMEMEVAL_EXPERIMENT.md)
