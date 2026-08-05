"""OTLP/HTTP JSON encoding — the bytes an OpenTelemetry exporter would send."""

from __future__ import annotations

from dolshoe.otlp import to_any_value, to_otlp_trace_request
from dolshoe.types import FinishedSpan, ReporterInfo, RuntimeInfo, ServiceInfo

SERVICE: ServiceInfo = {
    "name": "checkout-api",
    "environment": "production",
    "release": "2026.08.05",
}
REPORTER: ReporterInfo = {"name": "dolshoe-python", "version": "0.1.0"}
RUNTIME: RuntimeInfo = {"name": "cpython", "version": "3.14.6"}

SPAN: FinishedSpan = {
    "traceId": "a" * 32,
    "spanId": "b" * 16,
    "parentSpanId": "c" * 16,
    "name": "POST /orders",
    "kind": "server",
    "startTimeUnixNano": "1000",
    "endTimeUnixNano": "2000",
    "attributes": {"http.route": "/orders"},
    "status": {"code": "error", "message": "payment declined"},
}


def test_describes_the_resource_with_semantic_convention_names() -> None:
    request = to_otlp_trace_request([SPAN], service=SERVICE, reporter=REPORTER, runtime=RUNTIME)

    attributes = request["resourceSpans"][0]["resource"]["attributes"]
    assert attributes == [
        {"key": "service.name", "value": {"stringValue": "checkout-api"}},
        {"key": "service.version", "value": {"stringValue": "2026.08.05"}},
        {"key": "deployment.environment.name", "value": {"stringValue": "production"}},
        {"key": "telemetry.sdk.name", "value": {"stringValue": "dolshoe-python"}},
        {"key": "telemetry.sdk.version", "value": {"stringValue": "0.1.0"}},
        {"key": "telemetry.sdk.language", "value": {"stringValue": "python"}},
        {"key": "process.runtime.name", "value": {"stringValue": "cpython"}},
        {"key": "process.runtime.version", "value": {"stringValue": "3.14.6"}},
    ]


def test_absent_resource_values_are_dropped_not_sent_empty() -> None:
    request = to_otlp_trace_request(
        [SPAN], service={"name": "checkout-api"}, reporter=REPORTER, runtime=RUNTIME
    )

    keys = [entry["key"] for entry in request["resourceSpans"][0]["resource"]["attributes"]]
    assert "service.version" not in keys
    assert "deployment.environment.name" not in keys


def test_encodes_the_span_the_way_the_server_reads_it() -> None:
    request = to_otlp_trace_request([SPAN], service=SERVICE, reporter=REPORTER, runtime=RUNTIME)
    encoded = request["resourceSpans"][0]["scopeSpans"][0]["spans"][0]

    assert encoded["traceId"] == "a" * 32
    assert encoded["parentSpanId"] == "c" * 16
    assert encoded["kind"] == 2
    assert encoded["startTimeUnixNano"] == "1000"
    assert encoded["status"] == {"code": 2, "message": "payment declined"}
    assert encoded["attributes"] == [{"key": "http.route", "value": {"stringValue": "/orders"}}]


def test_a_root_span_has_no_parent_key() -> None:
    root: FinishedSpan = {**SPAN}
    del root["parentSpanId"]
    request = to_otlp_trace_request([root], service=SERVICE, reporter=REPORTER, runtime=RUNTIME)

    assert "parentSpanId" not in request["resourceSpans"][0]["scopeSpans"][0]["spans"][0]


def test_attribute_values_use_the_right_arm_of_the_union() -> None:
    # `bool` before `int`, or a flag becomes an integer on the wire.
    assert to_any_value(True) == {"boolValue": True}
    assert to_any_value(3) == {"intValue": "3"}
    assert to_any_value(3.5) == {"doubleValue": 3.5}
    assert to_any_value("x") == {"stringValue": "x"}
    assert to_any_value(None) == {"stringValue": ""}
    assert to_any_value([1, "a"]) == {
        "arrayValue": {"values": [{"intValue": "1"}, {"stringValue": "a"}]}
    }
    assert to_any_value({"k": 1}) == {
        "kvlistValue": {"values": [{"key": "k", "value": {"intValue": "1"}}]}
    }
