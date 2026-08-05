"""Exception normalization — the Python-shaped half of the contract."""

from __future__ import annotations

import pytest

from dolshoe.normalize import (
    MAX_DEPTH,
    clip,
    normalize_exception,
    truncate,
    utf16_length,
)


def _raise(build: object) -> BaseException:
    """Raise and catch, so the exception carries a real traceback."""
    try:
        raise build  # type: ignore[misc]
    except BaseException as error:
        return error


def test_explicit_cause_is_reported_and_the_context_suppressed() -> None:
    """`raise X from Y` sets __suppress_context__, and the contract has a field
    for each — sending both would describe the same failure twice."""
    try:
        try:
            raise ValueError("cart missing")
        except ValueError as cause:
            raise RuntimeError("checkout failed") from cause
    except RuntimeError as error:
        normalized = normalize_exception(error)

    assert normalized["type"] == "RuntimeError"
    assert normalized["cause"]["type"] == "ValueError"
    assert normalized["cause"]["message"] == "cart missing"
    assert "context" not in normalized


def test_implicit_context_is_reported_when_not_suppressed() -> None:
    """A bare raise inside an except block is the case `context` exists for."""
    try:
        try:
            raise ValueError("cart missing")
        except ValueError:
            raise RuntimeError("checkout failed")  # noqa: B904
    except RuntimeError as error:
        normalized = normalize_exception(error)

    assert normalized["context"]["type"] == "ValueError"
    assert "cause" not in normalized


def test_exception_group_members_become_children() -> None:
    group = _raise(
        ExceptionGroup(
            "settlement failures",
            [TimeoutError("processor timed out"), ValueError("currency is missing")],
        )
    )
    normalized = normalize_exception(group)

    assert normalized["type"] == "ExceptionGroup"
    assert [child["type"] for child in normalized["children"]] == [
        "TimeoutError",
        "ValueError",
    ]
    assert normalized["children"][0]["message"] == "processor timed out"


def test_children_are_capped_at_twenty() -> None:
    group = _raise(ExceptionGroup("many", [ValueError(str(n)) for n in range(30)]))
    assert len(normalize_exception(group)["children"]) == 20


def test_frames_lead_with_the_place_the_exception_came_from() -> None:
    """The server reads `frames[0]` as the report's source location.

    `summarize-exception.ts` derives it from the first frame, and Python's own
    traceback runs outermost-first — so without reversing, every Python report
    would be labelled with its entry point rather than the line that failed.
    """

    def innermost() -> None:
        raise ValueError("failed here")

    def outermost() -> None:
        innermost()

    error = _raise_from(outermost)
    frames = normalize_exception(error)["frames"]

    # `co_qualname`, so a method reads as `Order.submit` rather than `submit`.
    assert frames[0]["functionName"].endswith("innermost")
    assert frames[0]["sourceLine"] == 'raise ValueError("failed here")'
    assert frames[1]["functionName"].endswith("outermost")


def _raise_from(call: object) -> BaseException:
    try:
        call()  # type: ignore[operator]
    except BaseException as error:
        return error
    raise AssertionError("expected a raise")


def test_frames_carry_the_fields_javascript_can_never_fill() -> None:
    error = _raise(ValueError("boom"))
    frame = normalize_exception(error)["frames"][0]

    assert frame["moduleName"] == __name__
    assert frame["fileName"].endswith("test_normalize.py")
    assert frame["lineNumber"] > 0
    assert frame["inApp"] is True


def test_frames_of_a_library_are_not_in_app() -> None:
    """The heuristic is checked against a live interpreter, not a fixture."""
    import json

    try:
        json.loads("{")
    except ValueError as error:
        frames = normalize_exception(error)["frames"]

    library_frames = [frame for frame in frames if "json" in frame.get("moduleName", "")]
    assert library_frames
    assert all(frame["inApp"] is False for frame in library_frames)


def test_a_frame_carries_the_lines_around_the_one_that_failed() -> None:
    """Read against this file, so the assertion names lines that really exist."""
    error = _raise(ValueError("boom"))
    frame = normalize_exception(error)["frames"][0]

    assert frame["sourceLine"]
    # `_raise` is defined above with a `raise` inside it; whatever surrounds that
    # line here is what has to come back.
    assert frame["preContext"]
    assert frame["postContext"]
    assert len(frame["preContext"]) <= 5
    assert len(frame["postContext"]) <= 5
    # Indentation is kept, which is what makes the block readable.
    assert any(line.startswith(" ") for line in frame["preContext"] + frame["postContext"])
    # The context lines sit either side of the failing one, not on top of it.
    assert frame["sourceLine"] not in frame["preContext"]


