from __future__ import annotations

import pytest

from designer.panel_indexes import (
    dedupe_preserve_order,
    parse_panel_indexes_arg,
    sorted_contiguous_panel_indexes,
)


def test_parse_panel_indexes_arg() -> None:
    assert parse_panel_indexes_arg("0, 2") == [0, 2]
    assert parse_panel_indexes_arg("1") == [1]


def test_parse_panel_indexes_arg_rejects_empty() -> None:
    with pytest.raises(ValueError):
        parse_panel_indexes_arg("")
    with pytest.raises(ValueError):
        parse_panel_indexes_arg("1,,2")


def test_dedupe_preserve_order() -> None:
    assert dedupe_preserve_order([0, 2, 0, 1]) == [0, 2, 1]


def test_sorted_contiguous_ok() -> None:
    assert sorted_contiguous_panel_indexes([2, 4, 3]) == [2, 3, 4]
    assert sorted_contiguous_panel_indexes([1, 0]) == [0, 1]


def test_sorted_contiguous_rejects_gap() -> None:
    with pytest.raises(ValueError, match="adjacent"):
        sorted_contiguous_panel_indexes([0, 2])
