from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from agent_toolkit import color as color_mod
from agent_toolkit import devices as devices_mod
from agent_toolkit import geometry as geometry_mod
from agent_toolkit import grid as grid_mod
from agent_toolkit import image_io
from agent_toolkit import presets as presets_mod
from agent_toolkit import quality as quality_mod
from agent_toolkit import safe as safe_mod
from agent_toolkit import text_metrics as text_metrics_mod
from agent_toolkit.models import SessionCheckInput


def _json_print(obj: object, compact: bool) -> None:
    if compact:
        print(json.dumps(obj, separators=(",", ":"), default=str))
    else:
        print(json.dumps(obj, indent=2, default=str))


def default_repo_root() -> Path:
    cwd = Path.cwd().resolve()
    for p in [cwd, *cwd.parents]:
        if (p / "web_ui" / "public" / "device-frames").is_dir():
            return p
    return cwd


def _read_json_arg(path: str) -> dict:
    raw = Path(path).read_text(encoding="utf-8") if path != "-" else sys.stdin.read()
    return json.loads(raw)


def main(argv: list[str] | None = None) -> None:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(prog="agent-toolkit", description="Layout + image helpers for screenshot agents.")
    parser.add_argument("--compact", action="store_true", help="One-line JSON output")
    sub = parser.add_subparsers(dest="cmd", required=True)

    layout = sub.add_parser("layout", help="Layout / parity helpers")
    layout_sub = layout.add_subparsers(dest="layout_cmd", required=True)

    lp = layout_sub.add_parser("list-presets", help="List all preset ids and dimensions")
    lp.set_defaults(handler=_cmd_list_presets)

    rp = layout_sub.add_parser("resolve-preset", help="Resolve canvas size or preset id")
    rp.add_argument("--canvas-size", default=None)
    rp.add_argument("--preset-id", default=None)
    rp.set_defaults(handler=_cmd_resolve_preset)

    sz = layout_sub.add_parser("safe-zone", help="Safe zone rect for a preset canvas")
    sz.add_argument("--canvas-size", default=None)
    sz.add_argument("--preset-id", default=None)
    sz.set_defaults(handler=_cmd_safe_zone)

    sg = layout_sub.add_parser("snap-to-grid", help="Snap a number to the design grid")
    sg.add_argument("--value", type=float, required=True)
    sg.add_argument("--mode", choices=["nearest", "floor", "ceil"], default="nearest")
    sg.set_defaults(handler=_cmd_snap)

    ag = layout_sub.add_parser("assert-grid", help="Exit 1 if x,y are not grid-aligned")
    ag.add_argument("--x", type=float, required=True)
    ag.add_argument("--y", type=float, required=True)
    ag.set_defaults(handler=_cmd_assert_grid)

    etw = layout_sub.add_parser("estimate-text-width", help="Mirror server estimateTextWidth")
    etw.add_argument("--content", required=True)
    etw.add_argument("--size", type=float, required=True)
    etw.set_defaults(handler=_cmd_etw)

    eth = layout_sub.add_parser("estimate-text-height", help="Mirror text layer height factor")
    eth.add_argument("--size", type=float, required=True)
    eth.set_defaults(handler=_cmd_eth)

    al = layout_sub.add_parser("align", help="Compute align position (mirror server align op)")
    al.add_argument("--layer-x", type=float, default=0)
    al.add_argument("--layer-y", type=float, default=0)
    al.add_argument("--layer-w", type=float, required=True)
    al.add_argument("--layer-h", type=float, required=True)
    al.add_argument(
        "--anchor",
        required=True,
        choices=["center_x", "center_y", "top", "bottom", "left", "right"],
    )
    al.add_argument("--ref-x", type=float, default=0)
    al.add_argument("--ref-y", type=float, default=0)
    al.add_argument("--ref-w", type=float, required=True)
    al.add_argument("--ref-h", type=float, required=True)
    al.set_defaults(handler=_cmd_align)

    pc = layout_sub.add_parser("predict-checks", help="Run qualityChecks-equivalent on JSON session")
    pc.add_argument("--json", required=True, help="Path to JSON or - for stdin")
    pc.set_defaults(handler=_cmd_predict)

    pb = layout_sub.add_parser("preview-budget", help="Render iteration budget helper")
    pb.add_argument("--count", type=int, required=True)
    pb.set_defaults(handler=_cmd_preview_budget)

    dp = layout_sub.add_parser("device-packs", help="List device packs from web_ui/public/device-frames/index.json")
    dp.add_argument("--type", default=None, help="Filter by device type e.g. iphone")
    dp.add_argument("--repo-root", type=Path, default=None)
    dp.set_defaults(handler=_cmd_device_packs)

    lf = layout_sub.add_parser("load-frame", help="Load frame.json for a pack id")
    lf.add_argument("--pack", required=True)
    lf.add_argument("--repo-root", type=Path, default=None)
    lf.set_defaults(handler=_cmd_load_frame)

    cr = layout_sub.add_parser("contrast", help="WCAG contrast ratio between two hex colors")
    cr.add_argument("--a", required=True)
    cr.add_argument("--b", required=True)
    cr.set_defaults(handler=_cmd_contrast)

    dhr = layout_sub.add_parser("device-height-ratio", help="Device height / canvas height")
    dhr.add_argument("--device-height", type=float, required=True)
    dhr.add_argument("--canvas-height", type=float, required=True)
    dhr.set_defaults(handler=_cmd_dhr)

    sds = layout_sub.add_parser("scaled-device-size", help="Scaled device dimensions")
    sds.add_argument("--view-w", type=float, required=True)
    sds.add_argument("--view-h", type=float, required=True)
    sds.add_argument("--scale", type=float, required=True)
    sds.set_defaults(handler=_cmd_sds)

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

    rs = img_sub.add_parser("resize-max-edge", help="Resize so longest edge <= N")
    rs.add_argument("--path", type=Path, required=True)
    rs.add_argument("--max-edge", type=int, required=True)
    rs.add_argument("--out", type=Path, required=True)
    rs.set_defaults(handler=_cmd_img_resize)

    cp = img_sub.add_parser("crop", help="Crop to pixel rect")
    cp.add_argument("--path", type=Path, required=True)
    cp.add_argument("--left", type=int, required=True)
    cp.add_argument("--top", type=int, required=True)
    cp.add_argument("--right", type=int, required=True)
    cp.add_argument("--bottom", type=int, required=True)
    cp.add_argument("--out", type=Path, required=True)
    cp.set_defaults(handler=_cmd_img_crop)

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

    ap = img_sub.add_parser("assert-png", help="Exit 0 if file starts with PNG magic")
    ap.add_argument("--path", type=Path, required=True)
    ap.set_defaults(handler=_cmd_assert_png)

    ns = parser.parse_args(argv)
    compact = bool(ns.compact)
    try:
        ns.handler(ns, compact)
    except ValidationError as e:
        print(json.dumps({"error": "validation_error", "detail": e.errors()}, indent=2))
        sys.exit(1)
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, indent=2))
        sys.exit(1)


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
    _json_print(rows, compact)


