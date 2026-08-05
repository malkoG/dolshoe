"""The background thread that delivers everything the application captures.

`capture_exception` and friends return an event id before any request is made,
the same as the JavaScript reporter, which fires and forgets onto a microtask.
Python has no microtask, so delivery happens on one worker thread fed by a
queue. What "never blocks" means here is that the calling thread does no I/O —
it does still do the work of normalizing an exception, deliberately, because a
traceback deferred to another thread may have lost the frames it describes.
"""

from __future__ import annotations

import atexit
import contextlib
import os
import queue
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Union

from .types import ErrorReport, FinishedSpan, LogRecord

MAX_LOG_BATCH_SIZE = 100
MAX_SPAN_BATCH_SIZE = 100
DEFAULT_MAX_QUEUE_SIZE = 10_000


@dataclass(slots=True)
class FlushRequest:
    """A marker the worker answers once everything queued before it has gone."""

    event: threading.Event = field(default_factory=threading.Event)
    failures: int = 0


@dataclass(slots=True)
class _Item:
    kind: Literal["error", "log", "span", "flush"]
    payload: Union[ErrorReport, LogRecord, FinishedSpan, FlushRequest]  # noqa: UP007


ErrorSender = Callable[[ErrorReport], None]
LogSender = Callable[[list[LogRecord]], None]
SpanSender = Callable[[list[FinishedSpan]], None]
FailureReporter = Callable[[str, BaseException, list[Any]], None]


