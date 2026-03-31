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
    """Check if running in production by inspecting Django's DEBUG setting.

    Falls back to the DJANGO_SETTINGS_MODULE / DEBUG environment variable
    when Django settings are not configured.
    """
    try:
        from django.conf import settings

        if settings.configured:
            return not settings.DEBUG
    except Exception:
        pass

    return os.environ.get("DJANGO_DEBUG", "").lower() == "false"
