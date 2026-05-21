"""Validation option dataclasses (panel + strip)."""

from __future__ import annotations

from dataclasses import dataclass

from core.constants import MIN_CONTRAST


@dataclass(frozen=True)
class ValidateRulesOptions:
    margin_frac: float = 0.04
    margin_floor_px: int = 8
    margin_max_px: float = 48.0
    margin_tolerance_px: float = 16.0
    margin_text_bbox_shrink_px: float = 18.0
    margin_text_horizontal_extra_px: float = 16.0
    max_text_span: float = 0.94
    min_device_height_ratio: float = 0.50
    max_device_height_ratio: float = 0.90
    max_device_pair_overlap: float = 0.15
    min_contrast_normal: float = MIN_CONTRAST
    min_contrast_large: float = 3.0
    large_text_size_px: float = 24.0
    min_text_font_size_px: float = 48.0
    text_unwanted_wrap_height_to_size_ratio: float = 1.8
    min_text_gap_px: float = 12.0
    max_text_device_gap_frac: float = 0.10
    max_text_device_gap_px: float = 0.0
    require_device_center_x: bool = False
    device_center_tolerance_px: float = 24.0
    strict_ink_margins: bool = False
    strict_default_gray_background: bool = False
    enable_text_preset_size_band: bool = False
    min_theme_contrast: float = MIN_CONTRAST


@dataclass(frozen=True)
class StripValidateOptions:
    expected_gap: float | None = None
    gap_tolerance_px: float = 2.0
    cross_panel_device_scale_delta: float = 0.08
    cross_panel_text_size_delta_px: float = 4.0
    cross_panel_top_margin_delta_px: float = 24.0
    cross_panel_color_rgb_delta: float = 48.0
    strict_default_gray_background: bool = False
