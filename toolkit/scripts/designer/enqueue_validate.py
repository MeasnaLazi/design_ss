"""Fast client-side checks for `designer enqueue-op` before the Web UI round-trip."""

from __future__ import annotations

import math
from typing import Any


def _has_panel_column(d: dict[str, Any]) -> bool:
    """True if args declare a strip column via panel_index (0-based) or panel_number (1-based)."""
    pi = d.get("panel_index")
    if pi is not None and pi != "":
        return True
    pn = d.get("panel_number")
    if pn is not None and pn != "":
        return True
    return False


def _patch_sets_xy(patch: Any) -> bool:
    return isinstance(patch, dict) and ("x" in patch or "y" in patch)


def _finite_pair_xy(args: dict[str, Any]) -> bool:
    x, y = args.get("x"), args.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return False
    return math.isfinite(float(x)) and math.isfinite(float(y))


def _preview_multiplier_ok(value: Any) -> bool:
    if value is None or value == "":
        return True
    try:
        n = int(value)
    except (TypeError, ValueError):
        return False
    return n in (1, 2)


def validate_positional_enqueue_args(operation: str, args: dict[str, Any]) -> None:
    """
    Ensure panel column is declared when the Web UI expects panel-local coordinates.

    Raises ValueError with a short message on violation (mirrors designer toasts).
    """
    op = operation.strip()

    if op in ("render_panel_preview", "render_preview", "render_workspace_preview"):
        if not _preview_multiplier_ok(args.get("preview_multiplier")):
            raise ValueError(
                f"{op}: preview_multiplier must be 1 or 2 when set (got {args.get('preview_multiplier')!r})."
            )
        return

    if op in ("add_device_frame", "add_text", "device_set_position"):
        if not _has_panel_column(args):
            raise ValueError(
                f"{op}: args must include panel_index (0-based) or panel_number (1-based) "
                "for panel-local coordinates."
            )
        return

    if op == "move_layer":
        if _finite_pair_xy(args) and not _has_panel_column(args):
            raise ValueError(
                "move_layer: panel_index or panel_number is required when setting panel-local x/y."
            )
        return

    if op == "layer_patch":
        patch = args.get("patch")
        if _patch_sets_xy(patch) and not _has_panel_column(args):
            raise ValueError(
                "layer_patch: panel_index or panel_number is required when patch sets x/y "
                "(panel-local coordinates)."
            )
        return

    if op == "layers_patch_bulk":
        layers = args.get("layers")
        top_panel = _has_panel_column(args)
        if isinstance(layers, list):
            for i, row in enumerate(layers):
                if not isinstance(row, dict):
                    continue
                patch = row.get("patch")
                if _patch_sets_xy(patch) and not (top_panel or _has_panel_column(row)):
                    raise ValueError(
                        "layers_patch_bulk: each entry with patch x/y needs panel_index/panel_number "
                        f"on the operation or on layers[{i}] (panel-local coordinates)."
                    )
        return

    if op == "align":
        ref = str(args.get("reference", "")).strip().lower()
        if ref == "canvas":
            raise ValueError(
                'align: reference "canvas" is not allowed; use reference "panel" with panel_index '
                "or panel_number (panel-local)."
            )
        if ref == "panel" and not _has_panel_column(args):
            raise ValueError(
                'align: reference "panel" requires panel_index (0-based) or panel_number (1-based).'
            )
        return
