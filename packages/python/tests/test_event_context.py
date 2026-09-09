"""User, tags, and breadcrumb sanitizing, plus their `Client` wiring."""

from __future__ import annotations

from conftest import Collected

from dolshoe.normalize import (
    MAX_BREADCRUMBS,
    MAX_TAG_VALUE_LENGTH,
    MAX_TAGS,
    sanitize_breadcrumbs,
    sanitize_tags,
    sanitize_user,
)

# -- sanitize_user ----------------------------------------------------------


def test_sanitize_user_keeps_the_three_known_fields() -> None:
    assert sanitize_user({"id": "u1", "email": "a@example.com", "username": "ash"}) == {
        "id": "u1",
        "email": "a@example.com",
        "username": "ash",
    }


def test_sanitize_user_drops_blank_fields() -> None:
    assert sanitize_user({"id": "u1", "email": "  ", "username": ""}) == {"id": "u1"}


def test_sanitize_user_of_none_is_none() -> None:
    assert sanitize_user(None) is None


def test_sanitize_user_of_all_blank_fields_is_none() -> None:
    assert sanitize_user({"id": "", "email": None}) is None


def test_sanitize_user_truncates_a_long_field() -> None:
    result = sanitize_user({"id": "x" * 500})
    assert result is not None
    assert len(result["id"]) == 200


# -- sanitize_tags ------------------------------------------------------------


def test_sanitize_tags_keeps_string_pairs() -> None:
    assert sanitize_tags({"tier": "enterprise", "region": "apac"}) == {
        "tier": "enterprise",
        "region": "apac",
    }


def test_sanitize_tags_stringifies_a_non_string_value() -> None:
    assert sanitize_tags({"attempt": 3}) == {"attempt": "3"}


def test_sanitize_tags_drops_a_blank_key_or_value() -> None:
    assert sanitize_tags({"": "x", "ok": "", "kept": "y"}) == {"kept": "y"}


def test_sanitize_tags_caps_the_entry_count() -> None:
    many = {f"k{i}": f"v{i}" for i in range(MAX_TAGS + 10)}
    result = sanitize_tags(many)
    assert result is not None
    assert len(result) == MAX_TAGS


def test_sanitize_tags_drops_an_overlong_key_but_truncates_an_overlong_value() -> None:
    # Matches `sanitize_attributes`'s own convention: an overlong key is
    # dropped rather than silently renamed by truncation, but a value is
    # truncated in place.
    assert sanitize_tags({"k" * 500: "v"}) is None
    result = sanitize_tags({"ok": "v" * 500})
    assert result is not None
    assert len(result["ok"]) == MAX_TAG_VALUE_LENGTH


def test_sanitize_tags_of_none_is_none() -> None:
    assert sanitize_tags(None) is None


def test_sanitize_tags_of_empty_is_none() -> None:
    assert sanitize_tags({}) is None


# -- sanitize_breadcrumbs -----------------------------------------------------


def test_sanitize_breadcrumbs_keeps_the_known_fields() -> None:
    result = sanitize_breadcrumbs(
        [
            {
                "timestamp": "2026-01-01T00:00:00.000Z",
                "message": "clicked",
                "category": "ui",
                "level": "info",
            }
        ]
    )
    assert result == [
        {
            "timestamp": "2026-01-01T00:00:00.000Z",
            "message": "clicked",
            "category": "ui",
            "level": "info",
        }
    ]


def test_sanitize_breadcrumbs_drops_an_unrecognized_level() -> None:
    result = sanitize_breadcrumbs([{"timestamp": "2026-01-01T00:00:00.000Z", "level": "critical"}])
    assert result == [{"timestamp": "2026-01-01T00:00:00.000Z"}]


