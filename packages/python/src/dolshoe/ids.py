"""Identifiers and clocks for events and spans."""

from __future__ import annotations

import secrets
import time
import uuid
from datetime import UTC, datetime


def new_event_id() -> str:
    """A UUID identifying one event, and the server's idempotency key."""
    return str(uuid.uuid4())


def new_trace_id() -> str:
    """32 lowercase hex characters, as OTLP encodes a trace id in JSON."""
    return secrets.token_hex(16)


def new_span_id() -> str:
    """16 lowercase hex characters, as OTLP encodes a span id in JSON."""
    return secrets.token_hex(8)


def now_unix_nano() -> int:
    """Wall-clock nanoseconds since the epoch, for a span boundary."""
    return time.time_ns()


def to_unix_nano(value: datetime | float) -> int:
    """Convert a caller-supplied span boundary into unix nanoseconds."""
    if isinstance(value, datetime):
        return int(_as_aware(value).timestamp() * 1_000_000_000)
    return int(value * 1_000_000_000)


def to_iso8601(value: datetime | float | str | None = None) -> str:
    """Format a timestamp the way the ingestion contract requires.

    The contract rejects anything that does not end in `Z`, and
    `datetime.isoformat()` produces `+00:00` — so the obvious implementation is
    rejected by the server with a 400 that says nothing about timezones.
    """
    if isinstance(value, str):
        return value
    if value is None:
        moment = datetime.now(UTC)
    elif isinstance(value, datetime):
        moment = _as_aware(value)
    else:
        moment = datetime.fromtimestamp(value, UTC)

    return (
        moment.astimezone(UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _as_aware(moment: datetime) -> datetime:
    """Interpret a naive datetime as local time.

    `datetime.now()` and `datetime.fromtimestamp()` both produce naive local
    times, so treating naive input as UTC would silently shift every timestamp
    written by the most ordinary way of getting one.
    """
    return moment.astimezone() if moment.tzinfo is None else moment
