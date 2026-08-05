# Dolshoe in Django and FastAPI

Two single-file applications wired to the same Dolshoe instance, one per
framework. They exist to show the three things that are easy to get wrong when
adding a reporter to a web application: where to start it, how to make every
request a span, and where to report the errors the framework swallows.

Both apps expose the same routes:

| Route                   | What it shows                                                            |
| ----------------------- | ------------------------------------------------------------------------ |
| `GET /orders/order-123` | A log line written deep in the call stack, correlated with the request   |
| `GET /orders/missing`   | An exception escaping a span, reported once, with the span marked failed |
| `GET /boom`             | An unhandled error the framework turns into a 500                        |

## Running them

```sh
uv sync
export DOLSHOE_DSN='https://<token>@localhost:3000/<projectId>'

uv run uvicorn fastapi_app:app --port 8000
uv run python django_app.py runserver 8001
```

Then open the project's **Reports**, **Logs**, and traces in the web app. With
no `DOLSHOE_DSN` set the apps still run and every capture becomes a no-op — an
application must not behave differently because telemetry was not configured.

Run the assertions instead of the servers with `uv run pytest`. They drive the
real middleware and routes against a recording transport, so what the README
claims is what is checked.

## What the middleware is for

One span per request, started before the handler and ended after it:

```python
with dolshoe.with_span(f"{request.method} {route}", kind="server") as span:
    response = await call_next(request)
```

Everything inside that block — a log line, an error, a nested span — carries
the request's trace without being handed it. `price_basket()` in both apps
takes no span argument and knows nothing about tracing, and its log record
still opens the request that caused it. That is the reason to track an active
span at all.

The active span lives in a `ContextVar`, which is per-thread _and_ per-task, so
Django's threaded workers and FastAPI's concurrent coroutines both stay
separate. Two requests in flight never end up in each other's trace.

## Do not report the same failure twice

Neither app calls `capture_exception` for the `LookupError` in
`/orders/missing`. It does not need to: an exception leaving a span already
marks that span failed and reports itself with the trace attached. Adding an
explicit capture in the `except` block is the easy mistake, and it stores the
same failure as two unrelated events.

Django is the exception to that rule, and `DolshoeMiddleware.process_exception`
is why. Django catches an unhandled exception and turns it into a 500 before it
can reach `sys.excepthook`, so without that hook a crash would only ever be a
status code. FastAPI needs no equivalent — the exception propagates far enough
for the installed hooks to see it.

## Running under gunicorn or uWSGI

Both fork worker processes after the master has imported the application, and a
thread does not survive `fork()`. The reporter rebuilds its delivery thread in
the child through `os.register_at_fork`, so this works — but it is the reason
that code exists. Without it a forking server would enqueue events into a queue
nothing was draining, and the reporter would be silently dead in production
while working perfectly in development.

Call `dolshoe.close()` on shutdown, as `fastapi_app.py` does in its lifespan.
`atexit` covers an ordinary exit, but not `os._exit()` or a `SIGKILL`, and
nothing in-process can.