def test_sanitize_breadcrumbs_keeps_only_the_newest_when_over_the_cap() -> None:
    trail = [{"timestamp": str(i), "message": f"event {i}"} for i in range(MAX_BREADCRUMBS + 5)]
    result = sanitize_breadcrumbs(trail)
    assert result is not None
    assert len(result) == MAX_BREADCRUMBS
    # Oldest-first, newest cap: the first 5 (the oldest) are the ones dropped.
    assert result[0]["message"] == "event 5"
    assert result[-1]["message"] == f"event {MAX_BREADCRUMBS + 4}"


def test_sanitize_breadcrumbs_bounds_data_tighter_than_attributes() -> None:
    result = sanitize_breadcrumbs([{"timestamp": "t", "data": {f"k{i}": "v" for i in range(50)}}])
    assert result is not None
    assert len(result[0].get("data", {})) <= 20


def test_sanitize_breadcrumbs_drops_data_over_the_byte_budget() -> None:
    # One field alone cannot exceed the budget — `sanitize_json_value` already
    # truncates a single string leaf well below it — so this needs many large
    # fields (bounded to 20 items, each up to 4096 chars) to actually clear it.
    huge = {f"k{i}": "x" * 4_000 for i in range(20)}
    result = sanitize_breadcrumbs([{"timestamp": "t", "data": huge}])
    assert result is not None
    assert "data" not in result[0]


def test_sanitize_breadcrumbs_of_none_is_none() -> None:
    assert sanitize_breadcrumbs(None) is None


# -- Client wiring -------------------------------------------------------------


def test_set_user_reaches_a_captured_report(collected: Collected) -> None:
    collected.client.set_user({"id": "u1"})
    collected.client.capture_exception(ValueError("boom"))
    collected.flush()

    assert collected.reports[0]["user"] == {"id": "u1"}


def test_set_tag_and_set_tags_merge_on_the_active_scope(collected: Collected) -> None:
    collected.client.set_tag("tier", "enterprise")
    collected.client.set_tags({"region": "apac"})
    collected.client.capture_exception(ValueError("boom"))
    collected.flush()

    assert collected.reports[0]["tags"] == {"tier": "enterprise", "region": "apac"}


def test_a_per_call_tag_wins_over_the_ambient_one(collected: Collected) -> None:
    collected.client.set_tag("tier", "free")
    collected.client.capture_exception(ValueError("boom"), tags={"tier": "enterprise"})
    collected.flush()

    assert collected.reports[0]["tags"] == {"tier": "enterprise"}


def test_a_per_call_user_replaces_the_ambient_one_entirely(collected: Collected) -> None:
    collected.client.set_user({"id": "ambient", "email": "a@example.com"})
    collected.client.capture_exception(ValueError("boom"), user={"id": "explicit"})
    collected.flush()

    assert collected.reports[0]["user"] == {"id": "explicit"}


def test_add_breadcrumb_reaches_a_captured_report_oldest_first(collected: Collected) -> None:
    collected.client.add_breadcrumb(message="first", category="ui")
    collected.client.add_breadcrumb(message="second", level="warning")
    collected.client.capture_exception(ValueError("boom"))
    collected.flush()

    breadcrumbs = collected.reports[0]["breadcrumbs"]
    assert [breadcrumb["message"] for breadcrumb in breadcrumbs] == ["first", "second"]
    assert breadcrumbs[1]["level"] == "warning"


def test_add_breadcrumb_enforces_a_ring_buffer(collected: Collected) -> None:
    for i in range(MAX_BREADCRUMBS + 10):
        collected.client.add_breadcrumb(message=f"event {i}")
    collected.client.capture_exception(ValueError("boom"))
    collected.flush()

    breadcrumbs = collected.reports[0]["breadcrumbs"]
    assert len(breadcrumbs) == MAX_BREADCRUMBS
    assert breadcrumbs[0]["message"] == "event 10"


def test_a_report_with_no_scope_activity_carries_none_of_these_keys(
    collected: Collected,
) -> None:
    collected.client.capture_exception(ValueError("boom"))
    collected.flush()

    report = collected.reports[0]
    assert "user" not in report
    assert "tags" not in report
    assert "breadcrumbs" not in report
