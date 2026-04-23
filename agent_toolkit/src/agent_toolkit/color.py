from __future__ import annotations

import re

from agent_toolkit.constants import MIN_CONTRAST

_HEX = re.compile(r"^#[0-9a-f]{6}([0-9a-f]{2})?$", re.IGNORECASE)


def is_hex_color(value: str) -> bool:
    return bool(_HEX.match(value.strip()))


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    clean = hex_color.replace("#", "").strip()
    value = clean[:6] if len(clean) == 8 else clean
    n = int(value, 16)
    r = (n >> 16) & 255
    g = (n >> 8) & 255
    b = n & 255
    return float(r), float(g), float(b)


def relative_luminance(hex_color: str) -> float:
    """Mirror relativeLuminance in screenshot-designer-server.ts."""

    def to_linear(c: float) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = _hex_to_rgb(hex_color)
    return 0.2126 * to_linear(r) + 0.7152 * to_linear(g) + 0.0722 * to_linear(b)


def contrast_ratio(a: str, b: str) -> float:
    """Mirror contrastRatio in screenshot-designer-server.ts."""
    l1 = relative_luminance(a)
    l2 = relative_luminance(b)
    bright = max(l1, l2)
    dark = min(l1, l2)
    return (bright + 0.05) / (dark + 0.05)


def passes_wcag_aa(ratio: float, min_ratio: float = MIN_CONTRAST) -> bool:
    return ratio >= min_ratio


def text_contrast_vs_solid_background(text_hex: str, background_hex: str) -> float:
    if not (is_hex_color(text_hex) and is_hex_color(background_hex)):
        raise ValueError("text and background must be hex colors")
    return contrast_ratio(text_hex, background_hex)


def text_contrast_vs_background_conservative(
    text_hex: str,
    background_type: str,
    background_value: str | dict | None,
) -> float:
    """
    Match server qualityChecks: solid hex uses real color; otherwise use #111111 fallback
    (same as TS when background is not solid hex).
    """
    if background_type == "color" and isinstance(background_value, str) and is_hex_color(background_value):
        return text_contrast_vs_solid_background(text_hex, background_value)
    return text_contrast_vs_solid_background(text_hex, "#111111")


def min_contrast_across_gradient_stops(text_hex: str, stops: list[dict]) -> float:
    """Conservative: minimum contrast vs each stop (for agent hints only)."""
    ratios: list[float] = []
    for stop in stops:
        c = str(stop.get("color", ""))
        if is_hex_color(c):
            ratios.append(contrast_ratio(text_hex, c))
    return min(ratios) if ratios else contrast_ratio(text_hex, "#111111")
