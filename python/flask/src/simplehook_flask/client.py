from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Callable

import websockets.sync.client as ws_client
from flask import Flask

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


def listen(
    app: Flask,
    api_key: str,
    opts: ListenOptions | None = None,
) -> Connection:
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
                    app, conn, api_key, server_url, log, on_connect, on_disconnect,
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
    app: Flask,
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
                _forward_to_app(app, ws, parsed)
    finally:
        conn._ws = None
        try:
            ws.close()
        except Exception:
            pass


def _forward_to_app(
    app: Flask,
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
        with app.test_client() as client:
            response = client.open(
                frame["path"],
                method=frame["method"],
                headers=headers,
                data=body,
            )

            resp_headers: dict[str, str] = {}
            for k, v in response.headers:
                resp_headers[k.lower()] = v

            resp_body = response.data
            response_frame: ResponseFrame = {
                "type": "response",
                "id": frame["id"],
                "status": response.status_code,
                "headers": resp_headers,
                "body": encode_body(resp_body) if resp_body else None,
            }
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
