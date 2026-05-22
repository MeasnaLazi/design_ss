"""Map validation violations to documented enqueue-op suggested fixes."""

from __future__ import annotations

import math
from typing import Any

CAPTION_FONT_IDS = frozenset({"caption", "caption1", "caption2", "footnote"})


def is_caption_text(font: str | None, size: float) -> bool:
    del size  # captions identified by preset id only
    if font and font.strip().lower() in CAPTION_FONT_IDS:
        return True
    return False


def fix_move_layer(
    layer_id: str,
    *,
    dx: float = 0.0,
    dy: float = 0.0,
    panel_index: int | None = None,
) -> dict[str, Any]:
    args: dict[str, Any] = {"layer_id": layer_id, "dx": round(dx), "dy": round(dy)}
    if panel_index is not None:
        args["panel_index"] = panel_index
    return {"operation": "move_layer", "args": args}


def fix_text_set_font_size(layer_id: str, size: float) -> dict[str, Any]:
    return {"operation": "text_set_font_size", "args": {"layer_id": layer_id, "size": round(size, 1)}}


def fix_text_set_color(layer_id: str, color: str) -> dict[str, Any]:
    return {"operation": "text_set_color", "args": {"layer_id": layer_id, "color": color}}


def fix_device_set_position(
    layer_id: str,
    x: float,
    y: float,
    panel_index: int,
) -> dict[str, Any]:
    return {
        "operation": "device_set_position",
        "args": {
            "layer_id": layer_id,
            "x": round(x, 1),
            "y": round(y, 1),
            "panel_index": panel_index,
        },
    }


def fix_device_set_size(layer_id: str, width: float) -> dict[str, Any]:
    return {
        "operation": "device_set_size",
        "args": {"layer_id": layer_id, "width": round(width, 1), "fit": "contain"},
    }


def fix_device_size_delta(layer_id: str, delta_px: float) -> dict[str, Any]:
    return {"operation": "device_size_delta", "args": {"layer_id": layer_id, "delta_px": round(delta_px)}}


def fix_align_panel(layer_id: str, anchor: str, panel_index: int) -> dict[str, Any]:
    return {
        "operation": "align",
        "args": {
            "layer_id": layer_id,
            "anchor": anchor,
            "reference": "panel",
            "panel_index": panel_index,
        },
    }


def fix_layer_patch(layer_id: str, patch: dict[str, Any], panel_index: int | None = None) -> dict[str, Any]:
    args: dict[str, Any] = {"layer_id": layer_id, "patch": patch}
    if panel_index is not None:
        args["panel_index"] = panel_index
    return {"operation": "layer_patch", "args": args}


def fix_set_z_index(layer_id: str, z_index: int) -> dict[str, Any]:
    return {"operation": "set_z_index", "args": {"layer_id": layer_id, "z_index": z_index}}


def fix_set_equal_spacing(layer_ids: list[str], axis: str, gap: float) -> dict[str, Any]:
    return {
        "operation": "set_equal_spacing",
        "args": {"layer_ids": layer_ids, "axis": axis, "gap": round(gap, 1)},
    }


def fix_margin_violation(
    v: dict[str, Any],
    *,
    panel_index: int | None = None,
) -> dict[str, Any] | None:
    layer_id = str(v.get("layer_id", ""))
    if not layer_id:
        return None
    dx, dy = 0.0, 0.0
    if "left_short_by_px" in v:
        dx += float(v["left_short_by_px"]) + 2.0
    if "right_past_by_px" in v:
        dx -= float(v["right_past_by_px"]) + 2.0
    if "top_short_by_px" in v:
        dy += float(v["top_short_by_px"]) + 2.0
    if "bottom_past_by_px" in v:
        dy -= float(v["bottom_past_by_px"]) + 2.0
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return None
    return fix_move_layer(layer_id, dx=dx, dy=dy, panel_index=panel_index)


def fix_text_overlap_pair(a_id: str, b_id: str) -> dict[str, Any]:
    return fix_move_layer(b_id, dy=16)


def fix_device_move_delta(
    layer_id: str,
    dx: float,
    dy: float,
    *,
    panel_index: int | None = None,
) -> dict[str, Any]:
    args: dict[str, Any] = {
        "layer_id": layer_id,
        "dx": round(dx),
        "dy": round(dy),
    }
    if panel_index is not None:
        args["panel_index"] = panel_index
    return {"operation": "device_move_delta", "args": args}


def fix_text_device_overlap(text_id: str) -> dict[str, Any]:
    return fix_move_layer(text_id, dy=-24)


def fix_device_height_band(
    layer_id: str,
    panel_height: float,
    height_ratio: float,
    min_r: float,
    max_r: float,
) -> dict[str, Any]:
    target_r = (min_r + max_r) / 2.0
    target_h = target_r * panel_height
    current_h = height_ratio * panel_height
    delta = target_h - current_h
    return fix_device_size_delta(layer_id, delta)


def fix_device_center_x(layer_id: str, panel_width: float, current_x: float, panel_index: int) -> dict[str, Any]:
    return fix_device_set_position(layer_id, panel_width / 2.0, current_x, panel_index)


def fix_device_safe_bottom(
    layer_id: str,
    panel_width: float,
    panel_height: float,
    margin_px: float,
    device: dict[str, Any],
    panel_index: int,
) -> dict[str, Any]:
    hw = float(device.get("width", 0)) / 2.0
    hh = float(device.get("height", 0)) / 2.0
    cy = float(device.get("y", 0))
    max_cy = panel_height - margin_px - hh
    if cy > max_cy:
        return fix_device_set_position(layer_id, float(device.get("x", panel_width / 2)), max_cy, panel_index)
    return fix_device_set_position(layer_id, float(device.get("x", panel_width / 2)), cy, panel_index)


def attach_fix(violation: dict[str, Any], fix: dict[str, Any] | None) -> dict[str, Any]:
    if fix is None:
        return violation
    out = dict(violation)
    out["suggested_fix"] = fix
    return out


def attach_fixes(violations: list[dict[str, Any]], fixer) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for v in violations:
        fix = fixer(v)
        out.append(attach_fix(v, fix))
    return out
