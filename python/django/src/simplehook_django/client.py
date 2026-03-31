from __future__ import annotations

import io
import json
import logging
import threading
import time
from typing import Any, Callable

import websockets.sync.client as ws_client

from .types import ListenOptions, RequestFrame, ResponseFrame
from .utils import (
    decode_body,
    encode_body,
    is_explicitly_disabled,
    is_production,
    parse_frame,
    sanitize_headers,
)

DEFAULT_URL = "wss://hook.simplehook.dev"
MAX_BACKOFF = 30.0

logger = logging.getLogger("simplehook")


class Connection:
    def __init__(self) -> None:
        self._closed = False
        self._ws: Any | None = None
        self._thread: threading.Thread | None = None

    def close(self) -> None:
        self._closed = True
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None


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

    force_enable = opts.get("force_enable", False)
    if not force_enable and is_production():
        return _noop_connection()
    if is_explicitly_disabled():
        return _noop_connection()

    import os

    server_url = opts.get("server_url") or os.environ.get("SIMPLEHOOK_URL") or DEFAULT_URL
    silent = opts.get("silent", False)
    on_connect: Callable[[], None] | None = opts.get("on_connect")
    on_disconnect: Callable[[], None] | None = opts.get("on_disconnect")

    def log(msg: str) -> None:
        if not silent:
            logger.info(msg)

    conn = Connection()

    def run_loop() -> None:
        backoff = 1.0

        while not conn._closed:
            try:
                _connect_and_handle(
                    application, conn, api_key, server_url, log, on_connect, on_disconnect,
                )
                backoff = 1.0
            except Exception:
                if conn._closed:
                    return
                log(f"[simplehook] disconnected, reconnecting in {backoff:.0f}s...")
                if on_disconnect:
                    on_disconnect()
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    thread = threading.Thread(target=run_loop, daemon=True)
    conn._thread = thread
    thread.start()

    return conn


def _connect_and_handle(
    application: Any,
    conn: Connection,
    api_key: str,
    server_url: str,
    log: Callable[[str], None],
    on_connect: Callable[[], None] | None,
    on_disconnect: Callable[[], None] | None,
) -> None:
    url = f"{server_url}/tunnel?key={api_key}"
    ws = ws_client.connect(url)
    conn._ws = ws

    try:
        log("[simplehook] connected")
        if on_connect:
            on_connect()

        for raw in ws:
            if conn._closed:
                return

            parsed = parse_frame(raw)
            if not parsed or not isinstance(parsed, dict):
                continue

            frame_type = parsed.get("type")

            if frame_type == "ping":
                ws.send(json.dumps({"type": "pong"}))
                continue

            if frame_type == "request":
                _forward_to_app(application, ws, parsed)
    finally:
        conn._ws = None
        try:
            ws.close()
        except Exception:
            pass


def _forward_to_app(
    application: Any,
    ws: Any,
    frame: RequestFrame,
) -> None:
    body: bytes | None = None
    if frame.get("body"):
        body = decode_body(frame["body"])

    raw_headers = frame.get("headers") or {}
    body_length = len(body) if body else None
    headers = sanitize_headers(raw_headers, body_length)

    try:
        response_data = _dispatch_via_wsgi(application, frame, headers, body)
        response_frame: ResponseFrame = response_data
    except Exception:
        response_frame = {
            "type": "response",
            "id": frame["id"],
            "status": 502,
            "headers": {},
            "body": None,
        }

    try:
        ws.send(json.dumps(response_frame))
    except Exception:
        pass


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
