# `dolshoe`

The Dolshoe reporter for Python. Errors, structured logs, and spans, over the
same versioned ingestion contract the JavaScript reporters use.

```python
import dolshoe

dolshoe.init(
    dsn=os.environ["DOLSHOE_DSN"],
    service={"name": "checkout-api", "environment": "production"},
)

with dolshoe.with_span("POST /orders", kind="server") as span:
    span.set_attributes({"http.route": "/orders"})
    dolshoe.capture_log("info", "Order submitted", category=["checkout", "orders"])
```

The root [README](../../README.md#python-reporter) is the reference: it covers
the span API, the `logging` bridge, the unhandled-error hooks, the background
delivery thread, and the fork behaviour that forking servers depend on.
[`examples/python-frameworks/`](../../examples/python-frameworks) has it wired
into Django and FastAPI.

No runtime dependencies, and it should stay that way — a reporter that pulls an
HTTP stack into an application can conflict with the application it is meant to
be observing.

## Working on it

```sh
uv run pytest
uv run ruff check .
uv run mypy src tests
```

Or from the repository root, where these are wired into `pnpm check`:

```sh
pnpm sdk:python:test
pnpm sdk:python:lint
pnpm sdk:python:typecheck
```

Unit tests must not open a socket. Every transport is injectable, and
`dolshoe.testing` — the same surface applications use to test their own
instrumentation — is the shortest way to record what was reported:

```python
from dolshoe.testing import capture_telemetry

with capture_telemetry() as captured:
    handle_request()

assert captured.span_tree() == [("POST /orders", [("price basket", [])])]
```

Snapshots are written with `inline-snapshot`; run
`uv run pytest --inline-snapshot=fix` to update them, and read the diff before
committing it.
