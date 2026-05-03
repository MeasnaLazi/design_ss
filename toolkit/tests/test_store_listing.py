import json

import pytest

from store.store_listing import (
    listing_platform_choices,
    load_store_listing,
    normalize_platform,
    store_listing_preset_id,
    store_listing_relative_path,
)


def test_listing_platform_choices_sorted() -> None:
    assert listing_platform_choices() == ("ipad", "iphone", "phone", "tablet")


def test_paths_and_preset_match_doc_table() -> None:
    assert store_listing_relative_path("iphone") == "output/appstore.json"
    assert store_listing_preset_id("iphone") == "appstore_iphone_portrait"
    assert store_listing_relative_path("ipad") == "output/appstore.json"
    assert store_listing_preset_id("tablet") == "play_tablet_portrait"
    assert store_listing_relative_path("Phone") == "output/playstore.json"


def test_normalize_platform_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="platform must be one of"):
        normalize_platform("watch")


def test_load_store_listing_ok(tmp_path) -> None:
    (tmp_path / "output").mkdir()
    payload = {"name": "Demo", "theme": {}, "screenshots": []}
    (tmp_path / "output" / "appstore.json").write_text(json.dumps(payload), encoding="utf-8")
    out = load_store_listing(tmp_path, "ipad")
    assert out["ok"] is True
    assert out["platform"] == "ipad"
    assert out["canvasSize"] == "ipad"
    assert out["presetId"] == "appstore_ipad_portrait"
    assert out["relativePath"] == "output/appstore.json"
    assert out["store"] == payload


def test_load_store_listing_missing_file(tmp_path) -> None:
    with pytest.raises(ValueError, match="store listing file not found"):
        load_store_listing(tmp_path, "iphone")


def test_load_store_listing_invalid_json(tmp_path) -> None:
    (tmp_path / "output").mkdir()
    (tmp_path / "output" / "playstore.json").write_text("not json", encoding="utf-8")
    with pytest.raises(json.JSONDecodeError):
        load_store_listing(tmp_path, "phone")


def test_load_store_listing_not_object(tmp_path) -> None:
    (tmp_path / "output").mkdir()
    (tmp_path / "output" / "appstore.json").write_text("[1]", encoding="utf-8")
    with pytest.raises(ValueError, match="top-level object"):
        load_store_listing(tmp_path, "iphone")
