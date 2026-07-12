"""Check tiers for validate-rules / validate-strip-rules.

Phase 2 of docs/implementation-plan.md: split checks into

- ``safety``  — objective defects (broken export, unreadable text, mis-crops,
  missing data). These gate the exit code by default.
- ``style``   — layout-taste heuristics that encode one archetype (centered
  upright device, text band on top, ...). Professional store screenshots
  often violate these on purpose (cropped device, text over shadowed frame),
  so they are reported as warnings, not hard failures, unless ``--tier all``.

Check logic is untouched; tiers are applied to the result afterwards.
"""

from __future__ import annotations

from typing import Any

# --- Panel checks (validate-rules) ---------------------------------------

SAFETY_CHECK_IDS: frozenset[str] = frozenset(
    {
        # Integrity / input contract
        "png_preset_match",
        "panel_data_required",
        "panel_data_version",
        "panel_resolve",
        # Objective readability / export defects
        "text_no_overlap",
        "text_safe_margins",
        "text_font_min_size",
        "text_ink_inside_safe_area",
        "layer_z_order_sane",
        # Strip-level integrity (validate-strip-rules)
        "strip_multi_panel",
        "strip_gap_consistent",
    }
)

STYLE_CHECK_IDS: frozenset[str] = frozenset(
    {
        # Layout-taste heuristics (single-archetype assumptions)
        "text_span_sensible",
        "text_single_line_bbox",
        "text_device_no_overlap",
        "text_device_vertical_gap",
        "device_height_band",
        "device_pairs_low_overlap",
        "device_horizontal_center",
        "device_safe_bottom",
        "text_vertical_rhythm",
        "text_hierarchy_sizes",
        "text_align_consistency",
        "text_preset_size_band",
        "background_not_default_gray",
        # Flags flat *light* edge bands as mis-crops — false-positives on
        # intentional light themes (e.g. Bio's #f5f1ee); real crop errors are
        # caught by png_preset_match + vision review.
        "panel_empty_margin_bands",
        "device_region_not_blank",
        # Strip-level style (validate-strip-rules)
        "cross_panel_device_scale",
        "cross_panel_text_scale",
        "cross_panel_margin_rhythm",
        "cross_panel_color_harmony",
        "strip_background_not_default_gray",
    }
)

VALID_TIERS = ("safety", "all")


def tier_for_check(check_id: str) -> str:
    """Unknown / future checks default to safety (fail closed)."""
    if check_id in STYLE_CHECK_IDS:
        return "style"
    return "safety"


def apply_tier(result: dict[str, Any], tier: str) -> dict[str, Any]:
    """Annotate ``checks[].tier`` and recompute the gate for the given tier.

    Mutates and returns ``result``:

    - every check gains ``"tier": "safety" | "style"``
    - ``result["tier"]`` records the gate scope
    - ``result["style_failures"]`` lists failed style check ids (always)
    - ``result["ok"]`` becomes the *gate* result: with ``tier="safety"``
      only safety checks count; with ``tier="all"`` every check counts
      (previous behavior).
    """
    if tier not in VALID_TIERS:
        raise ValueError(f"tier must be one of {VALID_TIERS}, got {tier!r}")

    checks = result.get("checks") or []
    safety_ok = True
    all_ok = True
    style_failures: list[str] = []
    for chk in checks:
        chk_tier = tier_for_check(str(chk.get("id", "")))
        chk["tier"] = chk_tier
        if not chk.get("ok"):
            all_ok = False
            if chk_tier == "safety":
                safety_ok = False
            else:
                style_failures.append(str(chk.get("id", "")))

    # `ok` from run_validate_* may fold in non-check conditions; preserve a
    # hard False from such sources even under the safety tier.
    prior_ok = bool(result.get("ok", all_ok))
    non_check_failure = (not prior_ok) and all_ok

    result["tier"] = tier
    result["style_failures"] = style_failures
    result["ok_all_checks"] = prior_ok
    if tier == "safety":
        result["ok"] = safety_ok and not non_check_failure
    else:
        result["ok"] = prior_ok
    return result
