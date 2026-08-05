"""The public testing surface, and the snapshots it makes possible.

Every assertion here is a whole payload rather than a hand-picked field, which
is the point of the deterministic generators: a comparison against a value you
can read catches the fields nobody thought to name, and the server's schemas
are `.strict()` about exactly those.
"""

from __future__ import annotations

import logging

from inline_snapshot import snapshot

import dolshoe
from dolshoe.testing import (
    CapturedTelemetry,
    IncrementalIdGenerator,
    TimeGenerator,
    capture_telemetry,
)


def test_ids_are_sequential_so_a_snapshot_is_stable() -> None:
    ids = IncrementalIdGenerator()

    assert ids.new_trace_id() == snapshot("00000000000000000000000000000001")
    assert ids.new_span_id() == snapshot("0000000000000001")
    assert ids.new_trace_id() == snapshot("00000000000000000000000000000002")

    ids.reset()
    assert ids.new_trace_id() == snapshot("00000000000000000000000000000001")


def test_the_clock_advances_a_second_at_a_time() -> None:
    now = TimeGenerator()

    assert now().isoformat() == snapshot("2026-01-01T00:00:00+00:00")
    assert now().isoformat() == snapshot("2026-01-01T00:00:01+00:00")


def test_a_measured_request_snapshots_whole(captured_telemetry: CapturedTelemetry) -> None:
    """The fixture is registered through the package's pytest plugin entry
    point, so a project only has to install `dolshoe` to use it."""
    with dolshoe.with_span("POST /orders", kind="server") as span:
        assert span is not None
        span.set_attributes({"http.route": "/orders"})
        with dolshoe.with_span("price basket"):
            pass

    assert captured_telemetry.spans_as_dict() == snapshot(
        [
            {
                "name": "price basket",
                "kind": "internal",
                "traceId": "00000000000000000000000000000001",
                "spanId": "0000000000000002",
                "parentSpanId": "0000000000000001",
                "status": {"code": "unset"},
                "attributes": {},
            },
            {
                "name": "POST /orders",
                "kind": "server",
                "traceId": "00000000000000000000000000000001",
                "spanId": "0000000000000001",
                "parentSpanId": None,
                "status": {"code": "unset"},
                "attributes": {"http.route": "/orders"},
            },
        ]
    )


def test_the_span_tree_reads_like_the_request_did(
    captured_telemetry: CapturedTelemetry,
) -> None:
    with dolshoe.with_span("POST /orders", kind="server"):
        with dolshoe.with_span("price basket"), dolshoe.with_span("fetch prices"):
            pass
        with dolshoe.with_span("authorize payment"):
            pass

    assert captured_telemetry.span_tree() == snapshot(
        [
            (
                "POST /orders",
                [
                    ("price basket", [("fetch prices", [])]),
                    ("authorize payment", []),
                ],
            )
        ]
    )


def test_a_log_record_snapshots_whole(captured_telemetry: CapturedTelemetry) -> None:
    dolshoe.capture_log(
        "info",
        "Order submitted",
        category=["checkout", "orders"],
        attributes={"order_id": "order-123", "token": "hunter2"},
    )

    record = captured_telemetry.records[0]
    assert record == snapshot(
        {
            "eventId": "00000000-0000-4000-8000-000000000001",
            "occurredAt": "2026-01-01T00:00:00.000Z",
            "level": "info",
            "message": "Order submitted",
            "category": ["checkout", "orders"],
            "service": {"name": "test-service"},
            "runtime": {"name": "cpython", "version": record["runtime"]["version"]},
            "reporter": {"name": "dolshoe-python", "version": "0.1.0"},
            # Redaction is visible in the payload rather than asserted separately.
            "attributes": {"order_id": "order-123", "token": "[REDACTED]"},
        }
    )


def test_span_named_says_what_was_there_when_it_misses(
    captured_telemetry: CapturedTelemetry,
) -> None:
    """A lookup that fails should not make the reader go and print the list."""
    with dolshoe.with_span("POST /orders"):
        pass

    try:
        captured_telemetry.span_named("GET /orders")
    except AssertionError as error:
        assert "found 0" in str(error)
        assert "POST /orders" in str(error)
    else:  # pragma: no cover
        raise AssertionError("expected the lookup to fail")


def test_reading_waits_for_the_worker_without_being_asked(
    captured_telemetry: CapturedTelemetry,
) -> None:
    """Delivery is on a thread, so a test that had to remember to flush would
    pass or fail on timing."""
    dolshoe.capture_message("worker stopped")

    assert len(captured_telemetry.reports) == 1


def test_the_previous_client_is_restored() -> None:
    dolshoe.set_current_client(None)
    with capture_telemetry() as captured:
        dolshoe.capture_message("inside")
        assert len(captured.reports) == 1
    assert dolshoe.get_client() is None


def test_the_logging_bridge_is_captured_too(
    captured_telemetry: CapturedTelemetry,
) -> None:
    logger = logging.getLogger("checkout.orders")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = dolshoe.DolshoeHandler()
    logger.addHandler(handler)
    try:
        with dolshoe.with_span("POST /orders", kind="server"):
            logger.info("Basket priced", extra={"total": 45_000})
    finally:
        logger.removeHandler(handler)

    record = captured_telemetry.records[0]
    assert record["category"] == snapshot(["checkout", "orders"])
    assert record["attributes"] == snapshot({"total": 45000})
    assert record["trace"] == snapshot(
        {"traceId": "00000000000000000000000000000001", "spanId": "0000000000000001"}
    )


def test_real_ids_can_still_be_asked_for() -> None:
    """Determinism is the default because it is what a test usually wants, but
    a test specifically about ids being unique needs the real thing."""
    with capture_telemetry(deterministic=False) as captured:
        with dolshoe.with_span("first"):
            pass
        with dolshoe.with_span("second"):
            pass

        trace_ids = {span["traceId"] for span in captured.spans}

    assert len(trace_ids) == 2
    assert all(len(trace_id) == 32 for trace_id in trace_ids)
