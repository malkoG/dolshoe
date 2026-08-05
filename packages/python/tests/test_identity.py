"""The reporter identity the API already documents.

`apps/api/src/error-reporting/error-report.examples.ts` ships a Python error
report as an OpenAPI example, and `error-report.contract.spec.ts` asserts it
against the live schema. These values are what that example promises, so a
change here is a change to documentation the server already serves.
"""

import tomllib
from pathlib import Path

import dolshoe


def test_reports_the_identity_the_api_documents() -> None:
    assert dolshoe.RUNTIME_NAME == "cpython"
    assert dolshoe.REPORTER_NAME == "dolshoe-python"


def test_reporter_version_tracks_the_distribution_version() -> None:
    pyproject = Path(__file__).parent.parent / "pyproject.toml"
    with pyproject.open("rb") as file:
        metadata = tomllib.load(file)

    assert metadata["project"]["version"] == dolshoe.REPORTER_VERSION