class DeliveryWorker:
    """Owns the queue, the thread, and the batching rules."""

    def __init__(
        self,
        *,
        send_error: ErrorSender,
        send_logs: LogSender | None,
        send_spans: SpanSender | None,
        on_failure: FailureReporter,
        max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE,
    ) -> None:
        self._send_error = send_error
        self._send_logs = send_logs
        self._send_spans = send_spans
        self._on_failure = on_failure
        self._max_queue_size = max_queue_size

        self._queue: queue.Queue[_Item | None] = queue.Queue(maxsize=max_queue_size)
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._log_batch: list[LogRecord] = []
        self._span_batch: list[FinishedSpan] = []

        self._failures = 0
        self._acknowledged_failures = 0
        self._dropped = 0
        self._stopped = False

        atexit.register(self._at_exit)
        if hasattr(os, "register_at_fork"):
            # A worker thread does not survive `fork()`, and gunicorn's sync
            # worker and uWSGI both fork after the master has imported the
            # application. Without this the child enqueues into a queue nothing
            # is draining: the reporter is silently, completely dead in
            # production while working perfectly in development.
            os.register_at_fork(after_in_child=self._after_fork_in_child)

    # -- enqueueing -------------------------------------------------------

    def submit_error(self, report: ErrorReport) -> None:
        self._put(_Item("error", report))

    def submit_log(self, record: LogRecord) -> None:
        self._put(_Item("log", record))

    def submit_span(self, span: FinishedSpan) -> None:
        self._put(_Item("span", span))

    def _put(self, item: _Item) -> None:
        if self._stopped:
            return
        self._ensure_started()
        try:
            self._queue.put_nowait(item)
        except queue.Full:
            # The JavaScript client's queue is an unbounded array, which is a
            # latent memory leak in a process that cannot reach its instance.
            # Blocking here would break the promise that capturing is cheap, so
            # the only option left is to drop and say so.
            self._dropped += 1
            self._failures += 1

    def _ensure_started(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            # Started lazily rather than in `init()`, so a process that imports
            # the application and forks without capturing never pays for a
            # thread — and so the post-fork restart below costs nothing.
            self._thread = threading.Thread(
                target=self._run, name="dolshoe-delivery", daemon=True
            )
            self._thread.start()

    # -- the thread -------------------------------------------------------

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                return
            self._handle(item)

            # Drain whatever else is already waiting so batches form under load,
            # then send the partial batch as soon as the queue goes quiet. This
            # is the role the JavaScript client gives a microtask: no timer, and
            # nothing sits waiting for a batch that may never fill.
            stopping = False
            while True:
                try:
                    queued = self._queue.get_nowait()
                except queue.Empty:
                    break
                if queued is None:
                    stopping = True
                    break
                self._handle(queued)

            self._send_batches()
            if stopping:
                return

    def _handle(self, item: _Item) -> None:
        if item.kind == "error":
            self._send("error report", self._send_error, item.payload)
        elif item.kind == "log":
            self._log_batch.append(item.payload)  # type: ignore[arg-type]
            if len(self._log_batch) >= MAX_LOG_BATCH_SIZE:
                self._send_log_batch()
        elif item.kind == "span":
            self._span_batch.append(item.payload)  # type: ignore[arg-type]
            if len(self._span_batch) >= MAX_SPAN_BATCH_SIZE:
                self._send_span_batch()
        else:
            request = item.payload
            assert isinstance(request, FlushRequest)
            # Everything enqueued before this marker has already been handled,
            # because the queue is FIFO. Only the partial batches remain.
            self._send_batches()
            request.failures = self._failures
            request.event.set()

    def _send_batches(self) -> None:
        self._send_log_batch()
        self._send_span_batch()

    def _send_log_batch(self) -> None:
        if not self._log_batch or self._send_logs is None:
            self._log_batch.clear()
            return
        batch, self._log_batch = self._log_batch, []
        self._send("log record", self._send_logs, batch)

    def _send_span_batch(self) -> None:
        if not self._span_batch or self._send_spans is None:
            self._span_batch.clear()
            return
        batch, self._span_batch = self._span_batch, []
        self._send("span", self._send_spans, batch)

    def _send(self, what: str, send: Callable[[Any], None], payload: Any) -> None:
        try:
            send(payload)
        except BaseException as error:
            # A delivery failure must never escape this thread: it would kill the
            # worker and take every later event with it. It is counted, so
            # `flush()` can report it, and handed to the application's callback.
            self._failures += 1
            items = payload if isinstance(payload, list) else [payload]
            # An application's own callback raising must not be able to stop
            # delivery either.
            with contextlib.suppress(BaseException):
                self._on_failure(what, error, items)

    # -- flushing and shutdown -------------------------------------------

    def flush(self, timeout: float = 2.0) -> bool:
        """Wait for everything queued so far, and report whether it all landed.

        Returns False on timeout without consuming the failure count, so a
        caller that times out and tries again still learns about the failure.
        """
        if self._dropped:
            self._dropped = 0

        if self._thread is None or not self._thread.is_alive():
            # Nothing was ever enqueued, or the worker is gone. Either way there
            # is nothing outstanding; report any failures already counted.
            return self._acknowledge()

        request = FlushRequest()
        try:
            self._queue.put_nowait(_Item("flush", request))
        except queue.Full:
            return False

        if not request.event.wait(timeout):
            return False
        return self._acknowledge(request.failures)

    def _acknowledge(self, failures: int | None = None) -> bool:
        observed = self._failures if failures is None else failures
        succeeded = observed == self._acknowledged_failures
        self._acknowledged_failures = observed
        return succeeded

    def close(self, timeout: float = 2.0) -> bool:
        flushed = self.flush(timeout)
        self._stopped = True
        thread = self._thread
        if thread is not None and thread.is_alive():
            self._queue.put(None)
            thread.join(timeout)
        self._thread = None
        return flushed

    def _at_exit(self) -> None:
        """Flush on the way out.

        `atexit` handlers run before daemon threads are killed, which is what
        makes the pair work: the thread cannot hold a dying process open, and
        the tail of the queue still gets sent. It does not run for `os._exit()`,
        `SIGKILL`, or a fatal signal — nothing in-process can.
        """
        if self._thread is not None and self._thread.is_alive():
            self.flush(2.0)

    def _after_fork_in_child(self) -> None:
        """Rebuild state a fork left behind.

        The child has this object's memory but not its thread. Anything still
        queued belongs to the parent, which is sending it, so re-sending here
        would duplicate it — the queue is replaced rather than inherited.
        """
        self._queue = queue.Queue(maxsize=self._max_queue_size)
        self._lock = threading.Lock()
        self._thread = None
        self._log_batch = []
        self._span_batch = []
