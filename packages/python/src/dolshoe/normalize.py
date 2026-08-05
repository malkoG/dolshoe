"""Turning Python exceptions and attribute values into the wire contract.

A port of `packages/core/src/normalize.ts`, with the Python-shaped parts the
contract already reserves for this reporter: `context` from `__context__`,
`children` from an `ExceptionGroup`, and `moduleName` / `sourceLine` on frames,
which the JavaScript stack parser can never fill in.
"""

from __future__ import annotations

import contextlib
import linecache
import math
import os
import re
import site
import sysconfig
import traceback
from collections.abc import Mapping, Sequence
from functools import lru_cache
from itertools import islice
from typing import Any

from .types import JsonValue, NormalizedException, StackFrame, ThrownValue

MAX_DEPTH = 16
MAX_CHILDREN = 20
MAX_FRAMES = 200
MAX_STACK_LENGTH = 65_536
MAX_MESSAGE_LENGTH = 16_384
MAX_TYPE_LENGTH = 512
MAX_CODE_LENGTH = 512
MAX_REPRESENTATION_LENGTH = 4_096
MAX_ATTRIBUTE_DEPTH = 8
MAX_ATTRIBUTE_ITEMS = 100
MAX_ATTRIBUTE_KEY_LENGTH = 200

_SENSITIVE = re.compile(
    r"authorization|cookie|dsn|pass(?:word|wd)?|secret|token"
    r"|api[-_]?key|access[-_]?(?:key|token)",
    re.IGNORECASE,
)


def utf16_length(value: str) -> int:
    """Length in UTF-16 code units, which is what the server counts.

    Every `.max()` in the ingestion contract is a Zod bound on a JavaScript
    string, and JavaScript measures in UTF-16 code units. Python's `len()`
    counts code points, so a message of 16 384 emoji measures 16 384 here and
    32 768 there: the server rejects the whole payload with a 400 and the event
    is gone. Only non-BMP text is affected, which is why it would otherwise be
    found in production rather than in a test.
    """
    return sum(2 if ord(character) > 0xFFFF else 1 for character in value)


def _cut(value: str, maximum: int) -> str:
    """Longest prefix fitting `maximum` UTF-16 units, never splitting a pair."""
    kept: list[str] = []
    used = 0
    for character in value:
        width = 2 if ord(character) > 0xFFFF else 1
        if used + width > maximum:
            break
        kept.append(character)
        used += width
    return "".join(kept)


def truncate(value: str, maximum: int) -> str:
    """Shorten with an ellipsis, to exactly `maximum` units."""
    if utf16_length(value) <= maximum:
        return value
    return _cut(value, maximum - 1) + "…"


def clip(value: str, maximum: int) -> str:
    """Shorten with no ellipsis.

    The distinction is not an oversight: `truncate` marks that something was
    removed, while span names, status messages and log messages are clipped
    silently, matching the raw `slice` the JavaScript client uses for them.
    """
    if utf16_length(value) <= maximum:
        return value
    return _cut(value, maximum)


# -- exceptions -----------------------------------------------------------


def _library_prefixes() -> tuple[str, ...]:
    paths = sysconfig.get_paths()
    candidates = [
        paths.get("stdlib"),
        paths.get("platstdlib"),
        paths.get("purelib"),
        paths.get("platlib"),
    ]
    # Absent in some embedded and virtualenv-less builds.
    with contextlib.suppress(AttributeError):
        candidates.extend(site.getsitepackages())
    with contextlib.suppress(AttributeError):
        candidates.append(site.getusersitepackages())
    return tuple(os.path.normcase(os.path.realpath(path)) for path in candidates if path)


_LIBRARY_PREFIXES = _library_prefixes()


@lru_cache(maxsize=1024)
def _is_in_app(file_name: str, module_name: str | None) -> bool:
    """Whether a frame belongs to the application rather than to a library.

    Cached because it resolves a real path, and an exception on a hot path can
    otherwise turn one report into hundreds of filesystem calls.
    """
    if not file_name or file_name.startswith("<"):
        return False
    if module_name is not None and module_name.split(".")[0] == "dolshoe":
        return False

    resolved = os.path.normcase(os.path.realpath(file_name))
    if resolved.startswith(_LIBRARY_PREFIXES):
        return False
    parts = resolved.split(os.sep)
    return "site-packages" not in parts and "dist-packages" not in parts


