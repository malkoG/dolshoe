"""Reporting the exceptions nobody caught.

Each hook chains to whatever was installed before it rather than replacing it,
for the same reason the Node reporter listens on `uncaughtExceptionMonitor`
instead of `uncaughtException`: a reporter should observe a crashing process,
not change how it crashes. A hook that swallowed the previous one would delete
the traceback the operator was going to read.
"""

from __future__ import annotations

import contextlib
import sys
import threading
from collections.abc import Callable
from types import TracebackType
from typing import Any, Protocol


class _Reporter(Protocol):
    def __call__(
        self, exception: BaseException, *, mechanism_type: str
    ) -> None: ...


class InstalledHooks:
    """The hooks this reporter installed, and how to take them back out."""

    def __init__(self) -> None:
        self._undo: list[Callable[[], None]] = []

    def add(self, undo: Callable[[], None]) -> None:
        self._undo.append(undo)

    def uninstall(self) -> None:
        for undo in reversed(self._undo):
            undo()
        self._undo.clear()


def install(report: _Reporter, flush: Callable[[float], bool]) -> InstalledHooks:
    """Install every unhandled-error hook, returning their uninstaller."""
    installed = InstalledHooks()
    _install_excepthook(installed, report, flush)
    _install_threading_excepthook(installed, report)
    _install_unraisablehook(installed, report)
    return installed


def _restore(get: Callable[[], Any], set_: Callable[[Any], None], ours: Any, previous: Any) -> None:
    """Put back the previous hook, but only if ours is still the one installed.

    A library that installed its own hook after us owns it now; clobbering it
    on the way out would break something we did not set up.
    """
    if get() is ours:
        set_(previous)


def _install_excepthook(
    installed: InstalledHooks, report: _Reporter, flush: Callable[[float], bool]
) -> None:
    previous = sys.excepthook

    def hook(
        kind: type[BaseException], value: BaseException, traceback: TracebackType | None
    ) -> None:
        try:
            report(value, mechanism_type="sys.excepthook")
            # The previous hook may hard-exit, which would skip `atexit` and
            # take the report with it, so this flush cannot wait for shutdown.
            flush(2.0)
        except BaseException:
            # Never let the reporter's own failure replace the traceback the
            # process was about to print.
            pass
        previous(kind, value, traceback)

    sys.excepthook = hook
    installed.add(lambda: _restore(lambda: sys.excepthook, _set_excepthook, hook, previous))


def _set_excepthook(value: Any) -> None:
    sys.excepthook = value


def _install_threading_excepthook(installed: InstalledHooks, report: _Reporter) -> None:
    previous = threading.excepthook

    def hook(args: threading.ExceptHookArgs) -> None:
        # Without this, an exception in a worker thread is printed to stderr and
        # otherwise lost — the most common silent failure in a threaded service.
        if args.exc_value is not None:
            with contextlib.suppress(BaseException):
                report(args.exc_value, mechanism_type="threading.excepthook")
        previous(args)

    threading.excepthook = hook
    installed.add(
        lambda: _restore(lambda: threading.excepthook, _set_threading_excepthook, hook, previous)
    )


def _set_threading_excepthook(value: Any) -> None:
    threading.excepthook = value


def _install_unraisablehook(installed: InstalledHooks, report: _Reporter) -> None:
    previous = sys.unraisablehook

    def hook(args: Any) -> None:
        # Errors from `__del__` and GC callbacks, which are exactly the bugs
        # that otherwise go unseen because nothing propagates them.
        exception = getattr(args, "exc_value", None)
        if isinstance(exception, BaseException):
            with contextlib.suppress(BaseException):
                report(exception, mechanism_type="sys.unraisablehook")
        previous(args)

    sys.unraisablehook = hook
    installed.add(
        lambda: _restore(lambda: sys.unraisablehook, _set_unraisablehook, hook, previous)
    )


def _set_unraisablehook(value: Any) -> None:
    sys.unraisablehook = value
