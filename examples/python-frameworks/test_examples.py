"""Drives both example apps through their test clients.

An example that is never executed rots quietly. These run the real middleware
and the real routes against a recording transport, so the wiring shown in the
README is the wiring that is asserted — without opening a socket or needing an
instance to report to.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import Any

import pytest

import dolshoe


class Recorder:
    """Stands in for all three ingestion endpoints."""

    def __init__(self) -> None:
        self.reports: list[Any] = []
        self.records: list[Any] = []
        self.spans: list[Any] = []

    def send(self, payload: Any) -> None:  # error reports
        self.reports.append(payload)

    def send_logs(self, records: list[Any]) -> None:
        self.records.extend(records)

    def send_spans(self, spans: list[Any]) -> None:
        self.spans.extend(spans)


class _Logs:
    def __init__(self, recorder: Recorder) -> None:
        self._recorder = recorder

    def send(self, records: list[Any]) -> None:
        self._recorder.send_logs(records)


class _Spans:
    def __init__(self, recorder: Recorder) -> None:
        self._recorder = recorder

    def send(self, spans: list[Any]) -> None:
        self._recorder.send_spans(spans)


@pytest.fixture
def recorder() -> Iterator[Recorder]:
    collected = Recorder()
    dolshoe.init(
        service={"name": "checkout-api", "environment": "test"},
        transport=collected,
        log_transport=_Logs(collected),
        span_transport=_Spans(collected),
        capture_unhandled_errors=False,
    )
    dolshoe.install_logging_handler(level=logging.INFO)
    yield collected
    dolshoe.close()


def test_fastapi_correlates_a_log_with_the_request_span(recorder: Recorder) -> None:
    from fastapi.testclient import TestClient

    import fastapi_app

    with TestClient(fastapi_app.app) as client:
        response = client.get("/orders/order-123")
    assert response.status_code == 200
    dolshoe.flush()

    server = next(span for span in recorder.spans if span["kind"] == "server")
    assert server["name"] == "GET /orders/order-123"
    assert server["attributes"]["http.response.status_code"] == 200

    # The log line inside `price_basket`, which was handed no span at all.
    priced = next(r for r in recorder.records if r["message"] == "Basket priced")
    assert priced["trace"]["traceId"] == server["traceId"]
    assert priced["attributes"]["order_id"] == "order-123"


def test_fastapi_reports_an_escaping_error_exactly_once(recorder: Recorder) -> None:
    """An exception leaving a span is reported by the span, and only by it.

    The route deliberately does not also call `capture_exception`; doing both
    is the easy mistake, and it stores the same failure twice.
    """
    from fastapi.testclient import TestClient

    import fastapi_app

    with TestClient(fastapi_app.app) as client:
        assert client.get("/orders/missing").status_code == 404
    dolshoe.flush()

    reports = [r for r in recorder.reports if r["exception"]["type"] == "LookupError"]
    assert len(reports) == 1

    server = next(span for span in recorder.spans if span["kind"] == "server")
    failed = next(span for span in recorder.spans if span["name"] == "price basket")
    assert failed["status"]["code"] == "error"
    assert failed["attributes"]["order_id"] == "missing"
    assert reports[0]["trace"]["spanId"] == failed["spanId"]
    assert reports[0]["trace"]["traceId"] == server["traceId"]
    assert reports[0]["mechanism"] == {"type": "span", "handled": True}


def test_django_middleware_measures_and_reports(recorder: Recorder) -> None:
    import django_app

    if not _django_configured():
        django_app.configure()

    from django.test import Client

    client = Client()
    assert client.get("/orders/order-123").status_code == 200
    dolshoe.flush()

    server = next(span for span in recorder.spans if span["kind"] == "server")
    assert server["name"] == "GET /orders/order-123"
    priced = next(r for r in recorder.records if r["message"] == "Basket priced")
    assert priced["trace"]["traceId"] == server["traceId"]


def test_django_reports_an_unhandled_error_through_process_exception(
    recorder: Recorder,
) -> None:
    """Django turns an unhandled exception into a 500 before it can reach
    `sys.excepthook`, which is why the middleware hook exists."""
    import django_app

    if not _django_configured():
        django_app.configure()

    from django.test import Client

    client = Client(raise_request_exception=False)
    assert client.get("/boom").status_code == 500
    dolshoe.flush()

    report = next(r for r in recorder.reports if r["exception"]["type"] == "RuntimeError")
    assert report["mechanism"] == {"type": "django.middleware", "handled": True}


def _django_configured() -> bool:
    from django.conf import settings

    return settings.configured
