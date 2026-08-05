"""A span being measured.

A port of `packages/core/src/span.ts`. Nothing leaves here until `end()`: an
unended span is not telemetry, and a process that dies mid-request should not
leave a half-span implying the work completed. The server agrees — it drops a
span that never ended and counts it as rejected.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any, Final

from .ids import new_span_id, new_trace_id, now_unix_nano, to_unix_nano
from .normalize import clip, sanitize_attributes
from .types import FinishedSpan, JsonValue, SpanKind, SpanStatus, SpanStatusCode, TraceContext

MAX_SPAN_NAME_LENGTH = 500
MAX_STATUS_MESSAGE_LENGTH = 1_024


class _Inherit:
    """Sentinel distinguishing "use the active span" from "start a new trace".

    JavaScript has two empty values for this and Python has one: `undefined`
    means inherit and `null` means detach. Making `parent=None` mean "there is
    no parent" reads correctly in Python and keeps the JavaScript behaviour
    reachable, so long as the default is something else.
    """

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "INHERIT"


INHERIT: Final = _Inherit()


class Span:
    """One operation, measured."""

    def __init__(
        self,
        *,
        name: str,
        kind: SpanKind = "internal",
        parent: TraceContext | None = None,
        attributes: Mapping[str, object] | None = None,
        start_time: datetime | float | None = None,
        on_end: Callable[[FinishedSpan], None],
        on_exception: Callable[[object, TraceContext], None],
        generate_trace_id: Callable[[], str] | None = None,
        generate_span_id: Callable[[], str] | None = None,
    ) -> None:
        # Injectable so a test can make ids predictable and compare a whole
        # payload at once. Random ids force a test to assert field by field,
        # which only ever checks the fields somebody thought to name.
        make_trace_id = generate_trace_id or new_trace_id
        make_span_id = generate_span_id or new_span_id

        # A child inherits its parent's trace, which is what makes the spans of
        # one request a tree rather than a list.
        self.trace_id = parent["traceId"] if parent and "traceId" in parent else make_trace_id()
        self.span_id = make_span_id()
        self.parent_span_id = parent.get("spanId") if parent else None

        self._name = clip(name, MAX_SPAN_NAME_LENGTH)
        self._kind = kind
        self._start = now_unix_nano() if start_time is None else to_unix_nano(start_time)
        self._attributes: dict[str, JsonValue] = sanitize_attributes(attributes) or {}
        self._status: SpanStatus = {"code": "unset"}
        self._ended = False
        self._on_end = on_end
        self._on_exception = on_exception

    @property
    def context(self) -> TraceContext:
        return {"traceId": self.trace_id, "spanId": self.span_id}

    def set_attributes(self, attributes: Mapping[str, object]) -> None:
        if self._ended:
            return
        self._attributes.update(sanitize_attributes(attributes) or {})

    def set_status(self, code: SpanStatusCode, message: str | None = None) -> None:
        if self._ended:
            return
        status: SpanStatus = {"code": code}
        if message is not None:
            status["message"] = clip(message, MAX_STATUS_MESSAGE_LENGTH)
        self._status = status

    def record_exception(self, exception: object) -> None:
        """Mark the span failed and report the exception against it."""
        if self._ended:
            return
        message = str(exception) if isinstance(exception, BaseException) else None
        self.set_status("error", message)
        self._on_exception(exception, self.context)

    def end(self, end_time: datetime | float | None = None) -> None:
        # Ending twice would report the span twice. The first end is the real
        # one; a `with` block whose body already ended the span must not undo it.
        if self._ended:
            return
        self._ended = True

        finished = now_unix_nano() if end_time is None else to_unix_nano(end_time)
        # A clock that stepped backwards, or a caller-supplied end before the
        # start, would otherwise be stored as a negative duration and rejected.
        end = max(finished, self._start)

        span: dict[str, Any] = {
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "name": self._name,
            "kind": self._kind,
            "startTimeUnixNano": str(self._start),
            "endTimeUnixNano": str(end),
            "status": self._status,
        }
        if self.parent_span_id is not None:
            span["parentSpanId"] = self.parent_span_id
        if self._attributes:
            span["attributes"] = self._attributes

        self._on_end(span)  # type: ignore[arg-type]


def resolve_parent(
    parent: TraceContext | _Inherit | None,
    active: Span | None,
) -> TraceContext | None:
    """What `start_span` resolves a parent to, given what is active."""
    if isinstance(parent, _Inherit):
        return active.context if active is not None else None
    return parent
