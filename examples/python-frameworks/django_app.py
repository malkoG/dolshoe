"""Dolshoe in a Django application.

A whole Django project in one file, so the wiring is not spread across a
settings module, an app config, and a middleware package. Run it against a real
instance::

    DOLSHOE_DSN='https://<token>@localhost:3000/<projectId>' \\
        uv run python django_app.py runserver 8001

    curl localhost:8001/orders/order-123
    curl localhost:8001/orders/missing      # reports an error

In a real project the `dolshoe.init(...)` call belongs in `settings.py` or an
`AppConfig.ready()`, and `DolshoeMiddleware` in `MIDDLEWARE`.
"""

from __future__ import annotations

import logging
import os
import sys
from collections.abc import Callable

import django
from django.conf import settings
from django.core.management import execute_from_command_line
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.urls import path

import dolshoe

logger = logging.getLogger("checkout.orders")


class DolshoeMiddleware:
    """One server span per request.

    Django runs each request on a worker thread, and a `ContextVar` is
    per-thread, so two requests in flight cannot end up in each other's trace.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        route = request.path
        with dolshoe.with_span(f"{request.method} {route}", kind="server") as span:
            response = self.get_response(request)
            if span is not None:
                span.set_attributes(
                    {
                        "http.request.method": request.method or "",
                        "http.route": route,
                        "http.response.status_code": response.status_code,
                    }
                )
                if response.status_code >= 500:
                    span.set_status("error", f"responded {response.status_code}")
            return response

    def process_exception(self, request: HttpRequest, exception: Exception) -> None:
        """Django swallows the exception into a 500, so report it here.

        Without this hook the traceback never reaches `sys.excepthook` and the
        error would only ever be a status code.
        """
        dolshoe.capture_exception(
            exception,
            mechanism={"type": "django.middleware", "handled": True},
            attributes={"http.route": request.path},
        )


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


def read_order(request: HttpRequest, order_id: str) -> JsonResponse:
    try:
        total = price_basket(order_id)
    except LookupError:
        # No `capture_exception` here on purpose: the span this escaped has
        # already marked itself failed and reported it with its trace attached.
        return JsonResponse({"detail": "order not found"}, status=404)

    return JsonResponse({"orderId": order_id, "total": total, "currency": "KRW"})


def boom(request: HttpRequest) -> HttpResponse:
    """An unhandled error, caught by `process_exception` above."""
    raise RuntimeError("settlement processor is unreachable")


urlpatterns = [
    path("orders/<str:order_id>", read_order),
    path("boom", boom),
]


def configure_reporting() -> None:
    """Start the reporter, if this deployment has somewhere to report to.

    With no DSN configured the reporter is never initialised and every capture
    becomes a no-op — `with_span` still runs its body and `capture_exception`
    still returns. An application must not fail to start, or behave
    differently, because telemetry was not set up.
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
    dolshoe.install_logging_handler(level=logging.INFO)


def configure() -> None:
    settings.configure(
        DEBUG=False,
        ALLOWED_HOSTS=["*"],
        ROOT_URLCONF=__name__,
        SECRET_KEY="not-a-secret-this-is-an-example",  # noqa: S106
        MIDDLEWARE=["django_app.DolshoeMiddleware"],
        LOGGING_CONFIG=None,
    )
    django.setup()
    configure_reporting()


if __name__ == "__main__":
    configure()
    execute_from_command_line(sys.argv)
