from memora_longmemeval import stats


def test_report_excludes_judge_errors_from_accuracy():
    result_rows = {
        "q1": {"label": 1, "judge_error": None},
        "q2": {"label": -1, "judge_error": "timeout"},
        "q3": {"label": 0, "judge_error": None},
    }
    dataset = {
        "q1": {"question_type": "temporal-reasoning"},
        "q2": {"question_type": "temporal-reasoning"},
        "q3": {"question_type": "temporal-reasoning"},
    }

    report = stats.report(result_rows, dataset, label="Test")

    assert report["n_total"] == 3
    assert report["n_scored"] == 2
    assert report["n_errors"] == 1
    assert report["overall_acc"] == 0.5


def test_mcnemar_counts_discordant_pairs():
    chi2, p, b, c = stats.mcnemar_test([1, 1, 0, 0], [1, 0, 1, 0])

    assert b == 1
    assert c == 1
    assert chi2 >= 0
    assert 0 <= p <= 1


def test_retrieval_report_uses_answer_session_ids():
    result_rows = {
        "q1": {"label": 1, "judge_error": None, "retrieved_session_ids": ["s2", "s1"]},
        "q2": {"label": 0, "judge_error": None, "retrieved_session_ids": ["x1"]},
    }
    dataset = {
        "q1": {"question_type": "multi-session", "answer_session_ids": ["s1"]},
        "q2": {"question_type": "single-session-user", "answer_session_ids": ["s9"]},
    }

    retrieval = stats.retrieval_report(result_rows, dataset)

    assert retrieval is not None
    assert retrieval["n"] == 2
    assert retrieval["recall@1"] == 0.0
    assert retrieval["recall@3"] == 0.5
