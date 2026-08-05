"""What this reporter sends, against what the API already documents.

`apps/api/src/error-reporting/error-report.examples.ts` ships
`pythonErrorReportExample` as an OpenAPI example, and the API's own
`error-report.contract.spec.ts` asserts it against the live schema. The server
therefore already promises a shape for Python reports. This is the test that
the promise was kept.

The example is transcribed here rather than parsed out of TypeScript, so a
reviewer can diff the two by eye; the path above is the source of truth.
"""

from __future__ import annotations

import json
from typing import Any

from conftest import Collected

import dolshoe

# Field names the committed example uses, per level of the report.
EXAMPLE_TOP_LEVEL = {
    "schemaVersion",
    "eventId",
    "occurredAt",
    "service",
    "runtime",
    "reporter",
    "mechanism",
    "exception",
}
EXAMPLE_FRAME_FIELDS = {
    "moduleName",
    "functionName",
    "fileName",
    "lineNumber",
    "sourceLine",
    "inApp",
    "origin",
    "preContext",
    "postContext",
}


def _settle_invoices() -> None:
    """Shaped like the example: a group of two, one with frames."""

    def charge() -> None:
        raise TimeoutError("processor timed out")

    errors: list[Exception] = []
    try:
        charge()
    except TimeoutError as error:
        errors.append(error)
    errors.append(ValueError("currency is missing"))
    raise ExceptionGroup("settlement failures", errors)


def _report(collected: Collected) -> dict[str, Any]:
    try:
        _settle_invoices()
    except ExceptionGroup as group:
        collected.client.capture_exception(
            group, mechanism={"type": "sys.excepthook", "handled": False}
        )
    collected.flush()
    return dict(collected.reports[0])


def test_the_report_carries_every_field_the_example_documents(
    collected: Collected,
) -> None:
    report = _report(collected)

    assert set(report) >= EXAMPLE_TOP_LEVEL
    assert report["schemaVersion"] == 1
    assert report["mechanism"] == {"type": "sys.excepthook", "handled": False}


def test_the_identity_matches_the_one_the_api_advertises(
    collected: Collected,
) -> None:
    """`runtime.name: cpython` and `reporter.name: dolshoe-python` are not
    decorative — a stored event names the reporter that produced it."""
    assert dolshoe.RUNTIME_NAME == "cpython"
    assert dolshoe.REPORTER_NAME == "dolshoe-python"


def test_an_exception_group_maps_onto_children(collected: Collected) -> None:
    exception = _report(collected)["exception"]

    assert exception["type"] == "ExceptionGroup"
    assert exception["message"].startswith("settlement failures")
    assert [child["type"] for child in exception["children"]] == [
        "TimeoutError",
        "ValueError",
    ]
    assert exception["children"][0]["message"] == "processor timed out"
    assert exception["children"][1]["message"] == "currency is missing"


def test_a_child_frame_carries_the_python_only_fields(collected: Collected) -> None:
    """`moduleName` and `sourceLine` are in the contract for this reporter; the
    JavaScript stack parser never fills either."""
    exception = _report(collected)["exception"]
    frame = exception["children"][0]["frames"][0]

    assert set(frame) >= EXAMPLE_FRAME_FIELDS
    assert frame["moduleName"] == __name__
    assert frame["functionName"].endswith("charge")
    assert frame["sourceLine"] == 'raise TimeoutError("processor timed out")'
    assert frame["inApp"] is True
    assert frame["origin"] == "app"


def test_the_whole_report_is_json_with_no_encoder_help(collected: Collected) -> None:
    """The transport calls `json.dumps` with no `default=`, so anything left
    unencodable would raise on the worker thread rather than being sent."""
    json.dumps(_report(collected))


def test_no_field_is_sent_as_null(collected: Collected) -> None:
    """The server's schemas are `.strict()` and treat absent and null
    differently; every optional field here is omitted, never nulled."""
    report = _report(collected)

    def assert_no_nulls(value: object, path: str = "") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                assert item is not None, f"{path}.{key} was sent as null"
                assert_no_nulls(item, f"{path}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                assert_no_nulls(item, f"{path}[{index}]")

    assert_no_nulls(report)
