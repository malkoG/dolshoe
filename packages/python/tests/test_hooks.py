"""The unhandled-error hooks.

These are the paths that only run when something has already gone wrong, so
they are the easiest to ship broken and the hardest to notice. Each one is
driven directly rather than by crashing an interpreter.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any, cast

import pytest
from conftest import Collected

import dolshoe
from dolshoe.hooks import install


@pytest.fixture
def hooked(collected: Collected) -> Iterator[tuple[Collected, list[str]]]:
    """Installs the hooks over recording predecessors."""
    chained: list[str] = []

    original_except = sys.excepthook
    original_thread = threading.excepthook
    original_unraisable = sys.unraisablehook

    sys.excepthook = lambda *args: chained.append("excepthook")
    threading.excepthook = lambda *args: chained.append("threading")
    sys.unraisablehook = lambda *args: chained.append("unraisable")

    def report(exception: BaseException, *, mechanism_type: str) -> None:
        dolshoe.capture_exception(exception, mechanism={"type": mechanism_type, "handled": False})

    dolshoe.set_current_client(collected.client)
    installed = install(report, collected.client.flush)
    try:
        yield collected, chained
    finally:
        installed.uninstall()
        sys.excepthook = original_except
        threading.excepthook = original_thread
        sys.unraisablehook = original_unraisable
        dolshoe.set_current_client(None)


def _raised() -> BaseException:
    try:
        raise RuntimeError("settlement processor is unreachable")
    except RuntimeError as error:
        return error


def test_an_uncaught_exception_is_reported_and_still_printed(
    hooked: tuple[Collected, list[str]],
) -> None:
    """Chaining matters: a hook that swallowed its predecessor would delete the
    traceback the operator was going to read."""
    collected, chained = hooked
    error = _raised()

    sys.excepthook(type(error), error, error.__traceback__)
    collected.flush()

    report = collected.reports[0]
    assert report["exception"]["type"] == "RuntimeError"
    assert report["mechanism"] == {"type": "sys.excepthook", "handled": False}
    assert chained == ["excepthook"]


def test_an_exception_in_a_thread_is_reported(
    hooked: tuple[Collected, list[str]],
) -> None:
    """Without this hook a worker thread's exception is printed and lost, which
    is the most common silent failure in a threaded service."""
    collected, chained = hooked
    error = _raised()

    args = threading.ExceptHookArgs(
        (type(error), error, error.__traceback__, threading.current_thread())
    )
    threading.excepthook(args)
    collected.flush()

    assert collected.reports[0]["mechanism"] == {
        "type": "threading.excepthook",
        "handled": False,
    }
    assert chained == ["threading"]


def test_an_unraisable_error_is_reported(hooked: tuple[Collected, list[str]]) -> None:
    """`__del__` and GC callbacks, which nothing else surfaces."""
    collected, chained = hooked
    error = _raised()

    # `UnraisableHookArgs` is a structseq the interpreter builds; a stand-in
    # with the same attributes is what the hook actually reads.
    args = SimpleNamespace(
        exc_type=type(error),
        exc_value=error,
        exc_traceback=error.__traceback__,
        err_msg=None,
        object=None,
    )
    sys.unraisablehook(cast("Any", args))
    collected.flush()

    assert collected.reports[0]["mechanism"] == {
        "type": "sys.unraisablehook",
        "handled": False,
    }
    assert chained == ["unraisable"]


def test_a_hook_that_cannot_report_still_chains(collected: Collected) -> None:
    """The reporter's own failure must never replace the traceback the process
    was about to print."""
    chained: list[str] = []
    original = sys.excepthook
    sys.excepthook = lambda *args: chained.append("excepthook")

    def explode(exception: BaseException, *, mechanism_type: str) -> None:
        raise RuntimeError("the reporter itself is broken")

    installed = install(explode, collected.client.flush)
    try:
        error = _raised()
        sys.excepthook(type(error), error, error.__traceback__)
    finally:
        installed.uninstall()
        sys.excepthook = original

    assert chained == ["excepthook"]


def test_uninstalling_restores_the_previous_hooks(collected: Collected) -> None:
    def mine(*args: Any) -> None:
        return None

    original = sys.excepthook
    sys.excepthook = mine

    installed = install(lambda exception, *, mechanism_type: None, collected.client.flush)
    assert sys.excepthook is not mine

    installed.uninstall()
    assert sys.excepthook is mine
    sys.excepthook = original


def test_uninstalling_leaves_a_later_hook_alone(collected: Collected) -> None:
    """Something installed after us owns the hook now; clobbering it on the way
    out would break a thing we did not set up."""
    original = sys.excepthook
    installed = install(lambda exception, *, mechanism_type: None, collected.client.flush)

    def theirs(*args: Any) -> None:
        return None

    sys.excepthook = theirs
    installed.uninstall()

    assert sys.excepthook is theirs
    sys.excepthook = original


def test_init_installs_and_close_removes(collected: Collected) -> None:
    original = sys.excepthook

    dolshoe.init(
        service={"name": "checkout-api"},
        transport=collected.transport,
        capture_unhandled_errors=True,
    )
    assert sys.excepthook is not original

    dolshoe.close(5.0)
    assert sys.excepthook is original


def test_capture_unhandled_errors_false_installs_nothing(
    collected: Collected,
) -> None:
    original = sys.excepthook

    dolshoe.init(
        service={"name": "checkout-api"},
        transport=collected.transport,
        capture_unhandled_errors=False,
    )
    try:
        assert sys.excepthook is original
    finally:
        dolshoe.close(5.0)
