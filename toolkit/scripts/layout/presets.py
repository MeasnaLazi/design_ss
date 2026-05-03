from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from core.constants import DEFAULT_PRESET_ID

CanvasSize = Literal["iphone", "ipad", "phone", "tablet"]


@dataclass(frozen=True)
class PresetInfo:
    preset_id: str
    display_slug: str
    placeholder: str
    width: int
    height: int


_PLACEHOLDER = "http://localhost:4713/__api/datasource/placeholder"

LEGACY_PRESET_ID: dict[str, str] = {
    "appstore_iphone_67": "appstore_iphone_portrait",
    "appstore_ipad_129": "appstore_ipad_portrait",
}

PRESET_BY_ID: dict[str, PresetInfo] = {
    "appstore_iphone_portrait": PresetInfo(
        "appstore_iphone_portrait",
        "iphone",
        f"{_PLACEHOLDER}/iphone.jpg",
        1290,
        2796,
    ),
    "appstore_ipad_portrait": PresetInfo(
        "appstore_ipad_portrait",
        "ipad",
        f"{_PLACEHOLDER}/ipad.jpg",
        2048,
        2732,
    ),
    "play_phone_portrait": PresetInfo(
        "play_phone_portrait",
        "play_phone",
        f"{_PLACEHOLDER}/phone.jpg",
        1080,
        1920,
    ),
    "play_tablet_portrait": PresetInfo(
        "play_tablet_portrait",
        "play_tablet_portrait",
        f"{_PLACEHOLDER}/phone.jpg",
        1600,
        2560,
    ),
    "play_tablet_landscape": PresetInfo(
        "play_tablet_landscape",
        "play_tablet_landscape",
        f"{_PLACEHOLDER}/phone.jpg",
        2560,
        1600,
    ),
}

CANVAS_SIZE_TO_PRESET_ID: dict[str, str] = {
    "iphone": "appstore_iphone_portrait",
    "ipad": "appstore_ipad_portrait",
    "phone": "play_phone_portrait",
    "tablet": "play_tablet_portrait",
}


def resolve_preset_id(canvas_size: str | None = None, preset_id: str | None = None) -> str:
    if preset_id:
        pid = LEGACY_PRESET_ID.get(preset_id, preset_id)
        if pid in PRESET_BY_ID:
            return pid
    key = (canvas_size or "").strip().lower()
    if key in CANVAS_SIZE_TO_PRESET_ID:
        return CANVAS_SIZE_TO_PRESET_ID[key]
    return DEFAULT_PRESET_ID


def resolve_preset(
    canvas_size: str | None = None,
    preset_id: str | None = None,
) -> PresetInfo:
    pid = resolve_preset_id(canvas_size, preset_id)
    return PRESET_BY_ID[pid]


def list_presets() -> list[PresetInfo]:
    return list(PRESET_BY_ID.values())
