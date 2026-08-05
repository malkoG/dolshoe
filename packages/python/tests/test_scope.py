"""The active span, under concurrency.

The Python answer to `packages/node/test/span-scope.test.mjs`. That test exists
because a single variable holding "the current span" makes two concurrent
requests each other's parent; here the same question has to be settled twice,
because a `ContextVar` has to serve threads and asyncio tasks alike.
"""

from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context

import pytest
from conftest import Collected

import dolshoe


def _child_of(collected: Collected, name: str, pause: float) -> None:
    with collected.client.with_span(name, kind="server"):
        # Deliberately interleaved: without per-context storage, whichever
        # request started a span last would be the parent of both.
        time.sleep(pause)
        with collected.client.with_span(f"{name} child"):
            time.sleep(pause)


def test_two_threads_do_not_become_each_others_parent(collected: Collected) -> None:
    first = threading.Thread(target=_child_of, args=(collected, "first", 0.02))
    second = threading.Thread(target=_child_of, args=(collected, "second", 0.03))
    first.start()
    second.start()
    first.join()
    second.join()
    collected.flush()

    _assert_two_independent_trees(collected)


def test_two_asyncio_tasks_do_not_become_each_others_parent(collected: Collected) -> None:
    async def request(name: str, pause: float) -> None:
        with collected.client.with_span(name, kind="server"):
            await asyncio.sleep(pause)
            with collected.client.with_span(f"{name} child"):
                await asyncio.sleep(pause)

    async def main() -> None:
        await asyncio.gather(request("first", 0.02), request("second", 0.03))

    asyncio.run(main())
    collected.flush()

    _assert_two_independent_trees(collected)


def _assert_two_independent_trees(collected: Collected) -> None:
    by_name = {span["name"]: span for span in collected.spans}
    assert set(by_name) == {"first", "first child", "second", "second child"}

    for name in ("first", "second"):
        parent = by_name[name]
        child = by_name[f"{name} child"]
        assert "parentSpanId" not in parent
        assert child["parentSpanId"] == parent["spanId"]
        assert child["traceId"] == parent["traceId"]

    assert by_name["first"]["traceId"] != by_name["second"]["traceId"]


def test_a_log_written_after_an_await_lands_on_the_active_span(
    collected: Collected,
) -> None:
    """The point of tracking the active span at all.

    Nothing hands `write_log` a span; it is written after an await, from a
    function that knows nothing about tracing, and still correlates.
    """

    async def write_log() -> None:
        await asyncio.sleep(0.01)
        collected.client.capture_log("info", "Order submitted")

    async def main() -> None:
        with collected.client.with_span("POST /orders", kind="server"):
            await write_log()

    asyncio.run(main())
    collected.flush()

    span = collected.spans[0]
    record = collected.records[0]
    assert record["trace"]["traceId"] == span["traceId"]
    assert record["trace"]["spanId"] == span["spanId"]


def test_an_error_raised_inside_a_span_is_reported_against_it(
    collected: Collected,
) -> None:
    with (
        pytest.raises(ValueError),
        collected.client.with_span("POST /orders", kind="server"),
    ):
        raise ValueError("payment declined")

    collected.flush()

    span = collected.spans[0]
    report = collected.reports[0]
    assert span["status"] == {"code": "error", "message": "payment declined"}
    assert report["trace"]["spanId"] == span["spanId"]
    assert report["mechanism"] == {"type": "span", "handled": True}


def test_the_span_does_not_leak_out_of_its_block(collected: Collected) -> None:
    with collected.client.with_span("work"):
        assert dolshoe.active_span() is not None
    assert dolshoe.active_span() is None


def test_a_thread_pool_does_not_inherit_the_active_span(collected: Collected) -> None:
    """A real limitation, asserted rather than papered over.

    `Executor.submit` does not carry the caller's context, so work handed to a
    pool starts a new trace. An application that wants the span carried across
    has to pass the context itself — which is what the second half shows.
    """
    with ThreadPoolExecutor(max_workers=1) as pool, collected.client.with_span("outer"):
        assert pool.submit(dolshoe.active_span).result() is None

        context = copy_context()
        assert context.run(dolshoe.active_span) is not None
