"""Tests for validate-strip-rules."""

from __future__ import annotations

import json
from pathlib import Path

from designer.validate_strip_rules import run_validate_strip_rules


def _write_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj), encoding="utf-8")


def test_strip_requires_two_panels(tmp_path: Path) -> None:
    jpath = tmp_path / "d.json"
    _write_json(
        jpath,
        {
            "version": 1,
            "gap": 24,
            "panels": [
                {"panel_index": 0, "panel_width": 1080, "panel_height": 1920, "layers": []},
            ],
        },
    )
    out = run_validate_strip_rules(jpath)
    assert out["ok"] is False
    assert any(c["id"] == "strip_multi_panel" for c in out["checks"])


def test_cross_panel_device_scale_pass(tmp_path: Path) -> None:
    ph = 1920
    jpath = tmp_path / "d.json"
    _write_json(
        jpath,
        {
            "version": 1,
            "gap": 24,
            "panels": [
                {
                    "panel_index": 0,
                    "panel_width": 1080,
                    "panel_height": ph,
                    "layers": [
                        {"layer_id": "d0", "kind": "device", "x": 540, "y": 900, "width": 700, "height": 1400},
                    ],
                },
                {
                    "panel_index": 1,
                    "panel_width": 1080,
                    "panel_height": ph,
                    "layers": [
                        {"layer_id": "d1", "kind": "device", "x": 540, "y": 900, "width": 700, "height": 1420},
                    ],
                },
            ],
        },
    )
    out = run_validate_strip_rules(jpath)
    scale = next(c for c in out["checks"] if c["id"] == "cross_panel_device_scale")
    assert scale["ok"] is True
