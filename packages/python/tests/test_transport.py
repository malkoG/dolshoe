"""Transport guards and the messages a rejection produces."""

from __future__ import annotations

import json
from typing import Any

import pytest

from dolshoe.errors import DolshoeTransportError
from dolshoe.transport import HttpLogTransport, HttpTransport, OtlpSpanTransport
from dolshoe.types import FinishedSpan, LogRecord

SPAN: FinishedSpan = {
    "traceId": "a" * 32,
    "spanId": "b" * 16,
    "name": "work",
    "kind": "internal",
    "startTimeUnixNano": "1",
    "endTimeUnixNano": "2",
    "status": {"code": "unset"},
}
RECORD: LogRecord = {
    "eventId": "e",
    "occurredAt": "2026-08-05T00:00:00.000Z",
    "level": "info",
    "message": "hello",
}


def _capturing() -> tuple[list[dict[str, Any]], Any]:
    seen: list[dict[str, Any]] = []

    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        seen.append({"url": url, "headers": headers, "body": json.loads(body)})
        return 201, b""

    return seen, url_open


def test_a_log_batch_outside_the_servers_bounds_is_refused() -> None:
    """The server rejects a batch over 100 outright, so sending one would throw
    away every record in it."""
    _, url_open = _capturing()
    transport = HttpLogTransport("https://dolshoe.example/logs", url_open=url_open)

    with pytest.raises(ValueError, match="between 1 and 100 records"):
        transport.send([])
    with pytest.raises(ValueError, match="between 1 and 100 records"):
        transport.send([RECORD] * 101)


def test_a_span_export_outside_the_servers_bounds_is_refused() -> None:
    _, url_open = _capturing()
    transport = OtlpSpanTransport(
        "https://dolshoe.example/traces",
        service={"name": "checkout-api"},
        reporter={"name": "dolshoe-python"},
        runtime={"name": "cpython"},
        url_open=url_open,
    )

    with pytest.raises(ValueError, match="between 1 and 1000 spans"):
        transport.send([])
    with pytest.raises(ValueError, match="between 1 and 1000 spans"):
        transport.send([SPAN] * 1_001)


def test_a_caller_header_overrides_the_default(_: None = None) -> None:
    seen, url_open = _capturing()
    transport = HttpTransport(
        "https://dolshoe.example/reports",
        headers={"authorization": "Bearer explicit", "content-type": "application/json"},
        url_open=url_open,
    )
    transport.send({"schemaVersion": 1})

    assert seen[0]["headers"]["authorization"] == "Bearer explicit"
    assert seen[0]["headers"]["accept"] == "application/json"


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (400, "will never succeed on retry"),
        (401, "check the DSN's token"),
        (403, "check the DSN's token"),
        (413, "send fewer records per batch"),
        (415, "protobuf OTLP is not read"),
    ],
)
def test_a_rejection_names_the_likely_cause(status: int, expected: str) -> None:
    """A bare "HTTP 400" leaves the reader to discover on their own that a 400
    is permanent and a 503 is not. The server's own errors name the fix."""

    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        return status, b'{"message":"Request body does not match the contract."}'

    transport = HttpTransport("https://dolshoe.example/reports", url_open=url_open)
    with pytest.raises(DolshoeTransportError) as raised:
        transport.send({"schemaVersion": 1})

    assert raised.value.status == status
    assert expected in str(raised.value)
    assert "does not match the contract" in raised.value.detail


def test_a_server_error_carries_no_hint_because_it_may_yet_succeed() -> None:
    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        return 503, b"upstream unavailable"

    transport = HttpTransport("https://dolshoe.example/reports", url_open=url_open)
    with pytest.raises(DolshoeTransportError, match=r"HTTP 503: upstream unavailable$"):
        transport.send({"schemaVersion": 1})


def test_a_long_rejection_body_is_cut_rather_than_logged_whole() -> None:
    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        return 400, b"x" * 5_000

    transport = HttpTransport("https://dolshoe.example/reports", url_open=url_open)
    with pytest.raises(DolshoeTransportError) as raised:
        transport.send({"schemaVersion": 1})

    assert len(raised.value.detail) == 1_024
    assert raised.value.detail.endswith("…")
