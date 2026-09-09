"""The active span, and the active user/tags/breadcrumbs scope.

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
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .types import Breadcrumb, Tags, UserContext

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


@dataclass
class ScopeData:
    """The mutable bag `set_user`/`set_tag`/`add_breadcrumb` write into.

    Unlike a `Span`, where "none active" is a valid state, `active_scope()`
    always hands back something to mutate — see its own docstring for how it
    gets one without a `with_scope()` block ever having been opened.
    """

    user: UserContext | None = None
    tags: Tags = field(default_factory=dict)
    breadcrumbs: list[Breadcrumb] = field(default_factory=list)


_ACTIVE_SCOPE: ContextVar[ScopeData | None] = ContextVar("dolshoe_active_scope", default=None)


def active_scope() -> ScopeData:
    """The scope enclosing the caller. Always returns something to mutate.

    Lazily creates and installs a fresh `ScopeData` into *this* context the
    first time it is asked for, rather than defaulting every caller to one
    `ContextVar`-wide shared object — that would put every thread and task
    that never opened a `with_scope()` block back in the same bag, quietly
    defeating the isolation `ContextVar` exists to provide.
    """
    scope = _ACTIVE_SCOPE.get()
    if scope is None:
        scope = ScopeData()
        _ACTIVE_SCOPE.set(scope)
    return scope


@contextmanager
def with_scope() -> Iterator[ScopeData]:
    """Bind a fresh, empty scope for the duration of the block.

    A request handler wraps itself in this to isolate its own user/tags/
    breadcrumbs from whatever else is running concurrently — the same role
    `activate` plays for a span, on a bag instead of a single value.
    """
    fresh = ScopeData()
    token = _ACTIVE_SCOPE.set(fresh)
    try:
        yield fresh
    finally:
        try:
            _ACTIVE_SCOPE.reset(token)
        except ValueError:
            # See `activate`'s identical comment: a token created in a
            # different Context is refused, and clearing is the honest
            # fallback rather than leaving this block's scope active forever.
            # `None` rather than a fresh `ScopeData()`: the next `active_scope()`
            # call lazily makes one, the same as if this block had never run.
            _ACTIVE_SCOPE.set(None)
