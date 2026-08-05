"""Attribute sanitizing: redaction, bounds, and staying JSON."""

from __future__ import annotations

import json

import pytest

from dolshoe.normalize import MAX_ATTRIBUTE_DEPTH, sanitize_attributes


@pytest.mark.parametrize(
    "key",
    [
        "authorization",
        "Authorization",
        "cookie",
        "dsn",
        "password",
        "passwd",
        "pass",
        "secret",
        "token",
        "api_key",
        "api-key",
        "apikey",
        "access_token",
        "accessKey",
        "x-auth-token",
        "DATABASE_PASSWORD",
    ],
)
def test_a_sensitive_key_never_carries_its_value(key: str) -> None:
    assert sanitize_attributes({key: "hunter2"}) == {key: "[REDACTED]"}


def test_a_sensitive_key_is_redacted_when_nested_too() -> None:
    result = sanitize_attributes({"request": {"headers": {"authorization": "Bearer x"}}})
    assert result == {"request": {"headers": {"authorization": "[REDACTED]"}}}


def test_booleans_stay_booleans() -> None:
    """`isinstance(True, int)` is True in Python, so the obvious ordering turns
    a flag into the integer 1 — a quiet corruption of the stored attribute."""
    result = sanitize_attributes({"retried": True, "attempts": 1})

    assert result is not None
    assert result["retried"] is True
    assert result["attempts"] == 1


def test_non_finite_floats_are_named_the_way_javascript_names_them() -> None:
    """Python's `str(float('nan'))` is `'nan'`; the JavaScript reporter sends
    `'NaN'`. Storing both would mean two spellings of the same value."""
    result = sanitize_attributes(
        {"a": float("nan"), "b": float("inf"), "c": float("-inf")}
    )
    assert result == {"a": "NaN", "b": "Infinity", "c": "-Infinity"}


def test_nesting_past_the_limit_is_marked_rather_than_sent() -> None:
    value: object = "leaf"
    for _ in range(MAX_ATTRIBUTE_DEPTH + 2):
        value = {"deeper": value}

    result = sanitize_attributes({"root": value})
    assert result is not None
    assert "[Truncated]" in json.dumps(result)


def test_a_cycle_does_not_recurse_forever() -> None:
    node: dict[str, object] = {"name": "root"}
    node["self"] = node

    assert sanitize_attributes({"node": node}) == {
        "node": {"name": "root", "self": "[Circular]"}
    }


def test_containers_are_capped_and_coerced() -> None:
    result = sanitize_attributes({"items": list(range(150)), "tags": ("a", "b")})

    assert result is not None
    items = result["items"]
    assert isinstance(items, list)
    assert len(items) == 100
    assert result["tags"] == ["a", "b"]


def test_an_exception_value_becomes_its_type_and_message() -> None:
    assert sanitize_attributes({"error": ValueError("declined")}) == {
        "error": {"type": "ValueError", "message": "declined"}
    }


def test_keys_outside_the_allowed_length_are_dropped() -> None:
    assert sanitize_attributes({"": 1, "a" * 201: 2, "ok": 3}) == {"ok": 3}


def test_an_empty_map_is_omitted_entirely() -> None:
    """None means the key is left out of the payload rather than sent empty."""
    assert sanitize_attributes({}) is None
    assert sanitize_attributes(None) is None


def test_the_result_is_always_serializable_without_a_fallback() -> None:
    """The transport calls `json.dumps` with no `default=`, so anything left
    unencodable here would raise on the worker thread instead of being sent."""
    import datetime
    import decimal
    import pathlib
    import uuid

    result = sanitize_attributes(
        {
            "when": datetime.datetime(2026, 8, 5, tzinfo=datetime.UTC),
            "amount": decimal.Decimal("45.00"),
            "path": pathlib.Path("/srv/app"),
            "id": uuid.uuid4(),
            "raw": b"bytes",
            "fn": test_booleans_stay_booleans,
            "nested": {"set": {1, 2, 3}},
        }
    )

    json.dumps(result)
