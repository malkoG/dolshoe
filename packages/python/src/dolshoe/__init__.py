"""Dolshoe reporter for Python.

Reports errors, structured logs, and spans to a Dolshoe instance over the same
versioned ingestion contract the JavaScript reporters use::

    import dolshoe

    dolshoe.init(dsn=os.environ["DOLSHOE_DSN"], service={"name": "checkout-api"})

    with dolshoe.with_span("POST /orders", kind="server"):
        dolshoe.capture_log("info", "Order submitted")

Every capture is a no-op when `init()` has not been called. A reporter that has
not been configured must not stop the application's own work from happening,
which is the same reason a delivery failure never propagates to the caller.
"""

from __future__ import annotations

import platform
from collections.abc import Iterator, Mapping, Sequence
from contextlib import AbstractContextManager, contextmanager
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .scope import ScopeData

from .client import Client, Timestamp
from .dsn import ParsedDsn, parse_dsn
from .errors import DolshoeConfigurationError, DolshoeError, DolshoeTransportError
from .hooks import InstalledHooks
from .hooks import install as _install_hooks
from .logging_integration import DolshoeHandler, install_logging_handler
from .normalize import normalize_exception, sanitize_attributes
from .span import INHERIT, Span, _Inherit
from .types import (
    Breadcrumb,
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
    SpanStatusCode,
    SpanTransport,
    Tags,
    TraceContext,
    Transport,
    UrlOpen,
    UserContext,
)

# The identity the API's own OpenAPI example advertises for this reporter. A
# stored event names the reporter that produced it, so these are not cosmetic.
REPORTER_NAME = "dolshoe-python"
REPORTER_VERSION = "0.1.0"
RUNTIME_NAME = "cpython"

_current_client: Client | None = None
_installed_hooks: InstalledHooks | None = None


def init(
    *,
    service: ServiceInfo,
    capture_unhandled_errors: bool = True,
    **options: Any,
) -> Client:
    """Configure the reporter and make it the current one.

    Accepts everything `Client` does, minus `runtime` and `reporter`, which this
    package fills in. Calling it again replaces the client and reinstalls the
    hooks, so a re-init in a test or a reloading server does not stack them.
    """
    global _current_client, _installed_hooks

    if _installed_hooks is not None:
        _installed_hooks.uninstall()
        _installed_hooks = None

    client = Client(
        service=service,
        runtime={"name": RUNTIME_NAME, "version": platform.python_version()},
        reporter={"name": REPORTER_NAME, "version": REPORTER_VERSION},
        **options,
    )
    _current_client = client

    if capture_unhandled_errors:
        _installed_hooks = _install_hooks(_report_unhandled, client.flush)
    return client


def _report_unhandled(exception: BaseException, *, mechanism_type: str) -> None:
    capture_exception(exception, mechanism={"type": mechanism_type, "handled": False})


def get_client() -> Client | None:
    """The client `init()` configured, if any."""
    return _current_client


def set_current_client(client: Client | None) -> None:
    """Replace the current client. Mostly useful in tests."""
    global _current_client
    _current_client = client


def capture_exception(
    exception: object,
    *,
    attributes: Mapping[str, object] | None = None,
    mechanism: CaptureMechanism | None = None,
    trace: TraceContext | None = None,
    user: UserContext | Mapping[str, object] | None = None,
    tags: Mapping[str, object] | None = None,
    occurred_at: Timestamp = None,
) -> str | None:
    if _current_client is None:
        return None
    return _current_client.capture_exception(
        exception,
        attributes=attributes,
        mechanism=mechanism,
        trace=trace,
        user=user,
        tags=tags,
        occurred_at=occurred_at,
    )


def capture_message(
    message: str,
    *,
    attributes: Mapping[str, object] | None = None,
    mechanism: CaptureMechanism | None = None,
    trace: TraceContext | None = None,
    user: UserContext | Mapping[str, object] | None = None,
    tags: Mapping[str, object] | None = None,
    occurred_at: Timestamp = None,
) -> str | None:
    if _current_client is None:
        return None
    return _current_client.capture_message(
        message,
        attributes=attributes,
        mechanism=mechanism,
        trace=trace,
        user=user,
        tags=tags,
        occurred_at=occurred_at,
    )


def set_user(user: UserContext | Mapping[str, object] | None) -> None:
    """Set the user on the active scope. Applies to the current thread or
    asyncio task only — see `with_scope` to isolate a block's own scope."""
    if _current_client is not None:
        _current_client.set_user(user)


def set_tag(key: str, value: str) -> None:
    """Set one tag on the active scope, merging with whatever is there."""
    if _current_client is not None:
        _current_client.set_tag(key, value)


def set_tags(tags: Tags | Mapping[str, object]) -> None:
    """Set several tags on the active scope, merging rather than replacing."""
    if _current_client is not None:
        _current_client.set_tags(tags)


