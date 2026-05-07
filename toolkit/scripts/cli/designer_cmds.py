"""Screenshot-designer HTTP CLI subcommands and handlers."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from designer import export_slice as export_slice_mod
from designer.client import (
    designer_enqueue_command as designer_enqueue_command_http,
    designer_execute as designer_execute_http,
    designer_pull_agent_export as designer_pull_agent_export_http,
    designer_pull_agent_preview as designer_pull_agent_preview_http,
    designer_session as designer_session_http,
    poll_agent_preview_until_changed,
    resolve_designer_base_url,
    screenshot_designer_handoff,
    try_designer_pull_agent_preview,
)
from designer.enqueue_validate import validate_positional_enqueue_args

from cli.io_utils import json_print, parse_args_json_payload, read_json_arg


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

    ds_ex = designer_sub.add_parser("execute", help="POST .../execute with JSON body {operation, args}")
    ds_ex.add_argument("--json", required=True, help="Path to JSON or - for stdin")
    ds_ex.add_argument("--timeout", type=float, default=120.0)
    ds_ex.set_defaults(handler=_cmd_designer_execute)

    ds_exo = designer_sub.add_parser(
        "execute-op",
        help="POST .../execute with --operation and --args-json (object or @path.json)",
    )
    ds_exo.add_argument("--operation", required=True)
    ds_exo.add_argument("--args-json", default="{}", help='JSON object, e.g. {} or @args.json')
    ds_exo.add_argument("--timeout", type=float, default=120.0)
    ds_exo.set_defaults(handler=_cmd_designer_execute_op)

    ds_enq = designer_sub.add_parser(
        "enqueue-op",
        help="POST .../enqueue-command (runs in open Web UI tab via SSE; same args as execute-op)",
    )
    ds_enq.add_argument("--operation", required=True)
    ds_enq.add_argument("--args-json", default="{}", help='JSON object, e.g. {} or @args.json')
    ds_enq.add_argument("--request-id", default=None, help="Optional id echoed in SSE payload")
    ds_enq.add_argument("--timeout", type=float, default=120.0)
    ds_enq.set_defaults(handler=_cmd_designer_enqueue_op)

    ds_pv = designer_sub.add_parser(
        "pull-preview",
        help="GET .../agent-preview (PNG last pushed); optional --panels enqueues one render_panel_preview for a contiguous strip segment then polls",
    )
    ds_pv.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write PNG to this path (plain GET or after --panels); omit for stdout when using --panels",
    )
    ds_pv.add_argument(
        "--panels",
        default=None,
        metavar="INDICES",
        help='Comma-separated 0-based columns forming one connected segment (e.g. 0,1 or 3,4 or 2,3,4) — one combined PNG; requires Web UI listening',
    )
    ds_pv.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="GET timeout, or wait budget after --panels enqueue",
    )
    ds_pv.add_argument(
        "--poll-interval",
        type=float,
        default=0.08,
        metavar="SEC",
        help="Sleep between GETs when waiting for new PNG after --panels (default: 0.08)",
    )
    ds_pv.add_argument(
        "--preview-multiplier",
        type=int,
        choices=[1, 2],
        default=None,
        help="With --panels: pass preview_multiplier to render_panel_preview (1=faster, 2=sharper); "
        "omit to use web_ui VITE_AGENT_PREVIEW_MULTIPLIER / default 2",
    )
    ds_pv.set_defaults(handler=_cmd_designer_pull_preview)

    ds_expt = designer_sub.add_parser(
        "pull-export",
        help="GET .../agent-export (layout summary JSON last pushed after export_json); optional --panels slices adjacent columns only",
    )
    ds_expt.add_argument(
        "--panels",
        default=None,
        metavar="INDICES",
        help='Comma-separated 0-based adjacent columns only (e.g. "0,1" or "2,3,4") — slicedExportVersion JSON (requires prior export_json in the browser)',
    )
    ds_expt.add_argument("--timeout", type=float, default=60.0)
    ds_expt.set_defaults(handler=_cmd_designer_pull_export)


def _cmd_designer_handoff(ns: argparse.Namespace, compact: bool) -> None:
    out = screenshot_designer_handoff(
        timeout=float(ns.timeout),
        skip_session=bool(ns.skip_session),
    )
    json_print(out, compact)


def _cmd_designer_session(ns: argparse.Namespace, compact: bool) -> None:
    out = designer_session_http(resolve_designer_base_url(), timeout=ns.timeout)
    json_print(out, compact)


def _cmd_designer_execute(ns: argparse.Namespace, compact: bool) -> None:
    body = read_json_arg(ns.json)
    op = body.get("operation")
    if not op:
        raise ValueError('JSON must include string "operation"')
    args = body.get("args") if "args" in body else {}
    if args is None:
        args = {}
    if not isinstance(args, dict):
        raise ValueError('"args" must be a JSON object')
    out = designer_execute_http(resolve_designer_base_url(), str(op), args, timeout=ns.timeout)
    json_print(out, compact)


def _cmd_designer_execute_op(ns: argparse.Namespace, compact: bool) -> None:
    args = parse_args_json_payload(ns.args_json)
    if not isinstance(args, dict):
        raise ValueError("--args-json must decode to a JSON object")
    out = designer_execute_http(resolve_designer_base_url(), ns.operation, args, timeout=ns.timeout)
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
    if ns.panels is None or not str(ns.panels).strip():
        data = designer_pull_agent_preview_http(base, timeout=ns.timeout)
        if ns.out is not None:
            ns.out.write_bytes(data)
            print(json.dumps({"ok": True, "bytes": len(data), "path": str(ns.out)}))
        else:
            sys.stdout.buffer.write(data)
        return

    parsed = export_slice_mod.parse_panel_indexes_arg(str(ns.panels))
    contiguous = export_slice_mod.sorted_contiguous_panel_indexes(parsed)
    previous: bytes | None = try_designer_pull_agent_preview(base, timeout=min(10.0, float(ns.timeout)))
    render_args: dict[str, object] = {"panel_indexes": contiguous}
    if ns.preview_multiplier is not None:
        render_args["preview_multiplier"] = int(ns.preview_multiplier)
    validate_positional_enqueue_args("render_panel_preview", render_args)
    out = designer_enqueue_command_http(
        base,
        "render_panel_preview",
        render_args,
        timeout=min(120.0, max(float(ns.timeout), 30.0)),
    )
    if not out.get("ok"):
        raise ValueError(f"enqueue render_panel_preview failed: {out!r}")
    png = poll_agent_preview_until_changed(
        base,
        previous,
        timeout=float(ns.timeout),
        interval=float(ns.poll_interval),
    )

    if ns.out is not None:
        ns.out.write_bytes(png)
        meta: dict[str, object] = {"ok": True, "bytes": len(png), "path": str(ns.out), "panelIndexes": contiguous}
        if ns.preview_multiplier is not None:
            meta["previewMultiplier"] = int(ns.preview_multiplier)
        if contiguous != parsed:
            meta["requestedOrder"] = parsed
            meta["note"] = "panel_indexes sorted to contiguous ascending range for the crop"
        print(json.dumps(meta))
    else:
        sys.stdout.buffer.write(png)
        if contiguous != parsed:
            note_obj = {
                "ok": True,
                "note": "panel_indexes sorted to contiguous ascending range for the crop",
                "requestedOrder": parsed,
                "panelIndexes": contiguous,
            }
            if compact:
                print(json.dumps(note_obj, separators=(",", ":")), file=sys.stderr)
            else:
                print(json.dumps(note_obj, indent=2), file=sys.stderr)


def _cmd_designer_pull_export(ns: argparse.Namespace, compact: bool) -> None:
    panels_arg = ns.panels if ns.panels is not None and str(ns.panels).strip() else None
    out = designer_pull_agent_export_http(
        resolve_designer_base_url(),
        timeout=ns.timeout,
        panel_index=str(panels_arg) if panels_arg is not None else None,
    )
    json_print(out, compact)
