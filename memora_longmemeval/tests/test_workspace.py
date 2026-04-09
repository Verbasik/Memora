from memora_longmemeval.modes import (
    MODE_FLAT_BASELINE,
    MODE_MEMORA_FULL,
    MODE_MEMORA_MIN,
)
from memora_longmemeval.workspace import MemoraWorkspace


def test_flat_baseline_workspace_omits_memora_scaffold():
    with MemoraWorkspace(mode=MODE_FLAT_BASELINE) as workspace:
        assert workspace.sessions_dir.name == "SESSIONS"
        assert workspace.sessions_dir.parent.name == "history"
        assert not (workspace.path / "AGENTS.md").exists()
        assert not (workspace.path / "memory-bank").exists()
        assert (workspace.path / "README_BENCH.md").exists()


def test_memora_min_workspace_includes_scaffold_without_scripts():
    with MemoraWorkspace(mode=MODE_MEMORA_MIN) as workspace:
        assert (workspace.path / "AGENTS.md").exists()
        assert (workspace.path / "memory-bank" / "INDEX.md").exists()
        assert not (workspace.path / "memory-bank" / "scripts").exists()


def test_memora_full_workspace_copies_runtime_scripts():
    with MemoraWorkspace(mode=MODE_MEMORA_FULL) as workspace:
        assert (workspace.path / "memory-bank" / "scripts" / "knowledge_graph.py").exists()
