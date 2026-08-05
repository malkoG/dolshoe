"""The reporter client: what to send, and when to consider it sent.

A port of `packages/core/src/client.ts`. The shape of the promise is the same:
a capture call validates, builds the payload, hands it to delivery and returns
an event id — all without waiting for a request. Here the handoff is a queue
and a worker thread rather than a microtask.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from .dsn import parse_dsn
from .errors import DolshoeConfigurationError
from .ids import new_event_id, to_iso8601
from .normalize import (
    MAX_MESSAGE_LENGTH,
    clip,
    normalize_category,
    normalize_exception,
    sanitize_attributes,
)
from .scope import activate, active_span
from .span import INHERIT, Span, _Inherit, resolve_parent
from .transport import HttpLogTransport, HttpTransport, OtlpSpanTransport
from .types import (
    LOG_LEVELS,
    CaptureMechanism,
    ErrorReport,
    FinishedSpan,
    LogLevel,
    LogRecord,
    LogTransport,
    ReporterInfo,
    RuntimeInfo,
    ServiceInfo,
    SpanKind,
    SpanTransport,
    TraceContext,
    Transport,
    UrlOpen,
)
from .worker import DEFAULT_MAX_QUEUE_SIZE, DeliveryWorker

# The channel the default failure handler writes to. It is also the channel the
# logging bridge refuses to forward, so a delivery failure cannot become an
# event that fails to deliver.
_LOGGER = logging.getLogger("dolshoe")

Timestamp = datetime | float | str | None


class Client:
    """Owns configuration, payload construction, and the delivery worker."""

    def __init__(
        self,
        *,
        service: ServiceInfo,
        runtime: RuntimeInfo,
        reporter: ReporterInfo,
        dsn: str | None = None,
        endpoint: str | None = None,
        log_endpoint: str | None = None,
        span_endpoint: str | None = None,
        headers: Mapping[str, str] | None = None,
        transport: Transport | None = None,
        log_transport: LogTransport | None = None,
        span_transport: SpanTransport | None = None,
        url_open: UrlOpen | None = None,
        max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE,
        before_send: Callable[[ErrorReport], ErrorReport | None] | None = None,
        before_send_log_record: Callable[[LogRecord], LogRecord | None] | None = None,
        before_send_span: Callable[[FinishedSpan], FinishedSpan | None] | None = None,
        on_transport_error: Callable[[str, BaseException, list[Any]], None] | None = None,
        generate_event_id: Callable[[], str] | None = None,
        generate_trace_id: Callable[[], str] | None = None,
        generate_span_id: Callable[[], str] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if not service.get("name", "").strip():
            raise DolshoeConfigurationError("Dolshoe service.name must not be empty.")

        # A DSN supplies defaults; anything given explicitly wins, so an unusual
        # deployment can still point the reporter wherever it needs to.
        parsed = parse_dsn(dsn) if dsn is not None else None
        error_endpoint = endpoint or (parsed.error_report_endpoint if parsed else None)
        logs_endpoint = log_endpoint or (parsed.log_endpoint if parsed else None)
        spans_endpoint = span_endpoint or (parsed.span_endpoint if parsed else None)

        merged_headers: dict[str, str] = {}
        if parsed is not None:
            merged_headers["authorization"] = f"Bearer {parsed.token}"
        merged_headers.update(headers or {})

        if transport is None and error_endpoint is None:
            raise DolshoeConfigurationError("Dolshoe requires either dsn, endpoint, or transport.")

        self._service = service
        self._runtime = runtime
        self._reporter = reporter
        self._before_send = before_send
        self._before_send_log_record = before_send_log_record
        self._before_send_span = before_send_span
        self._generate_event_id = generate_event_id or new_event_id
        self._generate_trace_id = generate_trace_id
        self._generate_span_id = generate_span_id
        self._now = now
        self._closed = False

        self._transport: Transport = transport or HttpTransport(
            str(error_endpoint), headers=merged_headers, url_open=url_open
        )
        self._log_transport: LogTransport | None = log_transport or (
            HttpLogTransport(logs_endpoint, headers=merged_headers, url_open=url_open)
            if logs_endpoint
            else None
        )
        self._span_transport: SpanTransport | None = span_transport or (
            OtlpSpanTransport(
                spans_endpoint,
                service=service,
                reporter=reporter,
                runtime=runtime,
                headers=merged_headers,
                url_open=url_open,
            )
            if spans_endpoint
            else None
        )

        self._on_transport_error = on_transport_error or _default_transport_error
        self._worker = DeliveryWorker(
            send_error=self._deliver_error,
            send_logs=self._deliver_logs if self._log_transport else None,
            send_spans=self._deliver_spans if self._span_transport else None,
            on_failure=self._on_transport_error,
            max_queue_size=max_queue_size,
        )

    # -- delivery, on the worker thread ----------------------------------

    def _deliver_error(self, report: ErrorReport) -> None:
        # The `before_send` hooks run here rather than at the call site, matching
        # the JavaScript client's microtask: a slow hook must not be able to
        # stall the application thread that captured.
        transformed = self._before_send(report) if self._before_send else report
        if transformed is not None:
            self._transport.send(transformed)

    def _deliver_logs(self, records: list[LogRecord]) -> None:
        assert self._log_transport is not None
        if self._before_send_log_record is not None:
            kept = [
                transformed
                for record in records
                if (transformed := self._before_send_log_record(record)) is not None
            ]
        else:
            kept = records
        if kept:
            self._log_transport.send(kept)

    def _deliver_spans(self, spans: list[FinishedSpan]) -> None:
        assert self._span_transport is not None
        if self._before_send_span is not None:
            kept = [
                transformed
                for span in spans
                if (transformed := self._before_send_span(span)) is not None
            ]
        else:
            kept = spans
        if kept:
            self._span_transport.send(kept)

    # -- capturing --------------------------------------------------------

    def _trace_of(self, explicit: TraceContext | None) -> TraceContext | None:
        """Explicit wins; otherwise whatever span encloses the caller."""
        if explicit is not None:
            return explicit
        current = active_span()
        return current.context if current is not None else None

    def _occurred_at(self, value: Timestamp) -> str:
        if value is None and self._now is not None:
            return to_iso8601(self._now())
        return to_iso8601(value)

    def capture_exception(
        self,
        exception: object,
        *,
        attributes: Mapping[str, object] | None = None,
        mechanism: CaptureMechanism | None = None,
        trace: TraceContext | None = None,
        occurred_at: Timestamp = None,
    ) -> str | None:
        """Report an exception. Returns its event id, or None once closed."""
        return self._capture(
            normalize_exception(exception), attributes, mechanism, trace, occurred_at
        )

    def capture_message(
        self,
        message: str,
        *,
        attributes: Mapping[str, object] | None = None,
        mechanism: CaptureMechanism | None = None,
        trace: TraceContext | None = None,
        occurred_at: Timestamp = None,
    ) -> str | None:
        """Report something worth an entry that is not an exception."""
        exception = {"type": "Message", "message": clip(message, MAX_MESSAGE_LENGTH)}
        return self._capture(exception, attributes, mechanism, trace, occurred_at)

    def _capture(
        self,
        exception: Any,
        attributes: Mapping[str, object] | None,
        mechanism: CaptureMechanism | None,
        trace: TraceContext | None,
        occurred_at: Timestamp,
    ) -> str | None:
        if self._closed:
            return None

        event_id = self._generate_event_id()
        report: ErrorReport = {
            "schemaVersion": 1,
            "eventId": event_id,
            "occurredAt": self._occurred_at(occurred_at),
            "service": self._service,
            "runtime": self._runtime,
            "reporter": self._reporter,
        }
        if mechanism is not None:
            report["mechanism"] = mechanism
        report["exception"] = exception

        resolved = self._trace_of(trace)
        if resolved is not None:
            report["trace"] = resolved
        sanitized = sanitize_attributes(attributes)
        if sanitized is not None:
            report["attributes"] = sanitized

        self._worker.submit_error(report)
        return event_id

    def capture_log(
        self,
        level: LogLevel,
        message: str,
        *,
        attributes: Mapping[str, object] | None = None,
        category: Sequence[str] | None = None,
        trace: TraceContext | None = None,
        error_report_event_id: str | None = None,
        occurred_at: Timestamp = None,
    ) -> str | None:
        """Write a structured log record.

        Validation raises here, at the call that got it wrong, rather than
        failing silently on a worker thread minutes later.
        """
        if self._closed:
            return None
        if self._log_transport is None:
            raise DolshoeConfigurationError(
                "Dolshoe capture_log requires log_endpoint or log_transport."
            )
        if level not in LOG_LEVELS:
            raise ValueError(f"Dolshoe received an unsupported log level: {level}.")
        if not message:
            raise ValueError("Dolshoe log messages must not be empty.")

        event_id = self._generate_event_id()
        record: LogRecord = {
            "eventId": event_id,
            "occurredAt": self._occurred_at(occurred_at),
            "level": level,
            "message": clip(message, MAX_MESSAGE_LENGTH),
        }
        segments = normalize_category(category)
        if segments is not None:
            record["category"] = segments
        record["service"] = self._service
        record["runtime"] = self._runtime
        record["reporter"] = self._reporter

        resolved = self._trace_of(trace)
        if resolved is not None:
            record["trace"] = resolved
        if error_report_event_id is not None:
            record["errorReportEventId"] = error_report_event_id
        sanitized = sanitize_attributes(attributes)
        if sanitized is not None:
            record["attributes"] = sanitized

        self._worker.submit_log(record)
        return event_id

    # -- spans ------------------------------------------------------------

    def start_span(
        self,
        name: str,
        *,
        kind: SpanKind = "internal",
        attributes: Mapping[str, object] | None = None,
        parent: TraceContext | _Inherit | None = INHERIT,
        start_time: datetime | float | None = None,
    ) -> Span:
        """Begin a span. It is reported when `end()` is called, and not before.

        This does not make the span active — `with_span` does that. A span that
        is started and never ended is never sent.
        """

        def report(exception: object, context: TraceContext) -> None:
            self.capture_exception(
                exception, trace=context, mechanism={"type": "span", "handled": True}
            )

        return Span(
            name=name,
            kind=kind,
            parent=resolve_parent(parent, active_span()),
            attributes=attributes,
            start_time=start_time,
            on_end=self._finish_span,
            on_exception=report,
            generate_trace_id=self._generate_trace_id,
            generate_span_id=self._generate_span_id,
        )

    @contextmanager
    def with_span(
        self,
        name: str,
        *,
        kind: SpanKind = "internal",
        attributes: Mapping[str, object] | None = None,
        parent: TraceContext | _Inherit | None = INHERIT,
        start_time: datetime | float | None = None,
    ) -> Iterator[Span]:
        """Run a block inside a span, ending it afterwards.

        A raised exception marks the span failed and is reported, then
        propagates — the caller's error handling is unchanged by having been
        measured. `end()` being idempotent means a body that ends the span
        itself is safe.
        """
        span = self.start_span(
            name, kind=kind, attributes=attributes, parent=parent, start_time=start_time
        )
        try:
            with activate(span):
                yield span
        except BaseException as error:
            span.record_exception(error)
            raise
        finally:
            span.end()

    def _finish_span(self, span: FinishedSpan) -> None:
        if self._closed:
            return
        self._worker.submit_span(span)

    # -- lifecycle --------------------------------------------------------

    def flush(self, timeout: float = 2.0) -> bool:
        """Wait for queued events, and report whether they all landed."""
        return self._worker.flush(timeout)

    def close(self, timeout: float = 2.0) -> bool:
        """Flush, then stop accepting anything further."""
        # Closed first, so a capture racing this call returns None rather than
        # being queued behind a worker that is shutting down.
        self._closed = True
        return self._worker.close(timeout)


def _default_transport_error(what: str, error: BaseException, items: list[Any]) -> None:
    """Where a delivery failure goes when the application has not said.

    The JavaScript client writes to the console here. This package cannot: the
    repository bans `console` in TypeScript and the Python linter bans `print`
    for the same reason. It logs instead — to the one logger the logging bridge
    refuses to forward, so reporting a failed send cannot itself produce an
    event that fails to send.
    """
    _LOGGER.warning(
        "Failed to send %d %s(s) to Dolshoe: %s", len(items), what, error, exc_info=error
    )
