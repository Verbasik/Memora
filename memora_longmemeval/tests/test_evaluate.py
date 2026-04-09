from memora_longmemeval import evaluate


def test_parse_verdict_understands_correct_and_incorrect():
    assert evaluate._parse_verdict("Answer: CORRECT") == 1
    assert evaluate._parse_verdict("INCORRECT") == 0
    assert evaluate._parse_verdict("unparseable output") == -1


def test_evaluate_one_preserves_judge_errors(monkeypatch):
    monkeypatch.setattr(
        evaluate,
        "_judge_with_codex",
        lambda *args, **kwargs: {
            "label": -1,
            "judge_error": "timeout",
            "judge_output_excerpt": None,
        },
    )

    result = evaluate.evaluate_one(
        result={"question_id": "q1", "hypothesis": "foo"},
        dataset={"q1": {"question": "What happened?", "answer": "bar"}},
        judge="codex",
        judge_model="gpt-5.2",
        timeout=10,
    )

    assert result["autoeval_label"] == -1
    assert result["judge_error"] == "timeout"
    assert result["correct_answer"] == "bar"


def test_judge_with_codex_treats_missing_last_message_as_error(monkeypatch, tmp_path):
    class Result:
        returncode = 1
        stdout = ""
        stderr = "network failure"

    monkeypatch.setattr(evaluate.subprocess, "run", lambda *args, **kwargs: Result())
    monkeypatch.setattr(evaluate.tempfile, "NamedTemporaryFile", lambda **kwargs: type("Tmp", (), {
        "__enter__": lambda self: type("Obj", (), {"name": str(tmp_path / "judge.txt")})(),
        "__exit__": lambda self, exc_type, exc, tb: None,
    })())

    result = evaluate._judge_with_codex("prompt", "gpt-5.2", 30)

    assert result["label"] == -1
    assert result["judge_error"] == "no_model_output"
    assert "network failure" in result["judge_output_excerpt"]
