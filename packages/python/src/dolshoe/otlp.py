"""Finished spans, as an OTLP/HTTP JSON export request.

A port of `packages/core/src/otlp.ts`, and the mirror image of the API's
`otlp-spans.ts`: what this writes, that reads. Kept apart from the transport so
it can be tested without a network.
"""

from __future__ import annotations

from typing import Any

from .types import (
    FinishedSpan,
    JsonValue,
    ReporterInfo,
    RuntimeInfo,
    ServiceInfo,
    SpanKind,
    SpanStatus,
    SpanStatusCode,
)

SPAN_KIND_NUMBERS: dict[SpanKind, int] = {
    "internal": 1,
    "server": 2,
    "client": 3,
    "producer": 4,
    "consumer": 5,
}

STATUS_CODE_NUMBERS: dict[SpanStatusCode, int] = {
    "unset": 0,
    "ok": 1,
    "error": 2,
}


def to_any_value(value: JsonValue) -> dict[str, Any]:
    """Encode one attribute value in OTLP's `AnyValue` union."""
    # `bool` before `int`, because `isinstance(True, int)` is True in Python and
    # a flag silently arriving as the integer 1 is the classic version of this
    # bug. The JavaScript original has no such hazard.
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, int):
        # proto3 JSON says an int64 is a string.
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if value is None:
        return {"stringValue": ""}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_any_value(item) for item in value]}}
    return {"kvlistValue": {"values": _to_key_values(value)}}


def _to_key_values(attributes: dict[str, JsonValue]) -> list[dict[str, Any]]:
    return [{"key": key, "value": to_any_value(value)} for key, value in attributes.items()]


def _without_absent(attributes: dict[str, str | None]) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": {"stringValue": value}}
        for key, value in attributes.items()
        if value is not None
    ]


def to_otlp_trace_request(
    spans: list[FinishedSpan],
    *,
    service: ServiceInfo,
    reporter: ReporterInfo,
    runtime: RuntimeInfo,
) -> dict[str, Any]:
    """Build the export request for a batch of finished spans."""
    reporter_name = reporter.get("name", "")
    reporter_version = reporter.get("version")

    encoded_spans: list[dict[str, Any]] = []
    for span in spans:
        encoded: dict[str, Any] = {
            "traceId": span["traceId"],
            "spanId": span["spanId"],
            "name": span["name"],
            "kind": SPAN_KIND_NUMBERS[span.get("kind", "internal")],
            "startTimeUnixNano": span["startTimeUnixNano"],
            "endTimeUnixNano": span["endTimeUnixNano"],
            "attributes": _to_key_values(span.get("attributes", {})),
        }
        parent_span_id = span.get("parentSpanId")
        if parent_span_id is not None:
            encoded["parentSpanId"] = parent_span_id

        status: SpanStatus = span.get("status") or {}
        status_code: SpanStatusCode = status.get("code", "unset")
        encoded_status: dict[str, Any] = {"code": STATUS_CODE_NUMBERS[status_code]}
        status_message = status.get("message")
        if status_message is not None:
            encoded_status["message"] = status_message
        encoded["status"] = encoded_status

        encoded_spans.append(encoded)

    scope: dict[str, Any] = {"name": reporter_name}
    if reporter_version is not None:
        scope["version"] = reporter_version

    return {
        "resourceSpans": [
            {
                "resource": {
                    # The semantic-convention names, so a Dolshoe reporter's spans
                    # are indistinguishable from an OpenTelemetry SDK's once
                    # stored. Order matters only for readability; absent values
                    # are dropped rather than sent empty.
                    "attributes": _without_absent(
                        {
                            "service.name": service.get("name"),
                            "service.version": service.get("release"),
                            "deployment.environment.name": service.get("environment"),
                            "telemetry.sdk.name": reporter_name,
                            "telemetry.sdk.version": reporter_version,
                            "telemetry.sdk.language": "python",
                            "process.runtime.name": runtime.get("name"),
                            "process.runtime.version": runtime.get("version"),
                        }
                    )
                },
                "scopeSpans": [{"scope": scope, "spans": encoded_spans}],
            }
        ]
    }
