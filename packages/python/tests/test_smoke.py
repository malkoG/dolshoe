"""End to end over a real socket.

Every other test injects a transport, which is right for asserting behaviour
but means the code an application actually runs — `urllib`, the JSON encoding,
the headers, the status handling — never executes. This one starts a real HTTP
server on loopback and points a DSN-configured client at it, so the request
line, the bearer credential, and the three DSN-derived paths are checked rather
than assumed.

It stands in for the Dolshoe API deliberately: it asserts what the reporter
sends without needing an instance, a database, or a token to exist.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from conftest import PROJECT_ID, TOKEN

from dolshoe.client import Client
from dolshoe.errors import DolshoeTransportError
from dolshoe.transport import HttpTransport


@dataclass
class Received:
    path: str
    headers: dict[str, str]
    body: Any


@dataclass
class FakeInstance:
    url: str
    requests: list[Received] = field(default_factory=list)
    status: int = 201

    def paths(self) -> list[str]:
        return [request.path for request in self.requests]

    def by_suffix(self, suffix: str) -> Received:
        return next(r for r in self.requests if r.path.endswith(suffix))


@pytest.fixture
def instance() -> Iterator[FakeInstance]:
    state = FakeInstance(url="")

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers.get("content-length", "0"))
            raw = self.rfile.read(length)
            state.requests.append(
                Received(
                    path=self.path,
                    headers={key.lower(): value for key, value in self.headers.items()},
                    body=json.loads(raw) if raw else None,
                )
            )
            self.send_response(state.status)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *args: Any) -> None:
            """Quiet: the default handler writes every request to stderr."""

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    state.url = f"http://127.0.0.1:{server.server_port}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(5.0)


def _client(instance: FakeInstance, **options: Any) -> Client:
    return Client(
        service={"name": "checkout-api", "environment": "test"},
        runtime={"name": "cpython", "version": "3.14.6"},
        reporter={"name": "dolshoe-python", "version": "0.1.0"},
        dsn=f"http://{TOKEN}@127.0.0.1:{_port(instance)}/{PROJECT_ID}",
        **options,
    )


def _port(instance: FakeInstance) -> str:
    return instance.url.rsplit(":", 1)[-1]


def test_reaches_all_three_endpoints_a_dsn_derives(instance: FakeInstance) -> None:
    client = _client(instance)
    try:
        with client.with_span("POST /orders", kind="server"):
            client.capture_log("info", "Order submitted", category=["checkout"])
            client.capture_exception(ValueError("payment declined"))
        assert client.flush(5.0) is True
    finally:
        client.close(5.0)

    base = f"/api/v1/projects/{PROJECT_ID}"
    assert sorted(instance.paths()) == sorted(
        [f"{base}/error-reports", f"{base}/log-records", f"{base}/traces"]
    )


def test_sends_the_credential_and_content_type_on_every_request(
    instance: FakeInstance,
) -> None:
    client = _client(instance)
    try:
        client.capture_message("worker stopped")
        client.flush(5.0)
    finally:
        client.close(5.0)

    for request in instance.requests:
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        assert request.headers["content-type"] == "application/json"
        assert request.headers["accept"] == "application/json"


def test_the_error_report_arrives_as_the_contract_describes(
    instance: FakeInstance,
) -> None:
    client = _client(instance)
    try:
        try:
            raise ValueError("payment declined")
        except ValueError as error:
            client.capture_exception(error, attributes={"order_id": "order-123"})
        client.flush(5.0)
    finally:
        client.close(5.0)

    report = instance.by_suffix("/error-reports").body
    assert report["schemaVersion"] == 1
    assert report["occurredAt"].endswith("Z")
    assert report["service"] == {"name": "checkout-api", "environment": "test"}
    assert report["runtime"] == {"name": "cpython", "version": "3.14.6"}
    assert report["reporter"] == {"name": "dolshoe-python", "version": "0.1.0"}
    assert report["exception"]["type"] == "ValueError"
    assert report["exception"]["frames"][0]["inApp"] is True
    assert report["attributes"] == {"order_id": "order-123"}


def test_log_records_arrive_in_the_versioned_envelope(instance: FakeInstance) -> None:
    client = _client(instance)
    try:
        client.capture_log("info", "Order submitted", category=["checkout", "orders"])
        client.flush(5.0)
    finally:
        client.close(5.0)

    batch = instance.by_suffix("/log-records").body
    assert batch["schemaVersion"] == 1
    assert len(batch["records"]) == 1
    record = batch["records"][0]
    assert record["level"] == "info"
    assert record["category"] == ["checkout", "orders"]


def test_spans_arrive_as_otlp_json(instance: FakeInstance) -> None:
    client = _client(instance)
    try:
        with client.with_span("POST /orders", kind="server"):
            pass
        client.flush(5.0)
    finally:
        client.close(5.0)

    export = instance.by_suffix("/traces").body
    resource = export["resourceSpans"][0]["resource"]["attributes"]
    assert {"key": "telemetry.sdk.language", "value": {"stringValue": "python"}} in resource

    span = export["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    assert span["kind"] == 2
    assert len(span["traceId"]) == 32
    assert len(span["spanId"]) == 16
    # Decimal strings, because proto3 JSON says an int64 is a string.
    assert span["startTimeUnixNano"].isdigit()


def test_a_rejected_request_is_reported_and_flush_says_so(
    instance: FakeInstance,
) -> None:
    """A 400 is the payload being wrong, and no amount of retrying fixes it."""
    instance.status = 400
    failures: list[BaseException] = []

    client = _client(
        instance,
        on_transport_error=lambda what, error, items: failures.append(error),
    )
    try:
        client.capture_message("worker stopped")
        assert client.flush(5.0) is False
    finally:
        client.close(5.0)

    assert len(failures) == 1
    error = failures[0]
    assert isinstance(error, DolshoeTransportError)
    assert error.status == 400
    assert "will never succeed on retry" in str(error)


def test_an_unreachable_instance_does_not_reach_the_application() -> None:
    """Nothing is listening on this port. The capture still returns an id and
    the failure surfaces through flush, not by raising at the call site."""
    transport = HttpTransport("http://127.0.0.1:1/api/v1/projects/x/error-reports")
    client = Client(
        service={"name": "checkout-api"},
        runtime={"name": "cpython"},
        reporter={"name": "dolshoe-python"},
        transport=transport,
    )
    try:
        assert client.capture_message("worker stopped") is not None
        assert client.flush(5.0) is False
    finally:
        client.close(5.0)
