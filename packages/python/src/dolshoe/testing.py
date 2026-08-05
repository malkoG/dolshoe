"""Testing your own instrumentation.

Asserting that an application reports what it should is the application's
problem, not this package's, and it should not require hand-rolling a fake
transport in every project. `capture_telemetry()` configures a client that
records into memory instead of sending, and the two generators here make ids
and timestamps predictable so a whole payload can be compared at once rather
than field by field — which only ever checks the fields somebody thought to
name.

    from dolshoe.testing import capture_telemetry

    def test_orders_are_measured():
        with capture_telemetry() as captured:
            handle_request()

        assert captured.span_tree() == [("POST /orders", [("price basket", [])])]

Under pytest the `captured_telemetry` fixture does the same thing, and is
registered automatically — this module is a pytest plugin, so installing
`dolshoe` is enough.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from . import get_client, set_current_client
from .client import Client
from .types import ErrorReport, FinishedSpan, LogRecord, ServiceInfo

__all__ = [
    "CapturedTelemetry",
    "IncrementalIdGenerator",
    "TimeGenerator",
    "capture_telemetry",
]


class IncrementalIdGenerator:
    """Sequential trace and span ids, so a snapshot is stable between runs.

    Real ids are random, which is correct in production and useless in a test:
    it forces every assertion to be a comparison against another field rather
    than against a value you can read.
    """

    def __init__(self) -> None:
        self.trace_ids = 0
        self.span_ids = 0

    def new_trace_id(self) -> str:
        self.trace_ids += 1
        return f"{self.trace_ids:032x}"

    def new_span_id(self) -> str:
        self.span_ids += 1
        return f"{self.span_ids:016x}"

    def reset(self) -> None:
        self.trace_ids = 0
        self.span_ids = 0


class TimeGenerator:
    """A clock that advances one second per reading."""

    def __init__(self, start: datetime | None = None, step: timedelta | None = None) -> None:
        self._next = start or datetime(2026, 1, 1, tzinfo=UTC)
        self._step = step or timedelta(seconds=1)

    def __call__(self) -> datetime:
        moment = self._next
        self._next = moment + self._step
        return moment


class _EventIdGenerator:
    """UUID-shaped but sequential, so `eventId` is readable in a snapshot."""

    def __init__(self) -> None:
        self.count = 0

    def __call__(self) -> str:
        self.count += 1
        return f"00000000-0000-4000-8000-{self.count:012d}"


@dataclass
class CapturedTelemetry:
    """Everything the application reported while this was active.

    Reading any of the three collections flushes first. Delivery happens on a
    worker thread, so without that a test would have to know to flush before
    asserting — and would otherwise pass or fail on thread timing, which is the
    worst kind of test to own.
    """

    written_reports: list[ErrorReport] = field(default_factory=list)
    written_records: list[LogRecord] = field(default_factory=list)
    written_spans: list[FinishedSpan] = field(default_factory=list)
    client: Client | None = None

    def flush(self, timeout: float = 5.0) -> bool:
        if self.client is None:
            return True
        return self.client.flush(timeout)

    @property
    def reports(self) -> list[ErrorReport]:
        self.flush()
        return self.written_reports

    @property
    def records(self) -> list[LogRecord]:
        self.flush()
        return self.written_records

    @property
    def spans(self) -> list[FinishedSpan]:
        self.flush()
        return self.written_spans

    def clear(self) -> None:
        self.flush()
        self.written_reports.clear()
        self.written_records.clear()
        self.written_spans.clear()

    # -- convenience readers ---------------------------------------------

    def span_named(self, name: str) -> FinishedSpan:
        """The one span with this name, or an error naming what was there."""
        matches = [span for span in self.spans if span.get("name") == name]
        if len(matches) != 1:
            available = ", ".join(sorted(str(span.get("name")) for span in self.spans)) or "none"
            raise AssertionError(
                f"expected exactly one span named {name!r}, found {len(matches)}. "
                f"Spans captured: {available}."
            )
        return matches[0]

    def span_tree(self) -> list[tuple[str, list[Any]]]:
        """Spans as nested `(name, children)` pairs, roots first.

        The shape most tests actually care about — that the right work was
        measured, and that it nested the way the request did — without the ids
        and timings that make a raw comparison unreadable.
        """
        children: dict[str | None, list[FinishedSpan]] = {}
        for span in self.spans:
            children.setdefault(span.get("parentSpanId"), []).append(span)

        def build(parent: str | None) -> list[tuple[str, list[Any]]]:
            return [
                (str(span.get("name")), build(span.get("spanId")))
                for span in children.get(parent, [])
            ]

        return build(None)

    def spans_as_dict(self, *, include_timing: bool = False) -> list[dict[str, Any]]:
        """Spans reduced to what is worth snapshotting."""
        kept: list[dict[str, Any]] = []
        for span in self.spans:
            entry: dict[str, Any] = {
                "name": span.get("name"),
                "kind": span.get("kind"),
                "traceId": span.get("traceId"),
                "spanId": span.get("spanId"),
                "parentSpanId": span.get("parentSpanId"),
                "status": span.get("status"),
                "attributes": span.get("attributes", {}),
            }
            if include_timing:
                entry["startTimeUnixNano"] = span.get("startTimeUnixNano")
                entry["endTimeUnixNano"] = span.get("endTimeUnixNano")
            kept.append(entry)
        return kept


class _RecordingTransport:
    def __init__(self, captured: CapturedTelemetry) -> None:
        self._captured = captured

    def send(self, report: ErrorReport) -> None:
        self._captured.written_reports.append(report)


class _RecordingLogTransport:
    def __init__(self, captured: CapturedTelemetry) -> None:
        self._captured = captured

    def send(self, records: list[LogRecord]) -> None:
        self._captured.written_records.extend(records)


class _RecordingSpanTransport:
    def __init__(self, captured: CapturedTelemetry) -> None:
        self._captured = captured

    def send(self, spans: list[FinishedSpan]) -> None:
        self._captured.written_spans.extend(spans)


@contextmanager
def capture_telemetry(
    *,
    service: ServiceInfo | None = None,
    deterministic: bool = True,
    **options: Any,
) -> Iterator[CapturedTelemetry]:
    """Record everything reported inside the block instead of sending it.

    The previously configured client, if any, is restored afterwards, so this
    is safe to use in a suite that also configures the reporter for real.

    With `deterministic` left on, ids and timestamps are sequential, which is
    what makes a whole-payload comparison worth writing. Turn it off when the
    test is specifically about real ids being unique.
    """
    from . import init  # imported here to avoid a cycle at module import

    captured = CapturedTelemetry()
    previous = get_client()

    if deterministic:
        ids = IncrementalIdGenerator()
        options.setdefault("generate_trace_id", ids.new_trace_id)
        options.setdefault("generate_span_id", ids.new_span_id)
        options.setdefault("generate_event_id", _EventIdGenerator())
        options.setdefault("now", TimeGenerator())

    client: Client = init(
        service=service or {"name": "test-service"},
        transport=_RecordingTransport(captured),
        log_transport=_RecordingLogTransport(captured),
        span_transport=_RecordingSpanTransport(captured),
        # A test asserting on captured telemetry does not want the reporter
        # rewiring the interpreter's excepthooks underneath it.
        capture_unhandled_errors=False,
        **options,
    )
    captured.client = client
    try:
        yield captured
    finally:
        client.close(5.0)
        captured.client = None
        set_current_client(previous)


try:  # pragma: no cover - only exercised when pytest is installed
    import pytest

    @pytest.fixture
    def captured_telemetry() -> Iterator[CapturedTelemetry]:
        """Record what the code under test reports to Dolshoe."""
        with capture_telemetry() as captured:
            yield captured

except ImportError:  # pragma: no cover
    pass