def add_breadcrumb(
    *,
    message: str | None = None,
    category: str | None = None,
    level: LogLevel | None = None,
    data: Mapping[str, object] | None = None,
    occurred_at: Timestamp = None,
) -> None:
    """Record one event on the active scope's breadcrumb trail."""
    if _current_client is not None:
        _current_client.add_breadcrumb(
            message=message,
            category=category,
            level=level,
            data=data,
            occurred_at=occurred_at,
        )


def capture_log(
    level: LogLevel,
    message: str,
    *,
    attributes: Mapping[str, object] | None = None,
    category: Sequence[str] | None = None,
    trace: TraceContext | None = None,
    error_report_event_id: str | None = None,
    occurred_at: Timestamp = None,
) -> str | None:
    if _current_client is None:
        return None
    return _current_client.capture_log(
        level,
        message,
        attributes=attributes,
        category=category,
        trace=trace,
        error_report_event_id=error_report_event_id,
        occurred_at=occurred_at,
    )


def start_span(
    name: str,
    *,
    kind: SpanKind = "internal",
    attributes: Mapping[str, object] | None = None,
    parent: TraceContext | _Inherit | None = INHERIT,
    start_time: datetime | float | None = None,
) -> Span | None:
    if _current_client is None:
        return None
    return _current_client.start_span(
        name, kind=kind, attributes=attributes, parent=parent, start_time=start_time
    )


@contextmanager
def with_span(
    name: str,
    *,
    kind: SpanKind = "internal",
    attributes: Mapping[str, object] | None = None,
    parent: TraceContext | _Inherit | None = INHERIT,
    start_time: datetime | float | None = None,
) -> Iterator[Span | None]:
    """Run a block inside a span.

    Without a configured client the block still runs and is handed None, so
    wrapping work in a span cannot be the reason the work stops happening.
    """
    if _current_client is None:
        yield None
        return
    with _current_client.with_span(
        name, kind=kind, attributes=attributes, parent=parent, start_time=start_time
    ) as span:
        yield span


def active_span() -> Span | None:
    """The span enclosing the caller, if any."""
    from .scope import active_span as _active_span

    return _active_span()


def active_scope() -> ScopeData:
    """The user/tags/breadcrumbs scope enclosing the caller.

    Always returns something to read, the same as `set_user`/`set_tag`/
    `add_breadcrumb` always have something to mutate.
    """
    from .scope import active_scope as _active_scope

    return _active_scope()


def with_scope() -> AbstractContextManager[ScopeData]:
    """Bind a fresh, empty user/tags/breadcrumbs scope for a block.

    A request handler wraps itself in this to isolate its own `set_user`/
    `set_tag`/`add_breadcrumb` calls from whatever else is running
    concurrently::

        with dolshoe.with_scope():
            dolshoe.set_user({"id": current_user.id})
            handle_request()
    """
    from .scope import with_scope as _with_scope

    return _with_scope()


def flush(timeout: float = 2.0) -> bool:
    """Wait for queued events. True when there was nothing left to fail."""
    if _current_client is None:
        return True
    return _current_client.flush(timeout)


def close(timeout: float = 2.0) -> bool:
    """Flush, remove the hooks, and stop reporting."""
    global _current_client, _installed_hooks

    if _installed_hooks is not None:
        _installed_hooks.uninstall()
        _installed_hooks = None

    client = _current_client
    if client is None:
        return True
    result = client.close(timeout)
    if _current_client is client:
        _current_client = None
    return result


__all__ = [
    "INHERIT",
    "REPORTER_NAME",
    "REPORTER_VERSION",
    "RUNTIME_NAME",
    "Breadcrumb",
    "CaptureMechanism",
    "Client",
    "DolshoeConfigurationError",
    "DolshoeError",
    "DolshoeHandler",
    "DolshoeTransportError",
    "ErrorReport",
    "FinishedSpan",
    "LogLevel",
    "LogRecord",
    "LogTransport",
    "ParsedDsn",
    "ReporterInfo",
    "RuntimeInfo",
    "ServiceInfo",
    "Span",
    "SpanKind",
    "SpanStatusCode",
    "SpanTransport",
    "Tags",
    "TraceContext",
    "Transport",
    "UrlOpen",
    "UserContext",
    "active_scope",
    "active_span",
    "add_breadcrumb",
    "capture_exception",
    "capture_log",
    "capture_message",
    "close",
    "flush",
    "get_client",
    "init",
    "install_logging_handler",
    "normalize_exception",
    "parse_dsn",
    "sanitize_attributes",
    "set_current_client",
    "set_tag",
    "set_tags",
    "set_user",
    "start_span",
    "with_scope",
    "with_span",
]
