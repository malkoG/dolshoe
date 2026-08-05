"""The stdlib logging bridge."""

from __future__ import annotations

import logging
from collections.abc import Iterator

import pytest
from conftest import Collected

from dolshoe.logging_integration import DolshoeHandler, install_logging_handler


@pytest.fixture
def bridged(module_client: Collected) -> Iterator[tuple[Collected, logging.Logger]]:
    logger = logging.getLogger("checkout.orders")
    # Below DEBUG, so the custom sub-debug level in the mapping test reaches the
    # handler instead of being filtered by the logger first.
    logger.setLevel(1)
    logger.propagate = False
    handler = DolshoeHandler()
    logger.addHandler(handler)
    try:
        yield module_client, logger
    finally:
        logger.removeHandler(handler)


def test_a_plain_info_call_becomes_a_log_record(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    logger.info("Submitting order %s", "order-123")
    collected.flush()

    record = collected.records[0]
    assert record["level"] == "info"
    assert record["message"] == "Submitting order order-123"
    assert record["category"] == ["checkout", "orders"]


@pytest.mark.parametrize(
    ("levelno", "expected"),
    [
        (logging.CRITICAL, "fatal"),
        (logging.ERROR, "error"),
        (logging.WARNING, "warning"),
        (25, "info"),  # a custom level between INFO and WARNING
        (logging.INFO, "info"),
        (logging.DEBUG, "debug"),
        (5, "trace"),
    ],
)
def test_levels_map_by_threshold_so_custom_levels_work(
    bridged: tuple[Collected, logging.Logger], levelno: int, expected: str
) -> None:
    collected, logger = bridged
    logger.log(levelno, "something happened")
    collected.flush()

    assert collected.records[0]["level"] == expected


def test_an_exception_at_error_level_becomes_an_error_report(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    """Tracebacks stay first-class, matching how the LogTape bridge routes an
    `Error` found in a record's properties."""
    collected, logger = bridged
    try:
        raise ValueError("payment declined")
    except ValueError:
        logger.exception("Order failed")
    collected.flush()

    assert collected.records == []
    report = collected.reports[0]
    assert report["exception"]["type"] == "ValueError"
    assert report["mechanism"] == {"type": "logging", "handled": True}
    assert report["attributes"]["logging.logger"] == "checkout.orders"
    assert report["attributes"]["logging.message"] == "Order failed"


def test_an_exception_below_error_level_stays_a_log_record(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    try:
        raise ValueError("retrying")
    except ValueError:
        logger.warning("Retrying", exc_info=True)
    collected.flush()

    assert collected.reports == []
    record = collected.records[0]
    assert record["level"] == "warning"
    assert record["attributes"]["exception"] == {
        "type": "ValueError",
        "message": "retrying",
    }


def test_extras_become_attributes_and_builtins_do_not(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    logger.info("Order priced", extra={"order_id": "order-123", "total": 45_000})
    collected.flush()

    attributes = collected.records[0]["attributes"]
    assert attributes == {"order_id": "order-123", "total": 45_000}
    for reserved in ("msg", "args", "levelname", "pathname", "created"):
        assert reserved not in attributes


def test_trace_ids_in_the_extras_are_lifted_into_trace_context(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    """A service already propagating W3C context is correlated without adopting
    the span API at all."""
    collected, logger = bridged
    logger.info(
        "Handling request",
        extra={"trace_id": "A" * 32, "span_id": "B" * 16, "route": "/orders"},
    )
    collected.flush()

    record = collected.records[0]
    assert record["trace"] == {"traceId": "a" * 32, "spanId": "b" * 16}
    # Stored as columns, so they are not duplicated into the attributes.
    assert record["attributes"] == {"route": "/orders"}


def test_an_unparseable_trace_id_stays_an_attribute(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    logger.info("Handling request", extra={"trace_id": "nope"})
    collected.flush()

    record = collected.records[0]
    assert "trace" not in record
    assert record["attributes"] == {"trace_id": "nope"}


def test_a_log_inside_a_span_lands_on_it(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    with collected.client.with_span("POST /orders", kind="server") as span:
        logger.info("Submitting order")
    collected.flush()

    assert collected.records[0]["trace"]["spanId"] == span.span_id


def test_the_reporters_own_logger_is_never_forwarded(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    """The channel a failed send is reported on. Forwarding it would turn one
    delivery failure into an endless supply of them."""
    collected, _ = bridged
    own = logging.getLogger("dolshoe.transport")
    own.propagate = False
    handler = DolshoeHandler()
    own.addHandler(handler)
    try:
        own.error("Failed to send 1 error report(s) to Dolshoe")
        collected.flush()
    finally:
        own.removeHandler(handler)

    assert collected.records == []
    assert collected.reports == []


def test_a_failing_transport_does_not_raise_into_the_application(
    bridged: tuple[Collected, logging.Logger],
) -> None:
    collected, logger = bridged
    collected.client.close(5.0)

    # Closed client: capture_log returns None rather than raising, and the
    # handler must stay quiet either way.
    logger.info("after close")


def test_install_attaches_to_the_root_logger(module_client: Collected) -> None:
    handler = install_logging_handler(level=logging.INFO)
    root = logging.getLogger()
    try:
        logging.getLogger("billing.settle").info("Settled")
        module_client.flush()
    finally:
        root.removeHandler(handler)

    assert module_client.records[0]["category"] == ["billing", "settle"]
