"""Span mechanics: parentage, idempotent ends, and what is never sent."""

from __future__ import annotations

from conftest import Collected

from dolshoe.span import INHERIT


def test_a_child_inherits_the_trace_and_names_its_parent(collected: Collected) -> None:
    with (
        collected.client.with_span("POST /orders", kind="server") as parent,
        collected.client.with_span("price basket") as child,
    ):
        assert child.trace_id == parent.trace_id
        assert child.parent_span_id == parent.span_id
    collected.flush()

    assert len(collected.spans) == 2


def test_a_span_that_never_ended_is_never_sent(collected: Collected) -> None:
    """An unended span is not telemetry: a process that died mid-request should
    not leave a half-span implying the work finished."""
    collected.client.start_span("work that never finished")
    collected.flush()

    assert collected.spans == []


def test_ending_twice_reports_once(collected: Collected) -> None:
    span = collected.client.start_span("work")
    span.end()
    span.end()
    collected.flush()

    assert len(collected.spans) == 1


def test_an_end_before_the_start_is_clamped(collected: Collected) -> None:
    """A negative duration is rejected on arrival, so it never leaves here."""
    span = collected.client.start_span("work", start_time=1_000.0)
    span.end(500.0)
    collected.flush()

    finished = collected.spans[0]
    assert finished["endTimeUnixNano"] == finished["startTimeUnixNano"]


def test_start_span_does_not_activate_but_with_span_does(collected: Collected) -> None:
    import dolshoe

    span = collected.client.start_span("manual")
    assert dolshoe.active_span() is None
    span.end()

    with collected.client.with_span("scoped"):
        assert dolshoe.active_span() is not None


def test_parent_none_starts_a_new_trace_from_inside_a_span(
    collected: Collected,
) -> None:
    """Python has one empty value where JavaScript has two, so `parent=None`
    carries the meaning JavaScript gives `null`: detach, do not inherit."""
    with collected.client.with_span("outer") as outer:
        with collected.client.with_span("detached", parent=None) as detached:
            assert detached.trace_id != outer.trace_id
            assert detached.parent_span_id is None

        with collected.client.with_span("attached", parent=INHERIT) as attached:
            assert attached.trace_id == outer.trace_id


def test_attributes_and_status_are_ignored_after_the_end(collected: Collected) -> None:
    span = collected.client.start_span("work")
    span.end()
    span.set_attributes({"late": True})
    span.set_status("error", "too late")
    collected.flush()

    finished = collected.spans[0]
    assert "attributes" not in finished
    assert finished["status"] == {"code": "unset"}


def test_attributes_are_sanitized_on_the_way_in(collected: Collected) -> None:
    with collected.client.with_span("work", attributes={"token": "secret"}) as span:
        span.set_attributes({"http.route": "/orders"})
    collected.flush()

    assert collected.spans[0]["attributes"] == {
        "token": "[REDACTED]",
        "http.route": "/orders",
    }
