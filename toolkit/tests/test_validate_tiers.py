"""Phase 2 acceptance: safety/style validation tiers (docs/implementation-plan.md).

Pure-unit tests need no heavy deps; the CLI-level test exercises
run_validate_rules with a synthetic "pro-style" panel (cropped, off-center
device — style violations only) and a "broken" panel (safety violations).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from designer.validate_tiers import (
    SAFETY_CHECK_IDS,
    STYLE_CHECK_IDS,
    apply_tier,
    tier_for_check,
)

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def test_tier_map_covers_every_check_id_in_source() -> None:
    src = (SCRIPTS / "designer/validate_rules.py").read_text()
    src += (SCRIPTS / "designer/validate_strip_rules.py").read_text()
    ids = set(re.findall(r'"id":\s*"([a-z_]+)"', src))
    assert ids, "no check ids found — regex or layout changed?"
    missing = ids - (SAFETY_CHECK_IDS | STYLE_CHECK_IDS)
    assert not missing, f"unclassified check ids: {missing}"


def test_tier_sets_disjoint() -> None:
    assert not (SAFETY_CHECK_IDS & STYLE_CHECK_IDS)


def test_unknown_check_fails_closed_to_safety() -> None:
    assert tier_for_check("some_future_check") == "safety"


def _result(checks: list[tuple[str, bool]], ok: bool | None = None) -> dict:
    built = [{"id": cid, "ok": cok, "detail": {}} for cid, cok in checks]
    computed_ok = all(c["ok"] for c in built) if ok is None else ok
    return {"ok": computed_ok, "phase": "rules", "checks": built}


def test_style_only_failures_pass_safety_gate() -> None:
    res = _result(
        [
            ("text_safe_margins", True),
            ("device_height_band", False),
            ("device_horizontal_center", False),
        ]
    )
    out = apply_tier(res, "safety")
    assert out["ok"] is True
    assert out["style_failures"] == ["device_height_band", "device_horizontal_center"]
    assert out["ok_all_checks"] is False


def test_style_failures_fail_all_gate() -> None:
    res = _result([("device_height_band", False)])
    assert apply_tier(res, "all")["ok"] is False


def test_safety_failure_fails_both_gates() -> None:
    res = _result([("text_font_min_size", False), ("device_height_band", False)])
    assert apply_tier(res, "safety")["ok"] is False


def test_non_check_failure_preserved_under_safety() -> None:
    res = _result([("text_safe_margins", True)], ok=False)
    assert apply_tier(res, "safety")["ok"] is False


# --- integration: real checks on synthetic panels -------------------------


@pytest.fixture()
def pro_style_panel(tmp_path: Path) -> tuple[Path, Path]:
    """Safety-clean panel that intentionally violates style heuristics
    (device oversized + cropped + off-center; large text/device gap)."""
    from PIL import Image, ImageDraw

    w, h = 1290, 2796
    img = Image.new("RGB", (w, h), (245, 241, 238))
    d = ImageDraw.Draw(img)
    d.rectangle([110, 190, 900, 470], fill=(20, 20, 18))
    d.rectangle([112, 650, 700, 730], fill=(90, 85, 78))
    d.rectangle([100, 880, w, h], fill=(30, 30, 32))
    png = tmp_path / "pro.png"
    img.save(png)
    data = {
        "version": 1,
        "gap": 40,
        "workspace_width": w,
        "workspace_height": h,
        "background": {"type": "color", "value": "#f5f1ee"},
        "panels": [
            {
                "panel_index": 0,
                "panel_width": w,
                "panel_height": h,
                "panel_x": 0,
                "panel_y": 0,
                "layers": [
                    {
                        "layer_id": "t1", "kind": "text", "z_index": 2,
                        "content": "Your Life as a Book", "size": 128,
                        "color": "#0c0c0a", "align": "left", "weight": "700",
                        "x": 110, "y": 190, "width": 790, "height": 280,
                    },
                    {
                        "layer_id": "t2", "kind": "text", "z_index": 2,
                        "content": "Flip through your memories", "size": 58,
                        "color": "#57534e", "align": "left", "weight": "400",
                        "x": 112, "y": 650, "width": 588, "height": 80,
                    },
                    {
                        "layer_id": "d1", "kind": "device", "z_index": 1,
                        "x": 740, "y": 1980, "width": 1280, "height": 2200,
                        "angle": 0, "frame": "isometric-right",
                        "pack_id": "iphone_12_pro",
                    },
                ],
            }
        ],
    }
    pj = tmp_path / "pro.json"
    pj.write_text(json.dumps(data))
    return png, pj


def test_pro_style_panel_gates(pro_style_panel: tuple[Path, Path]) -> None:
    from designer.validate_profiles import get_profile
    from designer.validate_rules import run_validate_rules

    png, pj = pro_style_panel
    out = run_validate_rules(
        png, pj, 0, None, "appstore_iphone_portrait",
        opt=get_profile("appstore_hero").panel,
    )
    safety_out = apply_tier(json.loads(json.dumps(out)), "safety")
    all_out = apply_tier(json.loads(json.dumps(out)), "all")
    assert safety_out["ok"] is True, [
        c["id"] for c in safety_out["checks"] if not c["ok"] and c["tier"] == "safety"
    ]
    assert safety_out["style_failures"], "expected style violations by construction"
    assert all_out["ok"] is False
