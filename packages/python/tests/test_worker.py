"""The delivery thread: backpressure, forking, and shutdown.

These are the paths that fail silently when they fail. A dropped queue looks
exactly like a quiet service, and a forked worker that never restarted looks
exactly like an application that stopped erroring — which is why each one is
driven here rather than reasoned about.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
import threading

import pytest
from conftest import Collected

from dolshoe.worker import DeliveryWorker

_REPORT = {"schemaVersion": 1, "eventId": "e", "occurredAt": "2026-08-05T00:00:00.000Z"}


def test_a_full_queue_drops_instead_of_blocking() -> None:
    """The JavaScript client's queue is an unbounded array, which is a memory
    leak in a process that cannot reach its instance. Blocking here would break
    the promise that capturing is cheap, so the only option left is to drop."""
    blocked = threading.Event()
    released = threading.Event()
    sent: list[object] = []

    def send(report: object) -> None:
        blocked.set()
        released.wait(5.0)
        sent.append(report)

    worker = DeliveryWorker(
        send_error=send,
        send_logs=None,
        send_spans=None,
        on_failure=lambda *args: None,
        max_queue_size=4,
    )
    try:
        worker.submit_error(_REPORT)  # type: ignore[arg-type]
        assert blocked.wait(5.0)

        # The worker is stuck in `send`, so these fill the queue and then spill.
        # The point is that this loop returns at all.
        for _ in range(50):
            worker.submit_error(_REPORT)  # type: ignore[arg-type]

        released.set()
        # Dropping is a failure, and flush is where a failure surfaces.
        assert worker.flush(5.0) is False
    finally:
        released.set()
        worker.close(5.0)


def test_capturing_from_many_threads_loses_nothing(collected: Collected) -> None:
    def capture(index: int) -> None:
        for step in range(20):
            collected.client.capture_log("info", f"thread {index} step {step}")

    threads = [threading.Thread(target=capture, args=(index,)) for index in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    collected.flush()

    assert len(collected.records) == 160
    assert len({record["eventId"] for record in collected.records}) == 160


def test_the_worker_restarts_after_a_fork_in_the_child() -> None:
    """The child has the object's memory but not its thread.

    Anything still queued belongs to the parent, which is sending it, so the
    queue is replaced rather than inherited — re-sending would duplicate it.
    """
    sent: list[object] = []
    worker = DeliveryWorker(
        send_error=sent.append,
        send_logs=None,
        send_spans=None,
        on_failure=lambda *args: None,
    )
    try:
        worker.submit_error(_REPORT)  # type: ignore[arg-type]
        assert worker.flush(5.0) is True
        assert len(sent) == 1

        # What `os.register_at_fork(after_in_child=...)` runs.
        worker._after_fork_in_child()
        assert worker._thread is None

        worker.submit_error(_REPORT)  # type: ignore[arg-type]
        assert worker.flush(5.0) is True
        assert len(sent) == 2
    finally:
        worker.close(5.0)


_FORK_SCRIPT = """
import os, sys
import dolshoe

class Transport:
    def send(self, report):
        sys.stdout.write(report["exception"]["message"] + "\\n")
        sys.stdout.flush()

dolshoe.init(
    service={"name": "checkout-api"},
    transport=Transport(),
    capture_unhandled_errors=False,
)

# Start the worker in the parent, so the child inherits a worker that is
# recorded as running but whose thread does not exist.
dolshoe.capture_message("from parent")
dolshoe.flush()

pid = os.fork()
if pid == 0:
    dolshoe.capture_message("from child")
    dolshoe.flush()
    os._exit(0)

os.waitpid(pid, 0)
"""


@pytest.mark.skipif(not hasattr(os, "fork"), reason="POSIX only")
def test_a_real_forked_child_still_delivers() -> None:
    """The scenario gunicorn and uWSGI create on every worker start."""
    result = subprocess.run(
        [sys.executable, "-c", textwrap.dedent(_FORK_SCRIPT)],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "from parent" in result.stdout
    assert "from child" in result.stdout, (
        "the forked child delivered nothing: its worker thread never restarted"
    )


_ATEXIT_SCRIPT = """
import sys
import dolshoe

class Transport:
    def send(self, report):
        sys.stdout.write("delivered\\n")
        sys.stdout.flush()

dolshoe.init(
    service={"name": "checkout-api"},
    transport=Transport(),
    capture_unhandled_errors=False,
)

# Deliberately no flush() and no close(): `atexit` is the only thing that can
# get this out of the process.
dolshoe.capture_message("on the way out")
"""


def test_the_tail_of_the_queue_is_flushed_at_exit() -> None:
    result = subprocess.run(
        [sys.executable, "-c", textwrap.dedent(_ATEXIT_SCRIPT)],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "delivered" in result.stdout, (
        "nothing was sent: the atexit flush did not run before the daemon "
        "thread was killed"
    )
