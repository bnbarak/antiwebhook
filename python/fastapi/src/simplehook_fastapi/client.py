from __future__ import annotations

import asyncio
from typing import Any, Callable

import httpx
from simplehook_core import (
    Connection,
    create_client,
    decode_body,
    encode_body,
    is_explicitly_disabled,
    sanitize_headers,
)
from simplehook_core.types import RequestFrame, ResponseFrame

from .types import ListenOptions
from .utils import is_production


def _make_dispatch(app: Any) -> Callable[[RequestFrame], ResponseFrame]:
    """Return a dispatch function that forwards requests through the ASGI
    application using httpx's ASGITransport (no loopback server needed)."""

    transport = httpx.ASGITransport(app=app)

    async def _async_dispatch(frame: RequestFrame, headers: dict[str, str], body: bytes | None) -> ResponseFrame:
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.request(
                method=frame["method"],
                url=frame["path"],
                headers=headers,
                content=body,
            )

        resp_headers: dict[str, str] = {}
        for k, v in response.headers.items():
            resp_headers[k.lower()] = v

        resp_body = response.content
        return {
            "type": "response",
            "id": frame["id"],
            "status": response.status_code,
            "headers": resp_headers,
            "body": encode_body(resp_body) if resp_body else None,
        }

    def dispatch(frame: RequestFrame) -> ResponseFrame:
        body: bytes | None = None
        if frame.get("body"):
            body = decode_body(frame["body"])

        raw_headers = frame.get("headers") or {}
        body_length = len(body) if body else None
        headers = sanitize_headers(raw_headers, body_length)

        try:
            result: ResponseFrame = asyncio.run(_async_dispatch(frame, headers, body))
        except Exception:
            result = {
                "type": "response",
                "id": frame["id"],
                "status": 502,
                "headers": {},
                "body": None,
            }

        return result

    return dispatch


def _noop_connection() -> Connection:
    conn = Connection()
    conn._closed = True
    return conn


def listenToWebhooks(
    app: Any,
    api_key: str,
    listener_id: str | ListenOptions | None = None,
    opts: ListenOptions | None = None,
) -> Connection:
    """Connect to the SimpleHook tunnel and forward webhooks to a FastAPI app.

    Parameters
    ----------
    app:
        A FastAPI application instance.
    api_key:
        Your SimpleHook API key.
    listener_id:
        Optional listener ID string, or a ``ListenOptions`` dict for
        backwards compatibility.
    opts:
        Optional configuration (see ``ListenOptions``).
    """
    if isinstance(listener_id, dict):
        opts = listener_id
        listener_id = None
    if opts is None:
        opts = {}
    if isinstance(listener_id, str):
        opts = {**opts, "listener_id": listener_id}

    # Check noop conditions before creating dispatch
    force_enable = opts.get("force_enable", False)
    if not force_enable and is_production():
        return _noop_connection()
    if is_explicitly_disabled():
        return _noop_connection()

    dispatch = _make_dispatch(app)
    return create_client(
        dispatch,
        api_key,
        opts,
        is_production=None,  # Already checked above
    )
