from __future__ import annotations

import re

from core.constants import MIN_CONTRAST

_HEX = re.compile(r"^#[0-9a-f]{6}([0-9a-f]{2})?$", re.IGNORECASE)


def is_hex_color(value: str) -> bool:
    return bool(_HEX.match(value.strip()))


def normalize_hex(hex_color: str) -> str:
    """Return lowercase `#rrggbb` (6-digit only)."""
    clean = hex_color.strip()
    if not is_hex_color(clean):
        raise ValueError(f"invalid hex color: {hex_color!r}")
    digits = clean.replace("#", "").lower()[:6]
    return f"#{digits}"


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    ri = int(round(max(0.0, min(255.0, r))))
    gi = int(round(max(0.0, min(255.0, g))))
    bi = int(round(max(0.0, min(255.0, b))))
    return f"#{ri:02x}{gi:02x}{bi:02x}"


def mix_hex(a: str, b: str, ratio: float) -> str:
    """Blend two hex colors. ratio 0 → a, 1 → b."""
    ratio = max(0.0, min(1.0, ratio))
    ar, ag, ab = _hex_to_rgb(normalize_hex(a))
    br, bg, bb = _hex_to_rgb(normalize_hex(b))
    t = ratio
    return _rgb_to_hex(
        ar * (1 - t) + br * t,
        ag * (1 - t) + bg * t,
        ab * (1 - t) + bb * t,
    )


def mix_toward(hex_color: str, target: str, amount: float) -> str:
    """Mix hex toward black or white. amount 0 → unchanged, 1 → target."""
    target_hex = "#000000" if target == "black" else "#ffffff"
    return mix_hex(hex_color, target_hex, amount)


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