def _cmd_resolve_preset(ns: argparse.Namespace, compact: bool) -> None:
    p = presets_mod.resolve_preset(ns.canvas_size, ns.preset_id)
    _json_print(
        {
            "presetId": p.preset_id,
            "displaySlug": p.display_slug,
            "width": p.width,
            "height": p.height,
            "placeholder": p.placeholder,
        },
        compact,
    )


def _cmd_safe_zone(ns: argparse.Namespace, compact: bool) -> None:
    p = presets_mod.resolve_preset(ns.canvas_size, ns.preset_id)
    r = safe_mod.safe_zone_rect(p.width, p.height)
    _json_print({"canvas": {"width": p.width, "height": p.height}, "safeZone": r.__dict__}, compact)


def _cmd_snap(ns: argparse.Namespace, compact: bool) -> None:
    v = grid_mod.snap_to_grid(ns.value, ns.mode)
    _json_print({"in": ns.value, "out": v, "mode": ns.mode}, compact)


def _cmd_assert_grid(ns: argparse.Namespace, _compact: bool) -> None:
    grid_mod.assert_grid_coords(ns.x, ns.y)
    print(json.dumps({"ok": True, "x": ns.x, "y": ns.y}))


def _cmd_etw(ns: argparse.Namespace, compact: bool) -> None:
    w = text_metrics_mod.estimate_text_width(ns.content, ns.size)
    _json_print({"width": w, "content": ns.content, "fontSize": ns.size}, compact)


