"""Errors the reporter raises at its own boundaries.

Configuration mistakes are raised at the call that made them — `init()` for a
malformed DSN, `capture_log()` for an unsupported level — because a reporter
that quietly accepts nonsense and drops events is worse than one that refuses
to start. Delivery failures are the opposite case: they arrive on a worker
thread, long after the call that produced them, so they are reported through
the error callbacks rather than raised at somebody unrelated.
"""

from __future__ import annotations


class DolshoeError(Exception):
    """Base class, so an application can catch everything this package raises."""


class DolshoeConfigurationError(DolshoeError):
    """The reporter was asked to start in a state it cannot work in."""


class DolshoeTransportError(DolshoeError):
    """An ingestion request was answered with something other than success."""

    def __init__(self, status: int, detail: str = "") -> None:
        self.status = status
        self.detail = detail

        hint = _hint_for(status)
        message = f"Dolshoe ingestion failed with HTTP {status}"
        if detail:
            message += f": {detail}"
        if hint:
            message += f" ({hint})"
        super().__init__(message)


def _hint_for(status: int) -> str:
    """Name the likely cause, because the status alone rarely identifies it.

    The server's own messages take this approach — a protobuf trace export is
    answered with a 415 that names the exporter setting to change rather than
    with a parse failure. A reporter that only ever says "HTTP 400" leaves the
    reader to discover on their own that a 400 is permanent and a 503 is not.
    """
    if status == 400:
        return "the payload does not match the ingestion contract; it will never succeed on retry"
    if status in (401, 403):
        return "check the DSN's token and that it belongs to the project in its path"
    if status == 413:
        return "the request body exceeds 1 MiB; send fewer records per batch"
    if status == 415:
        return "traces must be sent as application/json; protobuf OTLP is not read"
    return ""
