"""Client behaviour: what gets built, when it is sent, and what flush means."""

from __future__ import annotations

import pytest
from conftest import DSN, PROJECT_ID, TOKEN, Collected, RecordingTransport

import dolshoe
from dolshoe.client import Client
from dolshoe.errors import DolshoeConfigurationError


def test_returns_an_event_id_before_anything_is_sent(collected: Collected) -> None:
    """The call must not wait on delivery — that is the whole promise."""
    event_id = collected.client.capture_message("worker stopped")

    assert event_id is not None
    assert collected.reports == []

    assert collected.flush() is True
    assert [report["eventId"] for report in collected.reports] == [event_id]


def test_builds_the_report_the_contract_expects(collected: Collected) -> None:
    collected.client.capture_message("worker stopped", attributes={"queue": "settlement"})
    collected.flush()

    report = collected.reports[0]
    assert report["schemaVersion"] == 1
    assert report["occurredAt"].endswith("Z")
    assert report["service"] == {"name": "checkout-api"}
    assert report["runtime"] == {"name": "cpython", "version": "3.14.6"}
    assert report["reporter"] == {"name": "dolshoe-python", "version": "0.1.0"}
    assert report["exception"] == {"type": "Message", "message": "worker stopped"}
    assert report["attributes"] == {"queue": "settlement"}


def test_omits_absent_keys_rather_than_sending_null(collected: Collected) -> None:
    """The server's schemas are `.strict()`, and `null` is not the same as absent."""
    collected.client.capture_message("worker stopped")
    collected.flush()

    report = collected.reports[0]
    assert "trace" not in report
    assert "attributes" not in report
    assert "mechanism" not in report


def test_module_functions_are_inert_without_a_client() -> None:
    """An unconfigured reporter must not stop the application working."""
    dolshoe.set_current_client(None)

    assert dolshoe.capture_exception(RuntimeError("boom")) is None
    assert dolshoe.capture_message("hello") is None
    assert dolshoe.capture_log("info", "hello") is None
    assert dolshoe.start_span("work") is None
    assert dolshoe.active_span() is None
    assert dolshoe.flush() is True

    ran = False
    with dolshoe.with_span("work") as span:
        ran = True
        assert span is None
    assert ran


def test_capture_log_rejects_bad_input_at_the_call_site(collected: Collected) -> None:
    with pytest.raises(ValueError, match="unsupported log level"):
        collected.client.capture_log("verbose", "hello")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="must not be empty"):
        collected.client.capture_log("info", "")
    with pytest.raises(ValueError, match="cannot exceed 16 segments"):
        collected.client.capture_log("info", "hello", category=["a"] * 17)
    with pytest.raises(ValueError, match="between 1 and 200 characters"):
        collected.client.capture_log("info", "hello", category=["a" * 201])
    with pytest.raises(ValueError, match="between 1 and 200 characters"):
        collected.client.capture_log("info", "hello", category=["  "])


def test_capture_log_without_a_log_destination_says_so() -> None:
    client = Client(
        service={"name": "checkout-api"},
        runtime={"name": "cpython"},
        reporter={"name": "dolshoe-python"},
        transport=RecordingTransport(),
    )
    with pytest.raises(DolshoeConfigurationError, match="requires log_endpoint or log_transport"):
        client.capture_log("info", "hello")
    client.close(1.0)


def test_never_sends_a_batch_larger_than_the_server_accepts(collected: Collected) -> None:
    """A batch over 100 is rejected outright, so the cap is the contract.

    The worker sends a partial batch as soon as the queue goes quiet, so how
    250 records divide up depends on how the producing and delivering threads
    interleave — asserting an exact split would be asserting a race. What must
    hold every time is the bound and that nothing is lost.
    """
    for index in range(250):
        collected.client.capture_log("info", f"record {index}")
    collected.flush()

    sizes = [len(batch) for batch in collected.log_transport.batches]
    assert sizes, "expected at least one batch"
    assert max(sizes) <= 100
    assert sum(sizes) == 250
    assert len(collected.records) == 250


def test_fills_a_batch_to_one_hundred_when_records_are_waiting(collected: Collected) -> None:
    """Holding delivery closed lets the queue build, and then batches reach 100.

    The worker may already have taken the first record or two before the gate
    shut, so the opening batch is not fixed — but with a backlog waiting, the
    batches that follow must fill to the cap rather than trickle out one by one.
    """
    collected.log_transport.gate.clear()
    for index in range(250):
        collected.client.capture_log("info", f"record {index}")
    collected.log_transport.gate.set()
    collected.flush()

    sizes = [len(batch) for batch in collected.log_transport.batches]
    assert 100 in sizes
    assert max(sizes) <= 100
    assert sum(sizes) == 250


def test_flush_reports_a_failure_once_and_then_forgets_it(collected: Collected) -> None:
    """The failure flag is consumed by a successful flush, as in the JS client."""
    collected.transport.fail_next = True
    collected.client.capture_message("worker stopped")

    assert collected.flush() is False
    assert collected.flush() is True


def test_close_stops_accepting_captures(collected: Collected) -> None:
    assert collected.client.close(5.0) is True

    assert collected.client.capture_message("after close") is None
    assert collected.client.capture_log("info", "after close") is None


def test_a_dsn_configures_every_endpoint_and_the_credential() -> None:
    requests: list[tuple[str, dict[str, str]]] = []

    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        requests.append((url, headers))
        return 201, b""

    client = Client(
        service={"name": "checkout-api"},
        runtime={"name": "cpython"},
        reporter={"name": "dolshoe-python"},
        dsn=DSN,
        url_open=url_open,
    )
    client.capture_message("worker stopped")
    assert client.flush(5.0) is True
    client.close(5.0)

    url, headers = requests[0]
    assert url == f"https://dolshoe.example/api/v1/projects/{PROJECT_ID}/error-reports"
    assert headers["authorization"] == f"Bearer {TOKEN}"
    assert headers["content-type"] == "application/json"


def test_explicit_endpoint_and_header_override_the_dsn() -> None:
    requests: list[tuple[str, dict[str, str]]] = []

    def url_open(url: str, *, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
        requests.append((url, headers))
        return 201, b""

    client = Client(
        service={"name": "checkout-api"},
        runtime={"name": "cpython"},
        reporter={"name": "dolshoe-python"},
        dsn=DSN,
        endpoint="https://proxy.internal/ingest",
        headers={"authorization": "Bearer override"},
        url_open=url_open,
    )
    client.capture_message("worker stopped")
    client.flush(5.0)
    client.close(5.0)

    url, headers = requests[0]
    assert url == "https://proxy.internal/ingest"
    assert headers["authorization"] == "Bearer override"


def test_refuses_a_client_with_no_destination_at_all() -> None:
    with pytest.raises(DolshoeConfigurationError, match="requires either dsn, endpoint"):
        Client(
            service={"name": "checkout-api"},
            runtime={"name": "cpython"},
            reporter={"name": "dolshoe-python"},
        )


def test_refuses_an_empty_service_name() -> None:
    with pytest.raises(DolshoeConfigurationError, match=r"service\.name must not be empty"):
        Client(
            service={"name": "  "},
            runtime={"name": "cpython"},
            reporter={"name": "dolshoe-python"},
            transport=RecordingTransport(),
        )


def test_before_send_can_drop_an_event(collected: Collected) -> None:
    harness = Collected(before_send=lambda report: None)
    harness.client.capture_message("dropped")
    assert harness.flush() is True
    assert harness.reports == []
    harness.client.close(5.0)
