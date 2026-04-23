"""Load App Store / Play Store listing JSON from the publisher repo (`output/`)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

# Same mapping as `.claude/agents/screenshot_designer.md` (Step 0a / store paths).
_STORE_ROWS: Final[dict[str, tuple[str, str]]] = {
    "iphone": ("output/appstore.json", "appstore_iphone_portrait"),
    "ipad": ("output/appstore.json", "appstore_ipad_portrait"),
    "phone": ("output/playstore.json", "play_phone_portrait"),
    "tablet": ("output/playstore.json", "play_tablet_portrait"),
}


def listing_platform_choices() -> tuple[str, ...]:
    """Stable labels for argparse ``choices=``."""
    return tuple(sorted(_STORE_ROWS))


def normalize_platform(platform: str) -> str:
    key = platform.strip().lower()
    if key not in _STORE_ROWS:
        allowed = ", ".join(sorted(_STORE_ROWS))
        raise ValueError(f"platform must be one of: {allowed} (got {platform!r})")
    return key


def store_listing_relative_path(platform: str) -> str:
    """Relative path under repo root, e.g. ``output/appstore.json``."""
    key = normalize_platform(platform)
    return _STORE_ROWS[key][0].replace("\\", "/")


def store_listing_preset_id(platform: str) -> str:
    key = normalize_platform(platform)
    return _STORE_ROWS[key][1]


def load_store_listing(repo_root: Path, platform: str) -> dict[str, Any]:
    """
    Read ``output/appstore.json`` or ``output/playstore.json`` for the given Step-0a platform.

    Returns a dict suitable for JSON printing: ``ok``, ``platform``, ``canvasSize`` (same as
    platform key), ``presetId``, paths, and ``store`` (parsed top-level object).
    """
    key = normalize_platform(platform)
    rel, preset_id = _STORE_ROWS[key]
    path = (repo_root / rel).resolve()
    if not path.is_file():
        raise ValueError(
            "store listing file not found: {} (create it first, e.g. via app_optimizer)".format(path),
        )
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("store listing JSON must be a top-level object")
    return {
        "ok": True,
        "platform": key,
        "canvasSize": key,
        "presetId": preset_id,
        "relativePath": rel.replace("\\", "/"),
        "absolutePath": str(path),
        "store": data,
    }
