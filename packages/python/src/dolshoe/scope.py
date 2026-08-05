"""The active span.

The JavaScript core defines a `SpanScope` seam and each runtime package fills
it with `AsyncLocalStorage`, because core itself cannot import
`node:async_hooks`. Python needs no seam: a `ContextVar` is per-thread, since a
new thread starts from an empty context, *and* per-task, since asyncio copies
the context when a task is created. One mechanism answers both, so a pluggable
scope here would be an abstraction with nothing on the other side of it.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .span import Span

_ACTIVE_SPAN: ContextVar[Span | None] = ContextVar("dolshoe_active_span", default=None)


def active_span() -> Span | None:
    """The span enclosing the caller, if any."""
    return _ACTIVE_SPAN.get()


@contextmanager
def activate(span: Span) -> Iterator[Span]:
    """Make `span` the active one for the duration of the block."""
    token = _ACTIVE_SPAN.set(span)
    try:
        yield span
    finally:
        try:
            _ACTIVE_SPAN.reset(token)
        except ValueError:
            # `reset` refuses a token created in a different Context, which
            # happens when a block is entered and left in different tasks — an
            # `ExitStack` handed across an await, say. Clearing is the honest
            # fallback: leaving the span set would silently make it the parent
            # of everything that ran afterwards in this context.
            _ACTIVE_SPAN.set(None)