def _cmd_eth(ns: argparse.Namespace, compact: bool) -> None:
    h = text_metrics_mod.estimate_text_height(ns.size)
    _json_print({"height": h, "fontSize": ns.size}, compact)


def _cmd_align(ns: argparse.Namespace, compact: bool) -> None:
    x, y = geometry_mod.align_layer(
        ns.layer_x,
        ns.layer_y,
        ns.layer_w,
        ns.layer_h,
        ns.anchor,
        ns.ref_x,
        ns.ref_y,
        ns.ref_w,
        ns.ref_h,
    )
    _json_print({"x": x, "y": y, "anchor": ns.anchor}, compact)


def _cmd_predict(ns: argparse.Namespace, compact: bool) -> None:
    data = _read_json_arg(ns.json)
    session = SessionCheckInput.model_validate(data)
    result = quality_mod.predict_checks(session)
    out = result.to_dict()
    out["explain"] = quality_mod.explain_failure(result)
    _json_print(out, compact)


def _cmd_preview_budget(ns: argparse.Namespace, compact: bool) -> None:
    _json_print(quality_mod.preview_budget(ns.count), compact)


def _cmd_device_packs(ns: argparse.Namespace, compact: bool) -> None:
    root = ns.repo_root or default_repo_root()
    rows = devices_mod.list_device_packs(root, ns.type)
    _json_print(rows, compact)


def _cmd_load_frame(ns: argparse.Namespace, compact: bool) -> None:
    root = ns.repo_root or default_repo_root()
    data = devices_mod.load_frame_pack(root, ns.pack)
    _json_print({"pack": ns.pack, "frames": devices_mod.normalize_frames(data)}, compact)


def _cmd_contrast(ns: argparse.Namespace, compact: bool) -> None:
    r = color_mod.contrast_ratio(ns.a, ns.b)
    _json_print({"ratio": round(r, 4), "passesAA": color_mod.passes_wcag_aa(r)}, compact)


def _cmd_dhr(ns: argparse.Namespace, compact: bool) -> None:
    r = geometry_mod.device_height_ratio(ns.device_height, ns.canvas_height)
    ok = 0.55 <= r <= 0.75
    _json_print({"ratio": round(r, 6), "ok": ok}, compact)


def _cmd_sds(ns: argparse.Namespace, compact: bool) -> None:
    w, h = geometry_mod.scaled_device_size(ns.view_w, ns.view_h, ns.scale)
    _json_print({"width": w, "height": h}, compact)


def _cmd_img_info(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    info = image_io.image_info(img)
    _json_print(info.__dict__, compact)


def _cmd_img_b64(ns: argparse.Namespace, compact: bool) -> None:
    raw = Path(ns.input).read_text(encoding="utf-8") if ns.input != "-" else sys.stdin.read()
    img = image_io.load_image_from_base64(raw)
    if ns.out:
        image_io.save_png(img, ns.out)
    info = image_io.image_info(img)
    _json_print({"saved": str(ns.out) if ns.out else None, **info.__dict__}, compact)


def _cmd_img_match(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    m = image_io.match_preset_dimensions(img.width, img.height, ns.canvas_size, ns.preset_id)
    _json_print(m, compact)


def _cmd_img_resize(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    out = image_io.resize_max_edge(img, ns.max_edge)
    image_io.save_png(out, ns.out)
    _json_print({"out": str(ns.out), "width": out.width, "height": out.height}, compact)


def _cmd_img_crop(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    out = image_io.crop_rect(img, ns.left, ns.top, ns.right, ns.bottom)
    image_io.save_png(out, ns.out)
    _json_print({"out": str(ns.out), "width": out.width, "height": out.height}, compact)


def _cmd_region_hex(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    hx = image_io.region_hex(img, ns.left, ns.top, ns.right, ns.bottom)
    _json_print({"hex": hx}, compact)


def _cmd_dominant(ns: argparse.Namespace, compact: bool) -> None:
    img = image_io.load_image(ns.path)
    cols = image_io.dominant_colors_k(img, ns.k)
    _json_print({"colors": cols}, compact)


def _cmd_assert_png(ns: argparse.Namespace, _compact: bool) -> None:
    data = ns.path.read_bytes()
    ok = image_io.assert_png(data)
    print(json.dumps({"ok": ok, "path": str(ns.path)}))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
