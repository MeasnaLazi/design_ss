#!/usr/bin/env python3
"""
Time one ``render_panel_preview`` + poll-until-changed cycle (same contract as
``python toolkit/scripts/designer.py pull-preview --panels …``).

Requires a running web_ui on DESIGNER_API_BASE (default localhost:4713) with an
open screenshot-designer tab listening for enqueue commands.

Usage (from publisher root)::

    python toolkit/scripts/benchmark_agent_preview.py --panels 0
    python toolkit/scripts/benchmark_agent_preview.py --panels 0 --preview-multiplier 1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from designer import export_slice as export_slice_mod
from designer.client import (
    designer_enqueue_command,
    ensure_publisher_dotenv_loaded,
    poll_agent_preview_until_changed,
    resolve_designer_base_url,
    try_designer_pull_agent_preview,
)
from designer.enqueue_validate import validate_positional_enqueue_args


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--panels",
        required=True,
        metavar="INDICES",
        help="Comma-separated 0-based contiguous panel indexes (e.g. 0 or 2,3)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="Wait budget after enqueue (default: 60)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=0.08,
        help="Poll interval for agent-preview GET (default: 0.08)",
    )
    parser.add_argument(
        "--preview-multiplier",
        type=int,
        choices=[1, 2],
        default=None,
        help="Optional preview_multiplier sent with render_panel_preview",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional path to write the PNG (otherwise discarded after timing)",
    )
    ns = parser.parse_args()
    ensure_publisher_dotenv_loaded()
    base = resolve_designer_base_url()

    parsed = export_slice_mod.parse_panel_indexes_arg(str(ns.panels))
    contiguous = export_slice_mod.sorted_contiguous_panel_indexes(parsed)

    render_args: dict[str, object] = {"panel_indexes": contiguous}
    if ns.preview_multiplier is not None:
        render_args["preview_multiplier"] = int(ns.preview_multiplier)
    validate_positional_enqueue_args("render_panel_preview", render_args)

    t0 = time.perf_counter()
    previous: bytes | None = try_designer_pull_agent_preview(base, timeout=min(10.0, float(ns.timeout)))
    t_after_prev = time.perf_counter()

    out = designer_enqueue_command(
        base,
        "render_panel_preview",
        render_args,
        timeout=min(120.0, max(float(ns.timeout), 30.0)),
    )
    if not out.get("ok"):
        print(json.dumps({"ok": False, "error": "enqueue_failed", "detail": out}, indent=2))
        sys.exit(1)
    t_after_enqueue = time.perf_counter()

    png = poll_agent_preview_until_changed(
        base,
        previous,
        timeout=float(ns.timeout),
        interval=float(ns.poll_interval),
    )
    t1 = time.perf_counter()

    if ns.out is not None:
        ns.out.write_bytes(png)

    elapsed_ms = int((t1 - t0) * 1000)
    report = {
        "ok": True,
        "elapsedTotalMs": elapsed_ms,
        "elapsedEnqueueMs": int((t_after_enqueue - t0) * 1000),
        "elapsedPollMs": int((t1 - t_after_enqueue) * 1000),
        "elapsedPrevProbeMs": int((t_after_prev - t0) * 1000),
        "pngBytes": len(png),
        "panelIndexes": contiguous,
        "previewMultiplier": render_args.get("preview_multiplier"),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
