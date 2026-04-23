"""Publisher repo root discovery (directory that contains web_ui/public/device-frames)."""

from __future__ import annotations

from pathlib import Path


def publisher_root() -> Path:
    cwd = Path.cwd().resolve()
    for p in [cwd, *cwd.parents]:
        if (p / "web_ui" / "public" / "device-frames").is_dir():
            return p
    return cwd


def agent_toolkit_project_dir() -> Path:
    """The `agent_toolkit/` project folder (contains `pyproject.toml`, optional `.env`)."""
    # This file: agent_toolkit/src/agent_toolkit/paths.py
    return Path(__file__).resolve().parent.parent.parent
