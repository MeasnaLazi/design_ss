"""CLI entry: argparse wiring and dispatch."""

from __future__ import annotations

import argparse
import json
import sys

from pydantic import ValidationError

from designer.client import DesignerClientError, ensure_publisher_dotenv_loaded

from cli.designer_cmds import register_designer
from cli.io_utils import json_print
from cli.layout_cmds import register_layout


def main(argv: list[str] | None = None) -> None:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(
        prog="agent-toolkit",
        description="Layout, image, and screenshot-designer HTTP helpers for screenshot agents.",
    )
    parser.add_argument("--compact", action="store_true", help="One-line JSON output")
    sub = parser.add_subparsers(dest="cmd", required=True)

    register_layout(sub)
    register_designer(sub)

    ns = parser.parse_args(argv)
    compact = bool(ns.compact)
    ensure_publisher_dotenv_loaded()
    try:
        ns.handler(ns, compact)
    except ValidationError as e:
        print(json.dumps({"error": "validation_error", "detail": e.errors()}, indent=2))
        sys.exit(1)
    except DesignerClientError as e:
        json_print(e.to_dict(), compact)
        sys.exit(1)
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, indent=2))
        sys.exit(1)
