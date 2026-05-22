"""Screenshot-designer HTTP CLI subcommands and handlers."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from designer.client import (
    designer_enqueue_command as designer_enqueue_command_http,
    designer_pull_agent_preview as designer_pull_agent_preview_http,
    designer_session as designer_session_http,
    poll_agent_preview_data_until_changed,
    resolve_designer_base_url,
    screenshot_designer_handoff,
)
from designer.enqueue_validate import validate_positional_enqueue_args
from designer.validate_options import ValidateRulesOptions
from designer.validate_profiles import get_profile, list_profiles
from designer.validate_rules import merge_cli_options, run_validate_rules
from designer.validate_strip_rules import run_validate_strip_rules
from cli.io_utils import json_print, parse_args_json_payload


def register_designer(sub: Any) -> None:
    designer = sub.add_parser(
        "designer",
        help="Call screenshot-designer HTTP API (loopback URLs only; requires running web_ui)",
    )
    designer_sub = designer.add_subparsers(dest="designer_cmd", required=True)

    ds_ho = designer_sub.add_parser(
        "handoff",
        help="Emit web_ui + designer_api handoff JSON (optional GET session probe)",
    )
    ds_ho.add_argument("--timeout", type=float, default=15.0)
    ds_ho.add_argument(
        "--skip-session",
        action="store_true",
        help="Only resolve URLs; web_ui_status will be unverified (no GET /session)",
    )
    ds_ho.set_defaults(handler=_cmd_designer_handoff)

    ds_sess = designer_sub.add_parser(
        "session",
        help="GET .../session (no query params; server resolves preset from browser cookies / referer / default)",
    )
    ds_sess.add_argument("--timeout", type=float, default=60.0)
    ds_sess.set_defaults(handler=_cmd_designer_session)

    ds_enq = designer_sub.add_parser(
        "enqueue-op",
        help="POST .../enqueue-command (runs in open Web UI tab via SSE)",
    )
    ds_enq.add_argument("--operation", required=True)
    ds_enq.add_argument("--args-json", default="{}", help='JSON object, e.g. {} or @args.json')
    ds_enq.add_argument("--request-id", default=None, help="Optional id echoed in SSE payload")
    ds_enq.add_argument("--timeout", type=float, default=120.0)
    ds_enq.set_defaults(handler=_cmd_designer_enqueue_op)

    ds_pv = designer_sub.add_parser(
        "pull-preview",
        help="GET .../agent-preview (PNG last pushed from the browser)",
    )
    ds_pv.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write PNG to this path; omit to write raw PNG bytes to stdout",
    )
    ds_pv.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="GET timeout in seconds",
    )
    ds_pv.set_defaults(handler=_cmd_designer_pull_preview)

    ds_pvd = designer_sub.add_parser(
        "pull-preview-data",
        help="GET .../agent-preview-data (JSON last pushed from the browser)",
    )
    ds_pvd.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write JSON to this path; omit to print JSON to stdout",
    )
    ds_pvd.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="Poll timeout in seconds",
    )
    ds_pvd.add_argument(
        "--previous-revision",
        default=None,
        help="Wait until revision differs from this value (omit to accept first snapshot)",
    )
    ds_pvd.set_defaults(handler=_cmd_designer_pull_preview_data)

    ds_val = designer_sub.add_parser(
        "validate-rules",
        help="Validate pulled preview PNG + optional panel JSON (non-vision rules); exit 1 if any check fails",
    )
    ds_val.add_argument("--png", type=Path, required=True, help="Path to preview PNG from pull-preview")
    ds_val.add_argument(
        "--panel-data",
        type=Path,
        default=None,
        help="Path to JSON from pull-preview-data (version 1 agent panel snapshot)",
    )
    ds_val.add_argument(
        "--panel-index",
        type=int,
        default=None,
        help="0-based panel_index when panel JSON contains multiple panels",
    )
    ds_val.add_argument("--preset-id", default=None, help="Preset id for png dimension match (see layout list-presets)")
    ds_val.add_argument(
        "--canvas-size",
        default=None,
        choices=("iphone", "ipad", "phone", "tablet"),
        help="Canvas size slug for png dimension match when preset-id omitted",
    )
    ds_val.add_argument("--margin-frac", type=float, default=None, help="Override safe margin fraction of min(panel w,h)")
    ds_val.add_argument("--margin-floor-px", type=int, default=None, help="Override minimum margin in px")
    ds_val.add_argument(
        "--margin-max-px",
        type=float,
        default=None,
        help="Cap derived margin in px before tolerance (0 = no cap; default 48)",
    )
    ds_val.add_argument(
        "--margin-tolerance-px",
        type=float,
        default=None,
        help="Slack subtracted from capped margin for Fabric bbox / rounding (default 16)",
    )
    ds_val.add_argument(
        "--margin-text-bbox-shrink-px",
        type=float,
        default=None,
        help="Baseline per-axis shrink for margin rule (default 18; 0 with no extra may disable shrink)",
    )
    ds_val.add_argument(
        "--margin-text-horizontal-extra-px",
        type=float,
        default=None,
        help="Extra left/right shrink only for margin rule (default 16; 0 disables; wide shallow text)",
    )
    ds_val.add_argument("--max-text-span", type=float, default=None, help="Override max text width / panel width")
    ds_val.add_argument("--max-device-pair-overlap", type=float, default=None, help="Override max intersect/min(area) for device pairs")
    ds_val.add_argument(
        "--min-text-font-size-px",
        type=float,
        default=None,
        help="Reject primary text layers with size below this px (default 48; captions excluded; 0 disables)",
    )
    ds_val.add_argument(
        "--text-unwanted-wrap-height-to-size-ratio",
        type=float,
        default=None,
        help="Without explicit newlines, flag layers where height/size >= this (default 1.8; 0 disables)",
    )
    ds_val.add_argument(
        "--profile",
        default="default",
        choices=list_profiles(),
        help="Validation profile: default, appstore_hero, play_feature",
    )
    ds_val.add_argument("--min-device-height-ratio", type=float, default=None)
    ds_val.add_argument("--max-device-height-ratio", type=float, default=None)
    ds_val.add_argument("--min-text-gap-px", type=float, default=None, help="Min vertical gap between primary text layers")
    ds_val.add_argument(
        "--emit-fixes",
        action="store_true",
        help="Include compact suggested_fix list in JSON output",
    )
    ds_val.set_defaults(handler=_cmd_designer_validate_rules)

    ds_strip = designer_sub.add_parser(
        "validate-strip-rules",
        help="Validate multi-panel strip snapshot JSON (and optional per-panel PNG dir)",
    )
    ds_strip.add_argument(
        "--panel-data",
        type=Path,
        required=True,
        help="Full strip JSON from pull-preview-data (all panel_indexes)",
    )
    ds_strip.add_argument(
        "--png-dir",
        type=Path,
        default=None,
        help="Directory with panel0.png / panel{N}.png for color harmony checks",
    )
    ds_strip.add_argument(
        "--profile",
        default="default",
        choices=list_profiles(),
        help="Validation profile for strip thresholds",
    )
    ds_strip.add_argument(
        "--expected-gap",
        type=float,
        default=None,
        help="Override expected strip gap px from profile",
    )
    ds_strip.add_argument("--emit-fixes", action="store_true")
    ds_strip.set_defaults(handler=_cmd_designer_validate_strip_rules)


def _cmd_designer_handoff(ns: argparse.Namespace, compact: bool) -> None:
    out = screenshot_designer_handoff(
        timeout=float(ns.timeout),
        skip_session=bool(ns.skip_session),
    )
    json_print(out, compact)


def _cmd_designer_session(ns: argparse.Namespace, compact: bool) -> None:
    out = designer_session_http(resolve_designer_base_url(), timeout=ns.timeout)
    json_print(out, compact)


def _cmd_designer_enqueue_op(ns: argparse.Namespace, compact: bool) -> None:
    args = parse_args_json_payload(ns.args_json)
    if not isinstance(args, dict):
        raise ValueError("--args-json must decode to a JSON object")
    validate_positional_enqueue_args(ns.operation, args)
    out = designer_enqueue_command_http(
        resolve_designer_base_url(),
        ns.operation,
        args,
        request_id=ns.request_id,
        timeout=ns.timeout,
    )
    json_print(out, compact)


def _cmd_designer_pull_preview(ns: argparse.Namespace, compact: bool) -> None:
    base = resolve_designer_base_url()
    data = designer_pull_agent_preview_http(base, timeout=ns.timeout)
    if ns.out is not None:
        ns.out.write_bytes(data)
        print(json.dumps({"ok": True, "bytes": len(data), "path": str(ns.out)}))
        return
    sys.stdout.buffer.write(data)


def _cmd_designer_validate_rules(ns: argparse.Namespace, compact: bool) -> None:
    profile = get_profile(ns.profile)
    opt = merge_cli_options(profile.panel, ns)
    out = run_validate_rules(
        ns.png,
        ns.panel_data,
        ns.panel_index,
        ns.canvas_size,
        ns.preset_id,
        opt=opt,
        emit_fixes_only=bool(ns.emit_fixes),
    )
    json_print(out, compact)
    if not out.get("ok"):
        sys.exit(1)


def _cmd_designer_validate_strip_rules(ns: argparse.Namespace, compact: bool) -> None:
    profile = get_profile(ns.profile)
    strip_opt = profile.strip
    if ns.expected_gap is not None:
        from dataclasses import replace

        strip_opt = replace(strip_opt, expected_gap=float(ns.expected_gap))
    out = run_validate_strip_rules(
        ns.panel_data,
        opt=strip_opt,
        png_dir=ns.png_dir,
        emit_fixes_only=bool(ns.emit_fixes),
    )
    json_print(out, compact)
    if not out.get("ok"):
        sys.exit(1)


def _cmd_designer_pull_preview_data(ns: argparse.Namespace, compact: bool) -> None:
    base = resolve_designer_base_url()
    data = poll_agent_preview_data_until_changed(
        base,
        ns.previous_revision,
        timeout=ns.timeout,
    )
    payload = json.dumps(data, indent=2, sort_keys=True) + "\n"
    encoded = payload.encode("utf-8")
    if ns.out is not None:
        ns.out.write_text(payload, encoding="utf-8")
        print(
            json.dumps(
                {
                    "ok": True,
                    "bytes": len(encoded),
                    "path": str(ns.out),
                    "revision": data.get("revision"),
                }
            )
        )
        return
    json_print(data, compact)
