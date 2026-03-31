from __future__ import annotations

import warnings
from typing import Any

from flask import Flask
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


def _make_dispatch(app: Flask) -> Any:
    """Return a dispatch function that forwards requests through a loopback
    WSGI server to the Flask app."""
    from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server
    import http.client
    import threading

    class QuietHandler(WSGIRequestHandler):
        """Suppress request logging from the loopback server."""

        def log_request(self, code: str | int = "-", size: str | int = "-") -> None:
            pass

    server = make_server("127.0.0.1", 0, app, server_class=WSGIServer, handler_class=QuietHandler)
    port = server.server_address[1]

    loopback_thread = threading.Thread(target=server.serve_forever, daemon=True)
    loopback_thread.start()

    def dispatch(frame: RequestFrame) -> ResponseFrame:
        body: bytes | None = None
        if frame.get("body"):
            body = decode_body(frame["body"])

        raw_headers = frame.get("headers") or {}
        body_length = len(body) if body else None
        headers = sanitize_headers(raw_headers, body_length)

        try:
            http_conn = http.client.HTTPConnection("127.0.0.1", port)
            http_conn.request(
                frame["method"],
                frame["path"],
                body=body,
                headers=headers,
            )
            response = http_conn.getresponse()

            resp_headers: dict[str, str] = {}
            for k, v in response.getheaders():
                resp_headers[k.lower()] = v

            resp_body = response.read()
            result: ResponseFrame = {
                "type": "response",
                "id": frame["id"],
                "status": response.status,
                "headers": resp_headers,
                "body": encode_body(resp_body) if resp_body else None,
            }
            http_conn.close()
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
    app: Flask,
    api_key: str,
    opts: ListenOptions | None = None,
) -> Connection:
    if opts is None:
        opts = {}

    # Check noop conditions before starting any servers
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


def listen(
    app: Flask,
    api_key: str,
    opts: ListenOptions | None = None,
) -> Connection:
    """Deprecated: use listenToWebhooks() instead."""
    warnings.warn(
        "listen() is deprecated, use listenToWebhooks() instead",
        DeprecationWarning,
        stacklevel=2,
    )
    return listenToWebhooks(app, api_key, opts)
