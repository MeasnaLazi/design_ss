from __future__ import annotations

import base64
import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from agent_toolkit.presets import resolve_preset

_DATA_URL = re.compile(r"^data:image/[^;]+;base64,(.+)$", re.IGNORECASE)


@dataclass
class ImageInfo:
    width: int
    height: int
    mode: str
    has_alpha: bool
    format: str | None


def assert_png(data: bytes) -> bool:
    return len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n"


def load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def load_image_from_base64(b64: str) -> Image.Image:
    s = b64.strip()
    m = _DATA_URL.match(s)
    if m:
        s = m.group(1)
    raw = base64.b64decode(s, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def image_info(img: Image.Image) -> ImageInfo:
    return ImageInfo(
        width=img.width,
        height=img.height,
        mode=img.mode,
        has_alpha=img.mode in ("RGBA", "LA") or "transparency" in img.info,
        format=img.format,
    )


def match_preset_dimensions(
    width: int,
    height: int,
    canvas_size: str | None = None,
    preset_id: str | None = None,
) -> dict[str, Any]:
    p = resolve_preset(canvas_size, preset_id)
    matches = width == p.width and height == p.height
    return {
        "matches": matches,
        "expected": {"width": p.width, "height": p.height, "presetId": p.preset_id},
        "actual": {"width": width, "height": height},
    }


def resize_max_edge(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return img.copy()
    scale = max_edge / longest
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def crop_rect(img: Image.Image, left: int, top: int, right: int, bottom: int) -> Image.Image:
    return img.crop((left, top, right, bottom))


def region_mean_rgb(img: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[float, float, float]:
    crop = img.crop((left, top, right, bottom))
    if crop.width == 0 or crop.height == 0:
        return 0.0, 0.0, 0.0
    tiny = crop.resize((1, 1), Image.Resampling.LANCZOS)
    px = tiny.getpixel((0, 0))
    if isinstance(px, int):
        return float(px), float(px), float(px)
    r, g, b = px[0], px[1], px[2]
    return float(r), float(g), float(b)


def region_hex(img: Image.Image, left: int, top: int, right: int, bottom: int) -> str:
    r, g, b = region_mean_rgb(img, left, top, right, bottom)
    return f"#{int(round(r)):02x}{int(round(g)):02x}{int(round(b)):02x}"


def dominant_colors_k(img: Image.Image, k: int = 5) -> list[str]:
    """Heuristic palette via Pillow quantize (not a proof of contrast)."""
    n_colors = max(2, min(k, 32))
    small = img.convert("RGB").resize((120, 120), Image.Resampling.LANCZOS)
    q = small.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette() or []
    pairs = q.getcolors(120 * 120) or []
    pairs.sort(key=lambda x: -x[0])
    out: list[str] = []
    for _, idx in pairs[:k]:
        if idx * 3 + 2 < len(pal):
            r, g, b = pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2]
            out.append(f"#{r:02x}{g:02x}{b:02x}")
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG")


def save_jpeg(img: Image.Image, path: Path, quality: int = 90) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(path, format="JPEG", quality=quality)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
