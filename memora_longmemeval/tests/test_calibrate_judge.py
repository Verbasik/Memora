from memora_longmemeval import calibrate_judge


def _dataset() -> dict[str, dict]:
    return {
        "q1": {"question_id": "q1", "question_type": "single-session-user"},
        "q2": {"question_id": "q2", "question_type": "single-session-user"},
        "q3": {"question_id": "q3", "question_type": "knowledge-update"},
        "q4": {"question_id": "q4", "question_type": "knowledge-update"},
        "q5_abs": {"question_id": "q5_abs", "question_type": "single-session-user"},
        "q6_abs": {"question_id": "q6_abs", "question_type": "single-session-user"},
    }


def test_stratified_sample_is_deterministic_and_covers_types():
    dataset = _dataset()

    sample_a = calibrate_judge.stratified_sample_question_ids(dataset, sample_size=4, seed=7)
    sample_b = calibrate_judge.stratified_sample_question_ids(dataset, sample_size=4, seed=7)

    assert sample_a["question_ids"] == sample_b["question_ids"]
    assert sample_a["sample_size"] == 4
    assert sample_a["counts_by_type"]["single-session-user"] >= 1
    assert sample_a["counts_by_type"]["knowledge-update"] >= 1
    assert sample_a["counts_by_type"]["abstention"] >= 1


def test_compare_judges_reports_agreement_by_type():
    dataset = _dataset()
    reference = {
        "q1": {"label": 1, "judge_error": None, "hypothesis": "a"},
        "q3": {"label": 0, "judge_error": None, "hypothesis": "b"},
        "q5_abs": {"label": 1, "judge_error": None, "hypothesis": "c"},
    }
    candidate = {
        "q1": {"label": 1, "judge_error": None, "hypothesis": "a"},
        "q3": {"label": 1, "judge_error": None, "hypothesis": "b"},
        "q5_abs": {"label": 1, "judge_error": None, "hypothesis": "c"},
    }

    report = calibrate_judge.compare_judges(
        dataset=dataset,
        reference_records=reference,
        candidate_records=candidate,
        sample_qids=["q1", "q3", "q5_abs"],
        agreement_threshold=0.95,
        critical_types=("abstention", "knowledge-update"),
        critical_threshold=0.90,
    )

    assert report["n_compared"] == 3
    assert report["overall_agreement"] == 2 / 3
    assert report["passed"] is False
    assert report["by_type"]["knowledge-update"]["agreement"] == 0.0
    assert report["by_type"]["abstention"]["agreement"] == 1.0
    assert report["disagreements"][0]["question_id"] == "q3"


def test_compare_judges_skips_judge_errors():
    dataset = _dataset()
    reference = {
        "q1": {"label": 1, "judge_error": None, "hypothesis": "a"},
        "q3": {"label": -1, "judge_error": "timeout", "hypothesis": "b"},
    }
    candidate = {
        "q1": {"label": 1, "judge_error": None, "hypothesis": "a"},
        "q3": {"label": 0, "judge_error": None, "hypothesis": "b"},
    }

    report = calibrate_judge.compare_judges(
        dataset=dataset,
        reference_records=reference,
        candidate_records=candidate,
        sample_qids=["q1", "q3"],
    )

    assert report["n_compared"] == 1
    assert report["overall_agreement"] == 1.0
    assert report["skipped"]["reference_judge_error"] == 1
