from __future__ import annotations

from dataclasses import dataclass

from core.constants import SAFE_ZONE_BOTTOM, SAFE_ZONE_SIDES, SAFE_ZONE_TOP
from layout.grid import SnapMode, snap_point


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class SafeZoneRect:
    left: int
    top: int
    right: int
    bottom: int
    width: int
    height: int


def safe_zone_rect(canvas_width: int, canvas_height: int) -> SafeZoneRect:
    left = SAFE_ZONE_SIDES
    top = SAFE_ZONE_TOP
    right = canvas_width - SAFE_ZONE_SIDES
    bottom = canvas_height - SAFE_ZONE_BOTTOM
    return SafeZoneRect(
        left=left,
        top=top,
        right=right,
        bottom=bottom,
        width=max(0, right - left),
        height=max(0, bottom - top),
    )


def text_in_safe_zone(
    x: float,
    y: float,
    width: float,
    height: float,
    canvas_width: int,
    canvas_height: int,
) -> tuple[bool, dict[str, float]]:
    """Single-panel canvas (or legacy): same as one strip panel at origin."""
    ok = (
        x >= SAFE_ZONE_SIDES
        and y >= SAFE_ZONE_TOP
        and x + width <= canvas_width - SAFE_ZONE_SIDES
        and y + height <= canvas_height - SAFE_ZONE_BOTTOM
    )
    deltas = {
        "margin_left": float(x - SAFE_ZONE_SIDES),
        "margin_top": float(y - SAFE_ZONE_TOP),
        "margin_right": float(canvas_width - SAFE_ZONE_SIDES - (x + width)),
        "margin_bottom": float(canvas_height - SAFE_ZONE_BOTTOM - (y + height)),
    }
    return ok, deltas


def layer_within_canvas(
    x: float, y: float, width: float, height: float, canvas_width: int, canvas_height: int
) -> bool:
    return (
        x >= 0
        and y >= 0
        and x + width <= canvas_width
        and y + height <= canvas_height
    )


def clamp_rect_to_canvas(
    x: float,
    y: float,
    width: float,
    height: float,
    canvas_width: int,
    canvas_height: int,
    snap: bool = True,
    snap_mode: SnapMode = "nearest",
) -> tuple[int, int]:
    max_x = max(0, canvas_width - width)
    max_y = max(0, canvas_height - height)
    cx = min(max(0.0, x), float(max_x))
    cy = min(max(0.0, y), float(max_y))
    if snap:
        return snap_point(cx, cy, snap_mode)
    return int(round(cx)), int(round(cy))


def clamp_rect_to_safe_zone(
    x: float,
    y: float,
    width: float,
    height: float,
    canvas_width: int,
    canvas_height: int,
    snap: bool = True,
    snap_mode: SnapMode = "nearest",
) -> tuple[int, int]:
    sz = safe_zone_rect(canvas_width, canvas_height)
    max_x = max(float(sz.left), float(sz.right - width))
    max_y = max(float(sz.top), float(sz.bottom - height))
    cx = min(max(float(sz.left), x), max_x)
    cy = min(max(float(sz.top), y), max_y)
    if snap:
        return snap_point(cx, cy, snap_mode)
    return int(round(cx)), int(round(cy))
