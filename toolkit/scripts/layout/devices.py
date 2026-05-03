from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _publisher_root(repo_root: Path) -> Path:
    return repo_root.resolve()


def device_frames_public_dir(repo_root: Path) -> Path:
    return _publisher_root(repo_root) / "web_ui" / "public" / "device-frames"


def list_device_packs(repo_root: Path, device_type: str | None = None) -> list[dict[str, Any]]:
    index_path = device_frames_public_dir(repo_root) / "index.json"
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    devices = raw.get("devices", [])
    if device_type:
        t = device_type.strip().lower()
        return [d for d in devices if str(d.get("type", "")).lower() == t]
    return list(devices)


def pack_id_from_path(frame_path: str) -> str:
    """e.g. /device-frames/iphone_12_pro/frame.json -> iphone_12_pro."""
    parts = [p for p in frame_path.split("/") if p]
    if len(parts) >= 2 and parts[0] == "device-frames":
        return parts[1]
    if len(parts) >= 1:
        return parts[0]
    return ""


def load_frame_pack(repo_root: Path, pack_id: str) -> dict[str, Any]:
    path = device_frames_public_dir(repo_root) / pack_id / "frame.json"
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_frames(frame_json: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in frame_json.get("frames", []):
        out.append(
            {
                "name": entry.get("name"),
                "description": entry.get("description"),
                "framePath": entry.get("framePath"),
                "viewWidth": entry.get("viewWidth"),
                "viewHeight": entry.get("viewHeight"),
            },
        )
    return out
