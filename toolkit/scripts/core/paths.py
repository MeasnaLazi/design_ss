"""Publisher repo root discovery (directory that contains web_ui/public/device-frames)."""

from __future__ import annotations

from pathlib import Path


def publisher_root() -> Path:
    cwd = Path.cwd().resolve()
    for p in [cwd, *cwd.parents]:
        if (p / "web_ui" / "public" / "device-frames").is_dir():
            return p
    return cwd


def toolkit_project_dir() -> Path:
    """The `toolkit/` project folder (contains `requirements.txt`, optional `.env`)."""
    # This file: toolkit/scripts/core/paths.py
    return Path(__file__).resolve().parents[2]
