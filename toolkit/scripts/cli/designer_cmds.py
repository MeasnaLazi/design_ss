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
