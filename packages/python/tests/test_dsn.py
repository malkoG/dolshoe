"""DSN parsing, mirroring `packages/core/test/dsn.test.mjs` case for case."""

from __future__ import annotations

import pytest

from dolshoe.dsn import parse_dsn
from dolshoe.errors import DolshoeConfigurationError

TOKEN = "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ"
PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e"
DSN = f"https://{TOKEN}@dolshoe.example/{PROJECT_ID}"


def test_derives_all_three_endpoints_and_the_credential() -> None:
    parsed = parse_dsn(DSN)

    assert parsed.origin == "https://dolshoe.example"
    assert parsed.base_path == ""
    assert parsed.project_id == PROJECT_ID
    assert parsed.token == TOKEN

    base = f"https://dolshoe.example/api/v1/projects/{PROJECT_ID}"
    assert parsed.error_report_endpoint == f"{base}/error-reports"
    assert parsed.log_endpoint == f"{base}/log-records"
    assert parsed.span_endpoint == f"{base}/traces"


def test_keeps_a_base_path_so_an_instance_behind_a_prefix_works() -> None:
    parsed = parse_dsn(f"https://{TOKEN}@example.test/tools/dolshoe/{PROJECT_ID}")

    assert parsed.base_path == "/tools/dolshoe"
    assert parsed.error_report_endpoint == (
        f"https://example.test/tools/dolshoe/api/v1/projects/{PROJECT_ID}/error-reports"
    )


def test_accepts_http_and_a_non_default_port_for_instances_without_tls() -> None:
    parsed = parse_dsn(f"http://{TOKEN}@localhost:5173/{PROJECT_ID}")

    assert parsed.origin == "http://localhost:5173"
    assert parsed.error_report_endpoint == (
        f"http://localhost:5173/api/v1/projects/{PROJECT_ID}/error-reports"
    )


@pytest.mark.parametrize(
    ("dsn", "expected"),
    [
        ("", "must not be empty"),
        ("not a url", "not a valid URL"),
        (f"ftp://{TOKEN}@dolshoe.example/{PROJECT_ID}", "http or https"),
        (f"https://dolshoe.example/{PROJECT_ID}", "missing its ingestion token"),
        (f"https://{TOKEN}@dolshoe.example", "missing its project id"),
        (f"https://{TOKEN}:secret@dolshoe.example/{PROJECT_ID}", "no password component"),
    ],
)
def test_rejects_a_malformed_dsn_with_a_message_naming_the_problem(dsn: str, expected: str) -> None:
    with pytest.raises(DolshoeConfigurationError, match=expected):
        parse_dsn(dsn)


def test_percent_decodes_the_token_the_way_the_javascript_url_does() -> None:
    """A token is URL-unreserved by construction, but a hand-edited DSN may not be.

    `urlsplit` leaves userinfo encoded where the JavaScript `URL` this mirrors
    decodes it, so without the explicit `unquote` the two reporters would send
    different credentials for the same DSN.
    """
    parsed = parse_dsn(f"https://token%2Bwith%2Fescapes@dolshoe.example/{PROJECT_ID}")

    assert parsed.token == "token+with/escapes"