def _column_of(traceback_object: Any) -> int | None:
    """The column PEP 657 records for the instruction that raised.

    A 0-based UTF-8 byte offset, which the contract explicitly permits — it
    says a column's base is runtime-specific.
    """
    code = traceback_object.tb_frame.f_code
    positions = getattr(code, "co_positions", None)
    if positions is None:  # pragma: no cover - 3.10 and earlier
        return None
    try:
        entry = next(islice(positions(), traceback_object.tb_lasti // 2, None), None)
    except (TypeError, ValueError):  # pragma: no cover
        return None
    if entry is None:
        return None
    column = entry[2]
    return int(column) if isinstance(column, int) else None


def _source_line(file_name: str, line_number: int, frame_globals: dict[str, Any]) -> str | None:
    if not file_name or file_name.startswith("<") or line_number <= 0:
        return None
    try:
        linecache.checkcache(file_name)
        line = linecache.getline(file_name, line_number, frame_globals)
    except (OSError, UnicodeDecodeError):  # pragma: no cover
        return None
    stripped = line.strip()
    return stripped or None


def _frames_of(exception: BaseException) -> list[StackFrame]:
    """Frames for one exception, innermost first.

    Two decisions worth stating. The order is reversed from Python's own
    outermost-first traceback because the server reads `frames[0]` as the place
    the exception came from — `summarize-exception.ts` derives a report's source
    location from it — so leaving Python's order would label every report with
    the process entry point instead of the line that failed. And when there are
    more than 200 frames it is the innermost 200 that are kept, because the
    outermost 200 of a `RecursionError` are all the same frame descending and
    never include the failure.
    """
    collected: list[StackFrame] = []
    current = exception.__traceback__
    while current is not None:
        code = current.tb_frame.f_code
        file_name = code.co_filename
        line_number = current.tb_lineno or 0
        module_name = current.tb_frame.f_globals.get("__name__")

        frame: StackFrame = {}
        function_name = getattr(code, "co_qualname", code.co_name)
        if function_name:
            frame["functionName"] = truncate(function_name, 1_024)
        if isinstance(module_name, str) and module_name:
            frame["moduleName"] = truncate(module_name, 1_024)
        if file_name:
            frame["fileName"] = truncate(file_name, 2_048)
        if line_number > 0:
            frame["lineNumber"] = line_number
        column = _column_of(current)
        if column is not None and column >= 0:
            frame["columnNumber"] = column
        source_line = _source_line(file_name, line_number, current.tb_frame.f_globals)
        if source_line is not None:
            frame["sourceLine"] = truncate(source_line, 4_096)
        frame["inApp"] = _is_in_app(file_name, module_name)

        collected.append(frame)
        current = current.tb_next

    collected.reverse()
    return collected[:MAX_FRAMES]


def _read(exception: BaseException, name: str) -> Any:
    """Read an attribute without letting a property raise into the reporter."""
    try:
        return getattr(exception, name, None)
    except BaseException:
        return None


def _code_of(exception: BaseException) -> str | int | None:
    errno = _read(exception, "errno")
    if isinstance(errno, int) and not isinstance(errno, bool):
        return errno
    code = _read(exception, "code")
    if isinstance(code, bool):
        return None
    if isinstance(code, int):
        return code
    if isinstance(code, str) and code:
        return clip(code, MAX_CODE_LENGTH)
    return None


def _representation(value: object) -> str:
    try:
        text = repr(value)
    except BaseException:
        text = f"<unrepresentable {type(value).__name__}>"
    return truncate(text, MAX_REPRESENTATION_LENGTH)


def normalize_exception(
    value: object,
    depth: int = 0,
    seen: dict[int, BaseException] | None = None,
) -> NormalizedException:
    """Turn a raised object into the contract's recursive exception tree."""
    if depth > MAX_DEPTH:
        return {
            "type": "TruncatedException",
            "message": f"Exception nesting exceeded {MAX_DEPTH} levels.",
        }

    if not isinstance(value, BaseException):
        thrown: ThrownValue = {
            "type": type(value).__name__,
            "representation": _representation(value),
        }
        return {"value": thrown}

    if seen is None:
        seen = {}
    identity = id(value)
    if identity in seen:
        return {
            "type": truncate(type(value).__name__, MAX_TYPE_LENGTH),
            "message": "[Circular exception reference]",
        }
    # A strong reference, so the id cannot be recycled onto a different object
    # while this walk is still running.
    seen[identity] = value

    try:
        normalized: NormalizedException = {"type": truncate(type(value).__name__, MAX_TYPE_LENGTH)}

        try:
            message = str(value)
        except BaseException:
            message = ""
        if message:
            normalized["message"] = clip(message, MAX_MESSAGE_LENGTH)

        code = _code_of(value)
        if code is not None:
            normalized["code"] = code

        if value.__traceback__ is not None:
            # `chain=False` because the chain is already carried structurally in
            # `cause` and `context`; including it here would spend the 64 KiB
            # stacktrace budget repeating up to sixteen levels of it.
            text = "".join(
                traceback.format_exception(type(value), value, value.__traceback__, chain=False)
            )
            if text:
                normalized["stacktrace"] = clip(text, MAX_STACK_LENGTH)
            frames = _frames_of(value)
            if frames:
                normalized["frames"] = frames

        cause = value.__cause__
        if cause is not None:
            normalized["cause"] = normalize_exception(cause, depth + 1, seen)

        context = value.__context__
        # Suppressed by `raise ... from ...`, and not worth repeating when it is
        # the same object the cause already describes.
        if context is not None and not value.__suppress_context__ and context is not cause:
            normalized["context"] = normalize_exception(context, depth + 1, seen)

        if isinstance(value, BaseExceptionGroup):
            # `BaseExceptionGroup`, not `ExceptionGroup`, so a group carrying a
            # KeyboardInterrupt is still described rather than skipped.
            children = [
                normalize_exception(child, depth + 1, seen)
                for child in value.exceptions[:MAX_CHILDREN]
            ]
            if children:
                normalized["children"] = children

        return normalized
    finally:
        # Removed on the way out, so a sibling referenced twice is expanded
        # twice and only a true cycle collapses.
        seen.pop(identity, None)


# -- attributes -----------------------------------------------------------


def _is_sensitive(key: str) -> bool:
    return _SENSITIVE.search(key) is not None


def _scalar(value: object) -> JsonValue | None:
    """Encode a leaf, or return None if it is not one."""
    # `bool` first: `isinstance(True, int)` is True, and a flag arriving as 1
    # would be a quiet, hard-to-spot corruption of the stored attribute.
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return truncate(value, MAX_REPRESENTATION_LENGTH)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return value
    return None


def sanitize_json_value(
    value: object, depth: int = 0, seen: frozenset[int] = frozenset()
) -> JsonValue:
    """Coerce an arbitrary value into something the server will store."""
    scalar = _scalar(value)
    if scalar is not None or value is None:
        return scalar

    if depth >= MAX_ATTRIBUTE_DEPTH:
        return "[Truncated]"

    if isinstance(value, BaseException):
        return {
            "type": type(value).__name__,
            "message": truncate(str(value), MAX_REPRESENTATION_LENGTH),
        }

    if id(value) in seen:
        return "[Circular]"
    nested = seen | {id(value)}

    if isinstance(value, Mapping):
        result: dict[str, JsonValue] = {}
        for key, item in islice(value.items(), MAX_ATTRIBUTE_ITEMS):
            name = key if isinstance(key, str) else str(key)
            if not name or len(name) > MAX_ATTRIBUTE_KEY_LENGTH:
                continue
            if _is_sensitive(name):
                result[name] = "[REDACTED]"
            else:
                result[name] = sanitize_json_value(item, depth + 1, nested)
        return result

    if isinstance(value, (list, tuple, set, frozenset)):
        items = sorted(value, key=repr) if isinstance(value, (set, frozenset)) else value
        return [
            sanitize_json_value(item, depth + 1, nested)
            for item in islice(items, MAX_ATTRIBUTE_ITEMS)
        ]

    return _representation(value)


def sanitize_attributes(
    attributes: Mapping[str, object] | None,
) -> dict[str, JsonValue] | None:
    """Bound, redact, and JSON-encode an attribute map.

    Returns None when there is nothing to send, so the key is omitted from the
    payload rather than sent as an empty object.
    """
    if attributes is None:
        return None

    result: dict[str, JsonValue] = {}
    for key, value in islice(attributes.items(), MAX_ATTRIBUTE_ITEMS):
        name = key if isinstance(key, str) else str(key)
        if not name or len(name) > MAX_ATTRIBUTE_KEY_LENGTH:
            continue
        if _is_sensitive(name):
            result[name] = "[REDACTED]"
            continue
        result[name] = sanitize_json_value(value)

    return result or None


def normalize_category(category: Sequence[str] | None) -> list[str] | None:
    """Validate a log category, raising at the call that supplied it."""
    if category is None:
        return None
    segments = list(category)
    if len(segments) > 16:
        raise ValueError("Dolshoe log categories cannot exceed 16 segments.")

    trimmed = [segment.strip() for segment in segments]
    for segment in trimmed:
        if not segment or len(segment) > MAX_ATTRIBUTE_KEY_LENGTH:
            raise ValueError(
                "Dolshoe log category segments must contain between 1 and 200 characters."
            )
    return trimmed or None
