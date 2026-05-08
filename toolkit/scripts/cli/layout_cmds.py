"""Layout / image CLI subcommands and handlers."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from core.paths import publisher_root
from image import color as color_mod
from image import image_io
from layout import devices as devices_mod
from layout import presets as presets_mod
from store import store_listing as store_listing_mod

from cli.io_utils import json_print


def register_layout(sub: Any) -> None:
    layout = sub.add_parser("layout", help="Layout / parity helpers")
    layout_sub = layout.add_subparsers(dest="layout_cmd", required=True)

    lp = layout_sub.add_parser("list-presets", help="List all preset ids and dimensions")
    lp.set_defaults(handler=_cmd_list_presets)

    dp = layout_sub.add_parser("device-packs", help="List device packs from web_ui/public/device-frames/index.json")
    dp.add_argument("--type", default=None, help="Filter by device type e.g. iphone")
    dp.add_argument("--repo-root", type=Path, default=None)
    dp.set_defaults(handler=_cmd_device_packs)

    lf = layout_sub.add_parser("load-frame", help="Load frame.json for a pack id")
    lf.add_argument("--pack", required=True)
    lf.add_argument("--repo-root", type=Path, default=None)
    lf.set_defaults(handler=_cmd_load_frame)

    sl = layout_sub.add_parser(
        "store-json",
        help="Load output/appstore.json or output/playstore.json (Step 0a platform → presetId)",
    )
    sl.add_argument(
        "--platform",
        required=True,
        choices=store_listing_mod.listing_platform_choices(),
        help="iphone|ipad → appstore.json; phone|tablet → playstore.json",
    )
    sl.add_argument("--repo-root", type=Path, default=None)
    sl.set_defaults(handler=_cmd_store_json)

    cr = layout_sub.add_parser("contrast", help="WCAG contrast ratio between two hex colors")
    cr.add_argument("--a", required=True)
    cr.add_argument("--b", required=True)
    cr.set_defaults(handler=_cmd_contrast)

    img = layout_sub.add_parser("image", help="Image load / inspect (Pillow)")
    img_sub = img.add_subparsers(dest="image_cmd", required=True)

    inf = img_sub.add_parser("info", help="Image metadata from file")
    inf.add_argument("--path", type=Path, required=True)
    inf.set_defaults(handler=_cmd_img_info)

    fb = img_sub.add_parser("from-base64", help="Decode PNG from base64; optional write --out")
    fb.add_argument("--input", required=True, help="File path or - for stdin")
    fb.add_argument("--out", type=Path, default=None)
    fb.set_defaults(handler=_cmd_img_b64)

    mp = img_sub.add_parser("match-preset", help="Compare image dimensions to preset")
    mp.add_argument("--path", type=Path, required=True)
    mp.add_argument("--canvas-size", default=None)
    mp.add_argument("--preset-id", default=None)
    mp.set_defaults(handler=_cmd_img_match)

    rh = img_sub.add_parser("region-hex", help="Mean color hex for rectangle")
    rh.add_argument("--path", type=Path, required=True)
    rh.add_argument("--left", type=int, required=True)
    rh.add_argument("--top", type=int, required=True)
    rh.add_argument("--right", type=int, required=True)
    rh.add_argument("--bottom", type=int, required=True)
    rh.set_defaults(handler=_cmd_region_hex)

    dom = img_sub.add_parser("dominant", help="Heuristic dominant colors (quantize)")
    dom.add_argument("--path", type=Path, required=True)
    dom.add_argument("--k", type=int, default=5)
    dom.set_defaults(handler=_cmd_dominant)


def _cmd_list_presets(_ns: argparse.Namespace, compact: bool) -> None:
    rows = [
        {
            "presetId": p.preset_id,
            "displaySlug": p.display_slug,
            "width": p.width,
            "height": p.height,
            "placeholder": p.placeholder,
        }
        for p in presets_mod.list_presets()
    ]
    json_print(rows, compact)


def _cmd_device_packs(ns: argparse.Namespace, compact: bool) -> None:
    root = ns.repo_root or publisher_root()
    rows = devices_mod.list_device_packs(root, ns.type)
    json_print(rows, compact)


def _cmd_load_frame(ns: argparse.Namespace, compact: bool) -> None:
    root = ns.repo_root or publisher_root()
    data = devices_mod.load_frame_pack(root, ns.pack)
    json_print({"pack": ns.pack, "frames": devices_mod.normalize_frames(data)}, compact)


def _cmd_store_json(ns: argparse.Namespace, compact: bool) -> None:
    root = ns.repo_root or publisher_root()
    out = store_listing_mod.load_store_listing(root, ns.platform)
    json_print(out, compact)


def _cmd_contrast(ns: argparse.Namespace, compact: bool) -> None:
    r = color_mod.contrast_ratio(ns.a, ns.b)
    json_print({"ratio": round(r, 4), "passesAA": color_mod.passes_wcag_aa(r)}, compact)


def _cmd_img_info(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    info = image_io.image_info(img)
    json_print(info.__dict__, compact)


def _cmd_img_b64(ns: argparse.Namespace, compact: bool) -> None:
    raw = Path(ns.input).read_text(encoding="utf-8") if ns.input != "-" else sys.stdin.read()
    img = image_io.load_image_from_base64(raw)
    if ns.out:
        image_io.save_png(img, ns.out)
    info = image_io.image_info(img)
    json_print({"saved": str(ns.out) if ns.out else None, **info.__dict__}, compact)


def _cmd_img_match(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    m = image_io.match_preset_dimensions(img.width, img.height, ns.canvas_size, ns.preset_id)
    json_print(m, compact)


def _cmd_region_hex(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    hx = image_io.region_hex(img, ns.left, ns.top, ns.right, ns.bottom)
    json_print({"hex": hx}, compact)


def _cmd_dominant(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    cols = image_io.dominant_colors_k(img, ns.k)
    json_print({"colors": cols}, compact)
