"""Drives both example apps through their test clients.

An example that is never executed rots quietly. These run the real middleware
and the real routes against a recording transport, so the wiring shown in the
README is the wiring that is asserted — without opening a socket or needing an
instance to report to.

Everything here uses `dolshoe.testing`, which is the same thing an application
instrumenting itself would use. That is deliberate: if the examples needed
private helpers to be testable, so would everybody else.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

import dolshoe
from dolshoe.testing import CapturedTelemetry, capture_telemetry


@pytest.fixture
def captured() -> Iterator[CapturedTelemetry]:
    with capture_telemetry(service={"name": "checkout-api", "environment": "test"}) as telemetry:
        dolshoe.install_logging_handler()
        yield telemetry


def test_fastapi_correlates_a_log_with_the_request_span(captured: CapturedTelemetry) -> None:
    from fastapi.testclient import TestClient

    import fastapi_app

    with TestClient(fastapi_app.app) as client:
        assert client.get("/orders/order-123").status_code == 200

    assert captured.span_tree() == [("GET /orders/order-123", [("price basket", [])])]

    server = captured.span_named("GET /orders/order-123")
    assert server["kind"] == "server"
    assert server["attributes"]["http.response.status_code"] == 200

    # The log line inside `price_basket`, which was handed no span at all.
    priced = next(r for r in captured.records if r["message"] == "Basket priced")
    assert priced["trace"]["traceId"] == server["traceId"]
    assert priced["attributes"]["order_id"] == "order-123"


def test_fastapi_reports_an_escaping_error_exactly_once(captured: CapturedTelemetry) -> None:
    """An exception leaving a span is reported by the span, and only by it.

    The route deliberately does not also call `capture_exception`; doing both
    is the easy mistake, and it stores the same failure twice.
    """
    from fastapi.testclient import TestClient

    import fastapi_app

    with TestClient(fastapi_app.app) as client:
        assert client.get("/orders/missing").status_code == 404

    reports = [r for r in captured.reports if r["exception"]["type"] == "LookupError"]
    assert len(reports) == 1

    failed = captured.span_named("price basket")
    assert failed["status"] == {"code": "error", "message": "no basket for missing"}
    assert failed["attributes"]["order_id"] == "missing"
    assert reports[0]["trace"]["spanId"] == failed["spanId"]
    assert reports[0]["mechanism"] == {"type": "span", "handled": True}


def test_django_middleware_measures_and_reports(captured: CapturedTelemetry) -> None:
    import django_app

    if not _django_configured():
        django_app.configure()

    from django.test import Client

    assert Client().get("/orders/order-123").status_code == 200

    assert captured.span_tree() == [("GET /orders/order-123", [("price basket", [])])]

    server = captured.span_named("GET /orders/order-123")
    priced = next(r for r in captured.records if r["message"] == "Basket priced")
    assert priced["trace"]["traceId"] == server["traceId"]


def test_django_reports_an_unhandled_error_through_process_exception(
    captured: CapturedTelemetry,
) -> None:
    """Django turns an unhandled exception into a 500 before it can reach
    `sys.excepthook`, which is why the middleware hook exists."""
    import django_app

    if not _django_configured():
        django_app.configure()

    from django.test import Client

    assert Client(raise_request_exception=False).get("/boom").status_code == 500

    report = next(r for r in captured.reports if r["exception"]["type"] == "RuntimeError")
    assert report["mechanism"] == {"type": "django.middleware", "handled": True}


def _django_configured() -> bool:
    from django.conf import settings

    return settings.configured
