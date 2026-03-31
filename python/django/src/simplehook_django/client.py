from __future__ import annotations

import io
from typing import Any, Callable

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


def _make_dispatch(application: Any) -> Callable[[RequestFrame], ResponseFrame]:
    """Return a dispatch function that forwards requests through the WSGI
    application directly (no loopback server needed)."""

    def dispatch(frame: RequestFrame) -> ResponseFrame:
        body: bytes | None = None
        if frame.get("body"):
            body = decode_body(frame["body"])

        raw_headers = frame.get("headers") or {}
        body_length = len(body) if body else None
        headers = sanitize_headers(raw_headers, body_length)

        try:
            return _dispatch_via_wsgi(application, frame, headers, body)
        except Exception:
            return {
                "type": "response",
                "id": frame["id"],
                "status": 502,
                "headers": {},
                "body": None,
            }

    return dispatch


def _dispatch_via_wsgi(
    application: Any,
    frame: RequestFrame,
    headers: dict[str, str],
    body: bytes | None,
) -> ResponseFrame:
    """Dispatch the request through the WSGI application directly.

    This builds a minimal WSGI environ dict and calls the application
    callable, which works with Django's WSGIHandler and any other
    WSGI-compatible application.
    """
    path = frame["path"]
    method = frame["method"].upper()

    # Split path and query string
    if "?" in path:
        path_info, query_string = path.split("?", 1)
    else:
        path_info = path
        query_string = ""

    body_stream = io.BytesIO(body) if body else io.BytesIO(b"")
    content_length = str(len(body)) if body else "0"
    content_type = headers.get("content-type", "application/octet-stream")

    environ: dict[str, Any] = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path_info,
        "QUERY_STRING": query_string,
        "CONTENT_TYPE": content_type,
        "CONTENT_LENGTH": content_length,
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": body_stream,
        "wsgi.errors": io.BytesIO(),
        "wsgi.multithread": True,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "SCRIPT_NAME": "",
    }

    # Map sanitized headers into CGI-style environ keys
    for key, value in headers.items():
        cgi_key = "HTTP_" + key.upper().replace("-", "_")
        # content-type and content-length are special in WSGI
        if key == "content-type":
            continue  # already set as CONTENT_TYPE
        if key == "content-length":
            continue  # already set as CONTENT_LENGTH
        environ[cgi_key] = value

    # Capture the response via start_response
    response_started: dict[str, Any] = {}

    def start_response(
        status: str,
        response_headers: list[tuple[str, str]],
        exc_info: Any = None,
    ) -> Callable[..., None]:
        status_code = int(status.split(" ", 1)[0])
        resp_headers: dict[str, str] = {}
        for k, v in response_headers:
            resp_headers[k.lower()] = v
        response_started["status"] = status_code
        response_started["headers"] = resp_headers
        return lambda s: None  # write() callable (unused)

    # Call the WSGI application
    result = application(environ, start_response)

    # Collect response body
    try:
        resp_body = b"".join(result)
    finally:
        if hasattr(result, "close"):
            result.close()

    return {
        "type": "response",
        "id": frame["id"],
        "status": response_started.get("status", 500),
        "headers": response_started.get("headers", {}),
        "body": encode_body(resp_body) if resp_body else None,
    }


def _noop_connection() -> Connection:
    conn = Connection()
    conn._closed = True
    return conn


def listenToWebhooks(
    application: Any,
    api_key: str,
    opts: ListenOptions | None = None,
) -> Connection:
    """Connect to the SimpleHook tunnel and forward webhooks to a Django app.

    Parameters
    ----------
    application:
        A Django WSGI application (e.g. from ``get_wsgi_application()``), or
        any WSGI-compatible callable.
    api_key:
        Your SimpleHook API key.
    opts:
        Optional configuration (see ``ListenOptions``).
    """
    if opts is None:
        opts = {}

    # Check noop conditions before creating dispatch
    force_enable = opts.get("force_enable", False)
    if not force_enable and is_production():
        return _noop_connection()
    if is_explicitly_disabled():
        return _noop_connection()

    dispatch = _make_dispatch(application)
    return create_client(
        dispatch,
        api_key,
        opts,
        is_production=None,  # Already checked above
    )
