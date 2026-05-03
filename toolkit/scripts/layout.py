"""Layout / image CLI entry (parity with screenshot-designer-server)."""

from __future__ import annotations

import sys

from cli import main

if __name__ == "__main__":
    main(["layout", *sys.argv[1:]])
