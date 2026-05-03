"""Screenshot-designer HTTP client CLI entry."""

from __future__ import annotations

import sys

from cli import main

if __name__ == "__main__":
    main(["designer", *sys.argv[1:]])
