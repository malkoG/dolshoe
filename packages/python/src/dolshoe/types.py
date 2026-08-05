"""The shapes that go over the wire, and the seams that carry them.

These mirror the server's own contracts — `error-report.contract.ts`,
`log-record.contract.ts`, `otlp-trace.contract.ts` — which are `.strict()`, so
an unknown field is a rejected request rather than an ignored one. Optional
keys are genuinely optional: a key whose value is absent is left out of the
dict entirely rather than set to `None`.
"""

from __future__ import annotations

from typing import Literal, Protocol, TypeAlias, TypedDict

JsonValue: TypeAlias = "str | int | float | bool | list[JsonValue] | dict[str, JsonValue] | None"

LogLevel = Literal["trace", "debug", "info", "warning", "error", "fatal"]
SpanKind = Literal["internal", "server", "client", "producer", "consumer"]
SpanStatusCode = Literal["unset", "ok", "error"]
FrameOrigin = Literal["app", "dependency", "runtime"]

LOG_LEVELS: frozenset[str] = frozenset(("trace", "debug", "info", "warning", "error", "fatal"))


class ServiceInfo(TypedDict, total=False):
    """Required `name`; `environment` and `release` are optional."""

    name: str
    environment: str
    release: str


class RuntimeInfo(TypedDict, total=False):
    name: str
    version: str


class ReporterInfo(TypedDict, total=False):
    name: str
    version: str


class TraceContext(TypedDict, total=False):
    """Lowercase hex: 32 characters of trace id, 16 of span id."""

    traceId: str
    spanId: str


class CaptureMechanism(TypedDict, total=False):
    type: str
    handled: bool


class SourceLocation(TypedDict, total=False):
    fileName: str
    lineNumber: int
    columnNumber: int
    functionName: str


class StackFrame(TypedDict, total=False):
    functionName: str
    moduleName: str
    fileName: str
    lineNumber: int
    columnNumber: int
    sourceLine: str
    preContext: list[str]
    postContext: list[str]
    inApp: bool
    origin: FrameOrigin
    native: bool
    async_: bool


class ThrownValue(TypedDict, total=False):
    type: str
    representation: str


class NormalizedException(TypedDict, total=False):
    """A recursive exception tree. `cause`, `context` and `children` are the
    Python-shaped fields the contract added for this reporter."""

    type: str
    message: str
    code: str | int
    stacktrace: str
    frames: list[StackFrame]
    source: SourceLocation
    value: ThrownValue
    cause: NormalizedException
    context: NormalizedException
    children: list[NormalizedException]


class ErrorReport(TypedDict, total=False):
    schemaVersion: int
    eventId: str
    occurredAt: str
    service: ServiceInfo
    runtime: RuntimeInfo
    reporter: ReporterInfo
    mechanism: CaptureMechanism
    exception: NormalizedException
    trace: TraceContext
    attributes: dict[str, JsonValue]


class LogRecord(TypedDict, total=False):
    eventId: str
    occurredAt: str
    level: LogLevel
    message: str
    category: list[str]
    service: ServiceInfo
    runtime: RuntimeInfo
    reporter: ReporterInfo
    trace: TraceContext
    errorReportEventId: str
    attributes: dict[str, JsonValue]


class SpanStatus(TypedDict, total=False):
    code: SpanStatusCode
    message: str


class FinishedSpan(TypedDict, total=False):
    """A span that has ended. One that has not is never built, and so is never
    sent — the server drops an unended span anyway, and a process that dies
    mid-request should not leave a half-span implying the work finished."""

    traceId: str
    spanId: str
    parentSpanId: str
    name: str
    kind: SpanKind
    startTimeUnixNano: str
    endTimeUnixNano: str
    attributes: dict[str, JsonValue]
    status: SpanStatus


class UrlOpen(Protocol):
    """The injection seam the JavaScript reporter spells `fetch`.

    Tests and the example scenario replace it so they exercise the DSN-derived
    URL and the bearer header without opening a socket.
    """

    def __call__(self, url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]: ...


class Transport(Protocol):
    def send(self, report: ErrorReport) -> None: ...


class LogTransport(Protocol):
    def send(self, records: list[LogRecord]) -> None: ...


class SpanTransport(Protocol):
    def send(self, spans: list[FinishedSpan]) -> None: ...
