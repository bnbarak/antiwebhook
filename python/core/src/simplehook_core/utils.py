from __future__ import annotations

import base64
import json
import os
from typing import Any

HOP_BY_HOP_HEADERS = frozenset({
    "host",
    "connection",
    "transfer-encoding",
    "content-length",
})


def sanitize_headers(
    raw: dict[str, str],
    body_length: int | None,
) -> dict[str, str]:
    out: dict[str, str] = {}

    for k, v in raw.items():
        lower = k.lower()
        if lower not in HOP_BY_HOP_HEADERS:
            out[lower] = v

    if body_length is not None and body_length > 0:
        out["content-length"] = str(body_length)

    return out


def is_explicitly_disabled() -> bool:
    return os.environ.get("SIMPLEHOOK_ENABLED") == "false"


def parse_frame(raw: str | bytes) -> Any | None:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def encode_body(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def decode_body(data: str) -> bytes:
    return base64.b64decode(data)
