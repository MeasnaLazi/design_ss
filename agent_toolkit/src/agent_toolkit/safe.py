from __future__ import annotations

from dataclasses import dataclass

from agent_toolkit.constants import SAFE_ZONE_BOTTOM, SAFE_ZONE_SIDES, SAFE_ZONE_TOP
from agent_toolkit.grid import SnapMode, snap_point, snap_to_grid


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


def panel_width_from_strip(strip_width: int, screens: int, gap: int) -> int:
    """Inverse of ``screens * panel_w + (screens - 1) * gap`` (integer strip width)."""
    if screens < 1:
        return strip_width
    return round((strip_width - (screens - 1) * gap) / screens)


def panel_index_for_center_x(cx: float, screens: int, gap: int, panel_w: int) -> int:
    best_i = 0
    best_d = float("inf")
    for i in range(screens):
        mid = i * (panel_w + gap) + panel_w / 2
        d = abs(cx - mid)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def text_in_multi_panel_strip_safe_zone(
    x: float,
    y: float,
    width: float,
    height: float,
    strip_width: int,
    strip_height: int,
    screens: int,
    gap: int,
) -> tuple[bool, dict[str, float]]:
    """Text bbox must lie inside safe margins of the panel that contains the bbox horizontal center."""
    panel_w = panel_width_from_strip(strip_width, screens, gap)
    panel_h = strip_height
    cx = x + width / 2
    pi = panel_index_for_center_x(cx, screens, gap, panel_w)
    pl = pi * (panel_w + gap)
    safe_l = pl + SAFE_ZONE_SIDES
    safe_r = pl + panel_w - SAFE_ZONE_SIDES
    safe_t = SAFE_ZONE_TOP
    safe_b = panel_h - SAFE_ZONE_BOTTOM
    ok = (
        x >= safe_l - 1e-6
        and y >= safe_t - 1e-6
        and x + width <= safe_r + 1e-6
        and y + height <= safe_b + 1e-6
    )
    deltas = {
        "margin_left": float(x - safe_l),
        "margin_top": float(y - safe_t),
        "margin_right": float(safe_r - (x + width)),
        "margin_bottom": float(safe_b - (y + height)),
        "panel_index": float(pi),
    }
    return ok, deltas


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
