"""Named validation profiles (panel + strip thresholds)."""

from __future__ import annotations

from dataclasses import replace

from designer.validate_options import StripValidateOptions, ValidateRulesOptions

PROFILE_NAMES = ("default", "appstore_hero", "play_feature")

_DEFAULT_PANEL = ValidateRulesOptions()
_DEFAULT_STRIP = StripValidateOptions()


class ValidationProfile:
    __slots__ = ("name", "panel", "strip")

    def __init__(self, name: str, panel: ValidateRulesOptions, strip: StripValidateOptions) -> None:
        self.name = name
        self.panel = panel
        self.strip = strip


_PROFILES: dict[str, ValidationProfile] = {
    "default": ValidationProfile("default", _DEFAULT_PANEL, _DEFAULT_STRIP),
    "appstore_hero": ValidationProfile(
        "appstore_hero",
        replace(
            _DEFAULT_PANEL,
            margin_tolerance_px=12.0,
            min_text_gap_px=16.0,
            require_device_center_x=True,
            device_center_tolerance_px=24.0,
            strict_ink_margins=True,
            strict_default_gray_background=True,
        ),
        replace(
            _DEFAULT_STRIP,
            cross_panel_device_scale_delta=0.06,
            cross_panel_top_margin_delta_px=16.0,
            strict_default_gray_background=True,
        ),
    ),
    "play_feature": ValidationProfile(
        "play_feature",
        replace(
            _DEFAULT_PANEL,
            min_device_height_ratio=0.45,
            max_device_height_ratio=0.92,
            max_device_pair_overlap=0.20,
            min_text_gap_px=10.0,
        ),
        replace(_DEFAULT_STRIP, cross_panel_device_scale_delta=0.10),
    ),
}


def get_profile(name: str) -> ValidationProfile:
    key = (name or "default").strip().lower()
    if key not in _PROFILES:
        allowed = ", ".join(PROFILE_NAMES)
        raise ValueError(f"profile must be one of: {allowed} (got {name!r})")
    return _PROFILES[key]


def list_profiles() -> tuple[str, ...]:
    return PROFILE_NAMES
