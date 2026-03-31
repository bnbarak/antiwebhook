from __future__ import annotations

import os

from simplehook_core.utils import (
    HOP_BY_HOP_HEADERS,
    decode_body,
    encode_body,
    is_explicitly_disabled,
    parse_frame,
    sanitize_headers,
)

__all__ = [
    "HOP_BY_HOP_HEADERS",
    "decode_body",
    "encode_body",
    "is_explicitly_disabled",
    "is_production",
    "parse_frame",
    "sanitize_headers",
]


def is_production() -> bool:
    return (
        os.environ.get("FASTAPI_ENV") == "production"
        or os.environ.get("ENV") == "production"
    )
