from layout.quality import preview_budget


def test_preview_budget() -> None:
    assert preview_budget(0)["remaining"] == 4
    assert preview_budget(4)["would_exceed"] is True
    assert preview_budget(3)["remaining"] == 1
