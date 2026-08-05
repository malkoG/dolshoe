"""Routing stdlib `logging` records into Dolshoe.

The counterpart of `packages/logtape`, which bridges LogTape on the JavaScript
side. That one is a separate distribution because `@logtape/logtape` is a
third-party peer dependency with its own version line; `logging` is stdlib, so
a separate distribution here would buy nothing and cost an install decision.

Named `logging_integration` rather than `logging` so that no reader of an
import line has to work out which `logging` is meant.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import Any

from .types import LogLevel, TraceContext

TRACE_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$", re.IGNORECASE)
SPAN_ID_PATTERN = re.compile(r"^[0-9a-f]{16}$", re.IGNORECASE)

MAX_CATEGORY_SEGMENTS = 16
MAX_CATEGORY_SEGMENT_LENGTH = 200

# Everything the logging module itself puts on a record. Anything else is an
# extra the application supplied, and belongs in the event's attributes.
# Derived from a real record rather than hard-coded, so a new stdlib field does
# not silently start arriving as an attribute.
_RESERVED: frozenset[str] = frozenset(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {
    "message",
    "asctime",
    "taskName",
}

_local = threading.local()


def _level_of(levelno: int) -> LogLevel:
    """Map by threshold, not by table.

    Custom levels are ordinary in Python — `addLevelName(25, "NOTICE")` is a
    common idiom — and a lookup table would raise KeyError on the first one.
    """
    if levelno >= logging.CRITICAL:
        return "fatal"
    if levelno >= logging.ERROR:
        return "error"
    if levelno >= logging.WARNING:
        return "warning"
    if levelno >= logging.INFO:
        return "info"
    if levelno >= logging.DEBUG:
        return "debug"
    return "trace"


def _category_of(name: str) -> list[str] | None:
    if not name:
        return None
    segments = [
        segment.strip()[:MAX_CATEGORY_SEGMENT_LENGTH]
        for segment in name.split(".")[:MAX_CATEGORY_SEGMENTS]
    ]
    kept = [segment for segment in segments if segment]
    return kept or None


def _trace_of(attributes: dict[str, Any]) -> TraceContext | None:
    """Lift W3C trace context out of the record's extras.

    A service already propagating trace ids through its logging context gets
    its logs correlated without adopting this package's span API at all. The
    ids are removed from the attributes on the way through, because they are
    about to be stored as columns and duplicating them helps nobody.
    """
    raw_trace = attributes.get("traceId") or attributes.get("trace_id")
    if not isinstance(raw_trace, str) or not TRACE_ID_PATTERN.match(raw_trace):
        return None

    attributes.pop("traceId", None)
    attributes.pop("trace_id", None)
    trace: TraceContext = {"traceId": raw_trace.lower()}

    raw_span = attributes.get("spanId") or attributes.get("span_id")
    if isinstance(raw_span, str) and SPAN_ID_PATTERN.match(raw_span):
        trace["spanId"] = raw_span.lower()
    attributes.pop("spanId", None)
    attributes.pop("span_id", None)
    return trace


class DolshoeHandler(logging.Handler):
    """A logging handler that reports through Dolshoe.

    Error-level records carrying an exception become error reports, so their
    tracebacks stay first-class; everything else becomes a structured log
    record. That split mirrors what the LogTape bridge does with an `Error` in
    a record's properties.
    """

    def __init__(self, level: int = logging.NOTSET) -> None:
        super().__init__(level)

    def emit(self, record: logging.LogRecord) -> None:
        # A record written while reporting would be reported, which would write
        # a record. Two guards, because either alone leaves a gap: the name
        # check catches this package's own logger — including the one a failed
        # send is reported through — and the thread-local catches anything a
        # transport logs from underneath us.
        if record.name == "dolshoe" or record.name.startswith("dolshoe."):
            return
        if getattr(_local, "emitting", False):
            return

        _local.emitting = True
        try:
            self._emit(record)
        except Exception:
            # `Handler.handleError` is the contract: logging must not raise
            # into the application from a log call.
            self.handleError(record)
        finally:
            _local.emitting = False

    def _emit(self, record: logging.LogRecord) -> None:
        from . import capture_exception, capture_log

        # `getMessage()` rather than `self.format(record)`: a formatter set up
        # with `%(exc_text)s` would fold the whole traceback into the message
        # and duplicate what the error report already carries.
        message = record.getMessage()
        attributes = {key: value for key, value in vars(record).items() if key not in _RESERVED}
        trace = _trace_of(attributes)
        level = _level_of(record.levelno)
        category = _category_of(record.name)

        exception = record.exc_info[1] if record.exc_info else None
        if exception is not None and record.levelno >= logging.ERROR:
            capture_exception(
                exception,
                mechanism={"type": "logging", "handled": True},
                trace=trace,
                occurred_at=record.created,
                attributes={
                    **attributes,
                    "logging.logger": record.name,
                    "logging.level": record.levelname,
                    "logging.message": message,
                },
            )
            return

        if exception is not None:
            # Below error level the exception is context, not the subject, so it
            # is reduced to an attribute the way the sanitizer treats one.
            attributes["exception"] = exception

        capture_log(
            level,
            message,
            category=category,
            trace=trace,
            occurred_at=record.created,
            attributes=attributes or None,
        )

    def close(self) -> None:
        """Flush on the way out.

        `logging.shutdown` is registered with `atexit` when `logging` is first
        imported, which is almost always before this package registers its own.
        `atexit` runs handlers last-registered-first, so ours would run first
        and anything logged during shutdown would never be sent. Flushing here
        closes that window.
        """
        try:
            from . import flush

            flush(2.0)
        finally:
            super().close()


def install_logging_handler(
    *, level: int = logging.INFO, logger: logging.Logger | None = None
) -> DolshoeHandler:
    """Attach a handler to the root logger, and return it so it can be removed."""
    handler = DolshoeHandler()
    target = logger if logger is not None else logging.getLogger()
    target.addHandler(handler)
    if target.level == logging.NOTSET or target.level > level:
        target.setLevel(level)
    return handler
