"""Turning a DSN into the three endpoints and the credential a reporter needs.

A port of `packages/core/src/dsn.ts`, including its error messages: the two
reporters describe the same malformed DSN the same way, so an answer found for
one applies to the other.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote, unquote, urlsplit

from .errors import DolshoeConfigurationError


@dataclass(frozen=True, slots=True)
class ParsedDsn:
    """Everything a DSN carries, once taken apart."""

    origin: str
    """Scheme and authority, without a trailing slash."""

    base_path: str
    """Path the instance is mounted under, or an empty string."""

    project_id: str
    token: str
    error_report_endpoint: str
    log_endpoint: str
    span_endpoint: str


def parse_dsn(dsn: str) -> ParsedDsn:
    """Take a DSN apart.

    A DSN packages everything a reporter needs into one copyable string:

        https://<token>@dolshoe.example/<projectId>

    The token sits in the userinfo position, so a DSN is a secret — unlike a
    Sentry DSN, whose ingestion endpoint is open. Segments before the last one
    are treated as a base path, which is what lets an instance served under a
    prefix work without configuring endpoints by hand.
    """
    trimmed = dsn.strip()
    if not trimmed:
        raise DolshoeConfigurationError("Dolshoe dsn must not be empty.")

    try:
        url = urlsplit(trimmed)
    except ValueError as error:
        raise DolshoeConfigurationError(f"Dolshoe dsn is not a valid URL: {dsn!r}.") from error

    if url.scheme not in ("https", "http"):
        # An empty scheme means the string was not a URL at all, which is a more
        # useful thing to say than that "" is not http.
        if not url.scheme or not url.netloc:
            raise DolshoeConfigurationError(f"Dolshoe dsn is not a valid URL: {dsn!r}.")
        raise DolshoeConfigurationError(
            f"Dolshoe dsn must use http or https, but got {url.scheme!r}."
        )

    if url.password:
        raise DolshoeConfigurationError(
            "Dolshoe dsn carries the ingestion token alone; it has no password component."
        )

    # `urlsplit` leaves userinfo percent-encoded, the same as the JavaScript
    # `URL` this mirrors, so it is decoded explicitly rather than by accident.
    token = unquote(url.username or "")
    if not token:
        raise DolshoeConfigurationError(
            "Dolshoe dsn is missing its ingestion token. "
            "Expected https://<token>@<host>/<projectId>."
        )

    segments = [segment for segment in url.path.split("/") if segment]
    if not segments:
        raise DolshoeConfigurationError(
            "Dolshoe dsn is missing its project id. Expected https://<token>@<host>/<projectId>."
        )

    project_id = segments.pop()
    base_path = f"/{'/'.join(segments)}" if segments else ""
    # `hostname` lowercases but drops the port, and `netloc` still carries the
    # credential; the authority has to be rebuilt from the parts that remain.
    authority = url.netloc.rsplit("@", 1)[-1]
    origin = f"{url.scheme}://{authority}"
    project_path = f"{origin}{base_path}/api/v1/projects/{quote(project_id, safe='')}"

    return ParsedDsn(
        origin=origin,
        base_path=base_path,
        project_id=project_id,
        token=token,
        error_report_endpoint=f"{project_path}/error-reports",
        log_endpoint=f"{project_path}/log-records",
        # The route an OpenTelemetry exporter would also be pointed at, so a DSN
        # and an OTEL_EXPORTER_OTLP_TRACES_ENDPOINT reach the same place.
        span_endpoint=f"{project_path}/traces",
    )
