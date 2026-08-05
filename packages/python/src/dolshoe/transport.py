"""Blocking HTTP transports for the three ingestion endpoints.

Deliberately `urllib`, not `httpx` or `requests`. The JavaScript core has no
dependencies at all, and that is the property that lets an application adopt
the reporter without a discussion about its dependency tree — a reporter that
drags an HTTP stack in can create a version conflict in exactly the application
that is already failing, which is the worst possible moment to discover one.

The cost, stated plainly: `urllib` does not reuse connections, so each batch
pays a TLS handshake. Batches of up to 100 records make that cheap enough, and
an application that disagrees can supply its own transport.

Blocking is fine here because nothing calls these on the application's thread:
the worker owns them.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any

from .errors import DolshoeTransportError
from .otlp import to_otlp_trace_request
from .types import (
    ErrorReport,
    FinishedSpan,
    LogRecord,
    ReporterInfo,
    RuntimeInfo,
    ServiceInfo,
    UrlOpen,
)

MAX_LOG_BATCH_SIZE = 100
MAX_SPAN_EXPORT_SIZE = 1_000
_MAX_DETAIL_LENGTH = 1_024


def urlopen_transport(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
    """The default `UrlOpen`: one POST, no retry, no connection reuse."""
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request) as response:
            return int(response.status), response.read()
    except urllib.error.HTTPError as error:
        # An HTTP error is a response, not a failure to reach the server, so it
        # is returned for `_post_json` to describe rather than raised here.
        return int(error.code), error.read()


def _post_json(
    url_open: UrlOpen,
    endpoint: str,
    headers: dict[str, str],
    payload: object,
) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    merged = {
        "accept": "application/json",
        "content-type": "application/json",
        # Caller headers last, so an explicit authorization overrides the one
        # the DSN derived.
        **headers,
    }

    status, response_body = url_open(endpoint, headers=merged, body=body)
    if 200 <= status < 300:
        return

    detail = response_body.decode("utf-8", errors="replace").strip()
    if len(detail) > _MAX_DETAIL_LENGTH:
        detail = detail[: _MAX_DETAIL_LENGTH - 1] + "…"
    raise DolshoeTransportError(status, detail)


class HttpTransport:
    """Posts one error report per request."""

    def __init__(
        self,
        endpoint: str,
        *,
        headers: dict[str, str] | None = None,
        url_open: UrlOpen | None = None,
    ) -> None:
        self._endpoint = endpoint
        self._headers = dict(headers or {})
        self._url_open: UrlOpen = url_open or urlopen_transport

    def send(self, report: ErrorReport) -> None:
        _post_json(self._url_open, self._endpoint, self._headers, report)


class HttpLogTransport:
    """Posts a batch of log records wrapped in the versioned envelope."""

    def __init__(
        self,
        endpoint: str,
        *,
        headers: dict[str, str] | None = None,
        url_open: UrlOpen | None = None,
    ) -> None:
        self._endpoint = endpoint
        self._headers = dict(headers or {})
        self._url_open: UrlOpen = url_open or urlopen_transport

    def send(self, records: list[LogRecord]) -> None:
        if not records or len(records) > MAX_LOG_BATCH_SIZE:
            raise ValueError(
                f"Dolshoe log batches must contain between 1 and {MAX_LOG_BATCH_SIZE} records."
            )
        payload: dict[str, Any] = {"schemaVersion": 1, "records": records}
        _post_json(self._url_open, self._endpoint, self._headers, payload)


class OtlpSpanTransport:
    """Exports spans as OTLP/HTTP JSON.

    The same bytes an OpenTelemetry exporter would send, so nothing about a
    Dolshoe-reported span is special once stored. The server answers 200 with
    `{"partialSuccess": {}}` rather than 201.
    """

    def __init__(
        self,
        endpoint: str,
        *,
        service: ServiceInfo,
        reporter: ReporterInfo,
        runtime: RuntimeInfo,
        headers: dict[str, str] | None = None,
        url_open: UrlOpen | None = None,
    ) -> None:
        self._endpoint = endpoint
        self._service = service
        self._reporter = reporter
        self._runtime = runtime
        self._headers = dict(headers or {})
        self._url_open: UrlOpen = url_open or urlopen_transport

    def send(self, spans: list[FinishedSpan]) -> None:
        if not spans or len(spans) > MAX_SPAN_EXPORT_SIZE:
            raise ValueError(
                f"Dolshoe span exports must contain between 1 and {MAX_SPAN_EXPORT_SIZE} spans."
            )
        payload = to_otlp_trace_request(
            spans, service=self._service, reporter=self._reporter, runtime=self._runtime
        )
        _post_json(self._url_open, self._endpoint, self._headers, payload)
