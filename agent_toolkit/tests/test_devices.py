from pathlib import Path

import pytest

from agent_toolkit import devices as devices_mod


def test_list_device_packs(repo_root: Path) -> None:
    packs = devices_mod.list_device_packs(repo_root)
    assert len(packs) >= 1
    assert packs[0].get("name")


def test_load_frame_pack(repo_root: Path) -> None:
    data = devices_mod.load_frame_pack(repo_root, "iphone_12_pro")
    assert "frames" in data
    norm = devices_mod.normalize_frames(data)
    assert any(f.get("name") == "front" for f in norm)


def test_pack_id_from_path() -> None:
    assert devices_mod.pack_id_from_path("/device-frames/iphone_12_pro/frame/front.svg") == "iphone_12_pro"
