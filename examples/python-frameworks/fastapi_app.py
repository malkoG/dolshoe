"""Dolshoe in a FastAPI application.

Run it against a real instance::

    DOLSHOE_DSN='https://<token>@localhost:3000/<projectId>' \\
        uv run uvicorn fastapi_app:app --port 8000

    curl localhost:8000/orders/order-123
    curl localhost:8000/orders/missing      # reports an error

The interesting part is not the routes. It is that `price_basket` never sees a
span or a trace id, and its log line still lands on the request that caused it.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response

import dolshoe

logger = logging.getLogger("checkout.orders")


def configure_reporting() -> None:
    """Start the reporter, if this deployment has somewhere to report to.

    With no DSN configured the reporter is simply never initialised, and every
    capture becomes a no-op — `with_span` still runs its body and `capture_log`
    still returns. That is deliberate: an application must not fail to start,
    or behave differently, because telemetry was not set up.
    """
    dsn = os.environ.get("DOLSHOE_DSN")
    if not dsn:
        logger.warning("DOLSHOE_DSN is not set; reporting is disabled.")
        return

    dolshoe.init(
        dsn=dsn,
        service={
            "name": "checkout-api",
            "environment": os.environ.get("ENVIRONMENT", "development"),
        },
    )
    # Existing `logger.info(...)` calls become structured log records without
    # any of them changing.
    dolshoe.install_logging_handler(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the reporter with the application, and drain it on the way out."""
    configure_reporting()

    yield

    # Uvicorn stops the loop after this returns; `atexit` would still run, but
    # closing here means the last records leave while the process is healthy.
    dolshoe.close()


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def measure_request(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """One server span per request, and the parent of everything it does.

    Anything the handler logs or reports inside this block carries the span
    without being handed it, because the span lives in a `ContextVar` and
    asyncio copies the context into every task the request spawns.
    """
    route = request.url.path
    with dolshoe.with_span(f"{request.method} {route}", kind="server") as span:
        response = await call_next(request)
        if span is not None:
            span.set_attributes(
                {
                    "http.request.method": request.method,
                    "http.route": route,
                    "http.response.status_code": response.status_code,
                }
            )
            if response.status_code >= 500:
                span.set_status("error", f"responded {response.status_code}")
        return response


def price_basket(order_id: str) -> int:
    """Deliberately knows nothing about tracing."""
    with dolshoe.with_span("price basket") as span:
        if span is not None:
            span.set_attributes({"order_id": order_id})
        if order_id == "missing":
            raise LookupError(f"no basket for {order_id}")
        total = 45_000
        logger.info("Basket priced", extra={"order_id": order_id, "total": total})
        return total


@app.get("/orders/{order_id}")
async def read_order(order_id: str) -> dict[str, object]:
    try:
        total = price_basket(order_id)
    except LookupError as error:
        # Note what is *not* here: no `capture_exception`. An exception leaving
        # a span is already marked on it and reported with its trace attached.
        # Capturing again here would store the same failure twice.
        raise HTTPException(status_code=404, detail="order not found") from error

    return {"orderId": order_id, "total": total, "currency": "KRW"}


@app.get("/boom")
async def boom() -> None:
    """An unhandled error. FastAPI turns it into a 500 and the excepthook
    reports it — no try/except anywhere in the route."""
    raise RuntimeError("settlement processor is unreachable")
