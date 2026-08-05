"""Fakes shared by the suite.

Nothing here opens a socket. Transports are injected rather than patched, which
is the same arrangement `packages/node/test/span-scope.test.mjs` uses, and it
keeps the unit suite database-free and network-free as CONTRIBUTING requires.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from typing import Any

import pytest

import dolshoe
from dolshoe.client import Client
from dolshoe.types import ErrorReport, FinishedSpan, LogRecord

TOKEN = "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ"
PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e"
DSN = f"https://{TOKEN}@dolshoe.example/{PROJECT_ID}"


class RecordingTransport:
    """Collects error reports, and can be told to fail."""

    def __init__(self) -> None:
        self.reports: list[ErrorReport] = []
        self.failures = 0
        self.fail_next = False
        self._lock = threading.Lock()

    def send(self, report: ErrorReport) -> None:
        with self._lock:
            if self.fail_next:
                self.fail_next = False
                self.failures += 1
                raise RuntimeError("ingestion refused the report")
            self.reports.append(report)


class RecordingLogTransport:
    def __init__(self) -> None:
        self.batches: list[list[LogRecord]] = []
        self.records: list[LogRecord] = []
        self.gate = threading.Event()
        self.gate.set()
        self._lock = threading.Lock()

    def send(self, records: list[LogRecord]) -> None:
        # Held closed, this lets a test fill the queue before the worker is
        # allowed to drain it, so batch sizes stop depending on thread timing.
        self.gate.wait(5.0)
        with self._lock:
            self.batches.append(list(records))
            self.records.extend(records)


class RecordingSpanTransport:
    def __init__(self) -> None:
        self.spans: list[FinishedSpan] = []
        self._lock = threading.Lock()

    def send(self, spans: list[FinishedSpan]) -> None:
        with self._lock:
            self.spans.extend(spans)


class Collected:
    """A client and the three transports it was built with."""

    def __init__(self, **options: Any) -> None:
        self.transport = RecordingTransport()
        self.log_transport = RecordingLogTransport()
        self.span_transport = RecordingSpanTransport()
        self.client = Client(
            service={"name": "checkout-api"},
            runtime={"name": "cpython", "version": "3.14.6"},
            reporter={"name": "dolshoe-python", "version": "0.1.0"},
            transport=self.transport,
            log_transport=self.log_transport,
            span_transport=self.span_transport,
            **options,
        )

    @property
    def reports(self) -> list[ErrorReport]:
        return self.transport.reports

    @property
    def records(self) -> list[LogRecord]:
        return self.log_transport.records

    @property
    def spans(self) -> list[FinishedSpan]:
        return self.span_transport.spans

    def flush(self, timeout: float = 5.0) -> bool:
        return self.client.flush(timeout)


@pytest.fixture
def collected() -> Iterator[Collected]:
    harness = Collected()
    yield harness
    harness.client.close(5.0)


@pytest.fixture
def module_client(collected: Collected) -> Iterator[Collected]:
    """Installs the harness client as the module-level one."""
    dolshoe.set_current_client(collected.client)
    yield collected
    dolshoe.set_current_client(None)
