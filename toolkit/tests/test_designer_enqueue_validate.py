"""Tests for client-side positional args validation on designer enqueue-op."""

from __future__ import annotations

import pytest

from designer.enqueue_validate import validate_positional_enqueue_args


def test_add_text_requires_panel() -> None:
    with pytest.raises(ValueError, match="panel_index"):
        validate_positional_enqueue_args("add_text", {"content": "Hi", "x": 0, "y": 0, "font": "body", "size": 16})
    validate_positional_enqueue_args(
        "add_text",
        {"content": "Hi", "panel_index": 0, "x": 0, "y": 0, "font": "body", "size": 16},
    )


def test_add_device_frame_requires_panel() -> None:
    with pytest.raises(ValueError, match="panel_index"):
        validate_positional_enqueue_args("add_device_frame", {"path": "/x", "frame": "front"})
    validate_positional_enqueue_args(
        "add_device_frame",
        {"path": "/x", "frame": "front", "panel_number": 1},
    )


def test_device_set_position_requires_panel() -> None:
    with pytest.raises(ValueError, match="panel_index"):
        validate_positional_enqueue_args("device_set_position", {"layer_id": "d1", "x": 100, "y": 200})
    validate_positional_enqueue_args(
        "device_set_position",
        {"layer_id": "d1", "panel_index": 1, "x": 100, "y": 200},
    )


def test_move_layer_xy_requires_panel() -> None:
    validate_positional_enqueue_args("move_layer", {"layer_id": "x", "dx": 1, "dy": 2})
    with pytest.raises(ValueError, match="panel_index"):
        validate_positional_enqueue_args("move_layer", {"layer_id": "x", "x": 10, "y": 20})
    validate_positional_enqueue_args("move_layer", {"layer_id": "x", "panel_index": 0, "x": 10, "y": 20})


def test_layer_patch_xy_requires_panel() -> None:
    validate_positional_enqueue_args("layer_patch", {"layer_id": "t", "patch": {"font_size": 12}})
    with pytest.raises(ValueError, match="panel_index"):
        validate_positional_enqueue_args("layer_patch", {"layer_id": "t", "patch": {"x": 1}})
    validate_positional_enqueue_args(
        "layer_patch",
        {"layer_id": "t", "panel_index": 0, "patch": {"x": 1, "y": 2}},
    )


def test_layers_patch_bulk_panel_top_level_or_per_entry() -> None:
    with pytest.raises(ValueError, match="layers\\[1\\]"):
        validate_positional_enqueue_args(
            "layers_patch_bulk",
            {
                "layers": [
                    {"layer_id": "a", "panel_index": 0, "patch": {"x": 1}},
                    {"layer_id": "b", "patch": {"y": 2}},
                ],
            },
        )
    validate_positional_enqueue_args(
        "layers_patch_bulk",
        {
            "panel_index": 0,
            "layers": [
                {"layer_id": "a", "patch": {"x": 1}},
                {"layer_id": "b", "patch": {"y": 2}},
            ],
        },
    )


def test_align_rejects_canvas_requires_panel_for_panel_ref() -> None:
    with pytest.raises(ValueError, match="canvas"):
        validate_positional_enqueue_args(
            "align",
            {"layer_id": "a", "anchor": "center_x", "reference": "canvas"},
        )
    with pytest.raises(ValueError, match="panel"):
        validate_positional_enqueue_args(
            "align",
            {"layer_id": "a", "anchor": "center_x", "reference": "panel"},
        )
    validate_positional_enqueue_args(
        "align",
        {"layer_id": "a", "anchor": "center_x", "reference": "panel", "panel_index": 0},
    )
    validate_positional_enqueue_args(
        "align",
        {"layer_id": "a", "anchor": "center_y", "reference": "layer_other"},
    )


def test_noop_for_unrelated_ops() -> None:
    validate_positional_enqueue_args("export_json", {})
    validate_positional_enqueue_args("device_move_delta", {"layer_id": "d", "dx": 0, "dy": 0})


def test_render_panel_preview_multiplier_optional() -> None:
    validate_positional_enqueue_args("render_panel_preview", {"panel_indexes": [0]})
    validate_positional_enqueue_args(
        "render_panel_preview",
        {"panel_indexes": [0, 1], "preview_multiplier": 1},
    )


def test_render_panel_preview_multiplier_invalid() -> None:
    with pytest.raises(ValueError, match="preview_multiplier"):
        validate_positional_enqueue_args(
            "render_panel_preview",
            {"panel_indexes": [0], "preview_multiplier": 3},
        )
    with pytest.raises(ValueError, match="preview_multiplier"):
        validate_positional_enqueue_args(
            "render_panel_preview",
            {"panel_indexes": [0], "preview_multiplier": "x"},
        )


def test_render_panel_preview_multiplier_valid_combination() -> None:
    """Render ops validate preview_multiplier then return (no further panel rules)."""
    validate_positional_enqueue_args(
        "render_panel_preview",
        {"panel_indexes": [0], "preview_multiplier": 2},
    )