def test_only_the_application_pays_for_source_context() -> None:
    import json

    try:
        json.loads("{")
    except ValueError as error:
        frames = normalize_exception(error)["frames"]

    for frame in frames:
        if frame["origin"] != "app":
            assert "preContext" not in frame
            assert "postContext" not in frame


def test_the_standard_library_is_told_apart_from_a_dependency() -> None:
    """`inApp` cannot say which kind of not-ours a frame is; `origin` can.

    Also checked against a live interpreter: `json` is the standard library
    wherever this runs, and pytest is installed the way any dependency is.
    """
    import json

    try:
        json.loads("{")
    except ValueError as error:
        frames = normalize_exception(error)["frames"]

    origins = {frame.get("moduleName", ""): frame["origin"] for frame in frames}
    assert origins[__name__] == "app"
    assert any(
        origin == "runtime" for module, origin in origins.items() if module.startswith("json")
    )

    # The frame this test itself is in stays application code, and the two
    # fields never disagree.
    assert all(frame["inApp"] is (frame["origin"] == "app") for frame in frames)


def test_a_dependencys_frames_are_neither_app_nor_runtime() -> None:
    import _pytest.outcomes

    error = _raise_from(lambda: _pytest.outcomes.fail("deliberate"))
    frames = normalize_exception(error)["frames"]

    dependency_frames = [frame for frame in frames if "_pytest" in frame.get("moduleName", "")]
    assert dependency_frames
    assert all(frame["origin"] == "dependency" for frame in dependency_frames)
    assert all(frame["inApp"] is False for frame in dependency_frames)


def test_nesting_deeper_than_the_limit_is_truncated() -> None:
    """The server counts cause, context and children against one budget and
    rejects the whole report past 16, so the reporter has to cut first."""
    error: BaseException = ValueError("root")
    for _ in range(MAX_DEPTH + 5):
        outer = RuntimeError("wrapper")
        outer.__cause__ = error
        error = outer

    normalized = normalize_exception(error)
    depth = 0
    node = normalized
    while "cause" in node:
        node = node["cause"]
        depth += 1

    assert node["type"] == "TruncatedException"
    assert depth == MAX_DEPTH + 1


def test_a_cycle_collapses_rather_than_recursing_forever() -> None:
    first = RuntimeError("first")
    second = RuntimeError("second")
    first.__cause__ = second
    second.__cause__ = first

    normalized = normalize_exception(first)
    assert normalized["cause"]["cause"]["message"] == "[Circular exception reference]"


def test_a_raised_non_exception_is_described_as_a_value() -> None:
    normalized = normalize_exception("payment was declined")

    assert normalized["value"] == {
        "type": "str",
        "representation": "'payment was declined'",
    }
    assert "type" not in normalized


def test_an_os_error_carries_its_errno_as_the_code() -> None:
    error = _raise(FileNotFoundError(2, "No such file or directory"))
    assert normalize_exception(error)["code"] == 2


def test_the_stacktrace_text_does_not_repeat_the_chain() -> None:
    """The chain is already carried structurally; repeating it as text would
    spend the 64 KiB budget describing the same thing again."""
    try:
        try:
            raise ValueError("cart missing")
        except ValueError as cause:
            raise RuntimeError("checkout failed") from cause
    except RuntimeError as error:
        normalized = normalize_exception(error)

    assert "checkout failed" in normalized["stacktrace"]
    assert "cart missing" not in normalized["stacktrace"]


def test_a_broken_str_does_not_stop_the_report() -> None:
    class HostileError(Exception):
        def __str__(self) -> str:
            raise RuntimeError("nope")

    normalized = normalize_exception(_raise(HostileError()))
    assert normalized["type"] == "HostileError"
    assert "message" not in normalized


@pytest.mark.parametrize(
    ("value", "maximum", "expected"),
    [
        ("hello", 10, "hello"),
        ("hello world", 8, "hello w…"),
    ],
)
def test_truncate_marks_that_something_was_removed(value: str, maximum: int, expected: str) -> None:
    assert truncate(value, maximum) == expected


def test_lengths_are_measured_the_way_the_server_measures_them() -> None:
    """Every `.max()` in the contract is a Zod bound on a JavaScript string, and
    JavaScript counts UTF-16 code units. Counting code points here would let a
    message of emoji pass locally and be rejected with a 400 on arrival."""
    emoji = "😀" * 10

    assert len(emoji) == 10
    assert utf16_length(emoji) == 20
    assert utf16_length(clip(emoji, 9)) <= 9
    # Never split a surrogate pair: four whole emoji fit in nine units.
    assert clip(emoji, 9) == "😀" * 4
    assert utf16_length(truncate(emoji, 9)) <= 9
