from pathlib import Path

import pytest


@pytest.fixture
def repo_root() -> Path:
    """apps_publisher repo root (parent of agent_toolkit/)."""
    return Path(__file__).resolve().parents[2]
