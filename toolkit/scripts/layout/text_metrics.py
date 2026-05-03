from __future__ import annotations


def estimate_text_width(content: str, font_size: float) -> int:
    """Mirror estimateTextWidth in screenshot-designer-server.ts."""
    return max(int(font_size), round(len(content) * font_size * 0.56))


def estimate_text_height(font_size: float) -> int:
    """Text layer height uses round(size * 1.3) in TS add_text."""
    return round(float(font_size) * 1.3)


def min_headline_size_ok(size: float, min_px: int = 60) -> bool:
    return size >= min_px
