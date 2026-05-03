"""Slice a browser-pushed AgentLayoutSummaryV1 into per-panel summaries (pull-export --panels)."""

from __future__ import annotations

import re
from typing import Any

from layout.geometry import panel_rect, rects_overlap, strip_panel_width


def parse_panel_indexes_arg(raw: str) -> list[int]:
    """
    Parse comma-separated 0-based panel indexes, e.g. ``"0, 2"`` -> ``[0, 2]``.
    Raises ValueError on empty or invalid tokens.
    """
    s = raw.strip()
    if not s:
        raise ValueError("panels list is empty")
    parts = [p.strip() for p in s.split(",")]
    out: list[int] = []
    for p in parts:
        if not p:
            raise ValueError("panels list has an empty segment")
        if not re.fullmatch(r"-?\d+", p):
            raise ValueError(f"invalid panel index token: {p!r}")
        out.append(int(p))
    return out


def dedupe_preserve_order(values: list[int]) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for v in values:
        if v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def sorted_contiguous_panel_indexes(indexes: list[int]) -> list[int]:
    """
    Return unique panel indexes sorted ascending, or raise if they are not a
    contiguous strip segment (e.g. ``[0, 1]``, ``[3, 4]``, ``[2, 3, 4]``).
    """
    if not indexes:
        raise ValueError("panels list is empty")
    uniq = sorted(set(indexes))
    for i in range(len(uniq)):
        if uniq[i] != uniq[0] + i:
            raise ValueError(
                "panel indexes must be adjacent columns on the strip (e.g. 0,1 or 3,4 or 2,3,4); "
                f"after sorting deduplicated values: {uniq}",
            )
    return uniq


def slice_agent_layout_summary_v1(
    full: dict[str, Any],
    panel_indexes: list[int],
) -> dict[str, Any]:
    """
    Build a multi-panel pull-export response from a full layout summary.

    ``panel_indexes`` must describe **adjacent** strip columns (same rule as
    ``pull-preview --panels`` / ``render_panel_preview`` ``panel_indexes``): after
    deduplication they must form one contiguous ascending run (e.g. ``[0, 1]``,
    ``[3, 4]``, ``[2, 3, 4]``). Indexes are processed in **sorted** order.

    Each entry includes:

    - ``panelLocalRect`` — ``{ left, top, width, height }`` with origin ``(0, 0)``; same
      size as ``summary.canvas``. Layer ``left`` / ``top`` in ``summary`` are relative to
      this rectangle.
    - ``stripRect`` — the same column as axis-aligned bounds on the **full strip**
      (``sourceCanvas`` coordinates): ``left`` / ``top`` / ``width`` / ``height`` as integers.
    - ``summary`` — ``AgentLayoutSummaryV1`` with ``canvas`` sized to one column,
      ``layout.screens`` = 1, ``layout.gap`` = 0, and layers intersecting that column
      (axis-aligned bbox overlap) with ``left`` / ``top`` shifted to panel-local coordinates.

    Layers that do not overlap the column are omitted.
    """
    if full.get("error"):
        return dict(full)

    ver = full.get("layoutSummaryVersion")
    if ver != 1:
        raise ValueError("layoutSummaryVersion must be 1 to slice export")

    canvas = full.get("canvas")
    layout = full.get("layout")
    layers = full.get("layers")
    if not isinstance(canvas, dict) or not isinstance(layout, dict) or not isinstance(layers, list):
        raise ValueError("export JSON missing canvas, layout, or layers")

    strip_w = canvas.get("width")
    strip_h = canvas.get("height")
    screens = layout.get("screens")
    gap = layout.get("gap")
    preset = layout.get("artboardPresetId")

    if not isinstance(strip_w, (int, float)) or not isinstance(strip_h, (int, float)):
        raise ValueError("canvas.width / canvas.height must be numbers")
    if not isinstance(screens, int) or screens < 1:
        raise ValueError("layout.screens must be an integer >= 1")
    if not isinstance(gap, (int, float)) or gap < 0:
        raise ValueError("layout.gap must be a non-negative number")
    if not isinstance(preset, str):
        raise ValueError("layout.artboardPresetId must be a string")

    panel_w = strip_panel_width(float(strip_w), screens, float(gap))
    panel_h = float(strip_h)
    if panel_w <= 0 or panel_h <= 0:
        raise ValueError("derived panel width/height must be positive")

    saved_at = full.get("savedAt")
    if not isinstance(saved_at, str):
        saved_at = ""

    background = full.get("background")
    requested = sorted_contiguous_panel_indexes(list(panel_indexes))
    panels_out: list[dict[str, Any]] = []

    for pi in requested:
        if pi < 0 or pi >= screens:
            raise ValueError(f"panel_index {pi} out of range for layout.screens={screens}")

        pl, pt, pw, ph = panel_rect(pi, float(gap), panel_w, panel_h)
        pl_i = int(round(pl))
        pt_i = int(round(pt))
        pw_i = max(1, int(round(pw)))
        ph_i = max(1, int(round(ph)))

        sliced_layers: list[Any] = []
        for layer in layers:
            if not isinstance(layer, dict):
                continue
            lx = layer.get("left")
            ly = layer.get("top")
            lw = layer.get("width")
            lh = layer.get("height")
            if not all(isinstance(x, (int, float)) for x in (lx, ly, lw, lh)):
                continue
            if not rects_overlap(float(lx), float(ly), float(lw), float(lh), pl, pt, pw, ph):
                continue
            layer_copy = dict(layer)
            layer_copy["left"] = float(lx) - pl
            layer_copy["top"] = float(ly) - pt
            sliced_layers.append(layer_copy)

        summary: dict[str, Any] = {
            "layoutSummaryVersion": 1,
            "savedAt": saved_at,
            "canvas": {"width": pw_i, "height": ph_i},
            "layout": {
                "artboardPresetId": preset,
                "screens": 1,
                "gap": 0,
            },
            "background": background if isinstance(background, dict) else {},
            "layers": sliced_layers,
        }
        panel_local_rect = {"left": 0, "top": 0, "width": pw_i, "height": ph_i}
        strip_rect = {"left": pl_i, "top": pt_i, "width": pw_i, "height": ph_i}
        panels_out.append(
            {
                "panelIndex": pi,
                "panelLocalRect": panel_local_rect,
                "stripRect": strip_rect,
                "summary": summary,
            },
        )

    return {
        "slicedExportVersion": 1,
        "requestedPanelIndexes": requested,
        "sourceSavedAt": saved_at,
        "sourceCanvas": {"width": int(round(strip_w)), "height": int(round(strip_h))},
        "sourceLayout": {"screens": screens, "gap": gap},
        "panels": panels_out,
    }
