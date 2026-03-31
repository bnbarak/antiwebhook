from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Callable

import websockets.sync.client as ws_client

from .types import ListenOptions, RequestFrame, ResponseFrame
from .utils import is_explicitly_disabled, parse_frame

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


DispatchFn = Callable[[RequestFrame], ResponseFrame]


def _noop_connection() -> Connection:
    conn = Connection()
    conn._closed = True
    return conn


def create_client(
    dispatch_fn: DispatchFn,
    api_key: str,
    opts: ListenOptions | None = None,
    *,
    is_production: Callable[[], bool] | None = None,
) -> Connection:
    """Create a WebSocket tunnel client.

    Parameters
    ----------
    dispatch_fn:
        Framework-specific callable that takes a ``RequestFrame`` and returns
        a ``ResponseFrame``.
    api_key:
        Your SimpleHook API key.
    opts:
        Optional configuration (see ``ListenOptions``).
    is_production:
        Framework-specific callable that returns ``True`` when the app is
        running in production mode.  When not supplied the production check
        is skipped.
    """
    if opts is None:
        opts = {}

    force_enable = opts.get("force_enable", False)
    if not force_enable and is_production is not None and is_production():
        return _noop_connection()
    if is_explicitly_disabled():
        return _noop_connection()

    import os

    server_url = opts.get("server_url") or os.environ.get("SIMPLEHOOK_URL") or DEFAULT_URL
    listener_id: str | None = opts.get("listener_id")
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
                    dispatch_fn, conn, api_key, server_url, listener_id, log, on_connect, on_disconnect,
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
    dispatch_fn: DispatchFn,
    conn: Connection,
    api_key: str,
    server_url: str,
    listener_id: str | None,
    log: Callable[[str], None],
    on_connect: Callable[[], None] | None,
    on_disconnect: Callable[[], None] | None,
) -> None:
    url = f"{server_url}/tunnel?key={api_key}"
    if listener_id:
        url += f"&listener_id={listener_id}"
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
                response_frame = dispatch_fn(parsed)
                try:
                    ws.send(json.dumps(response_frame))
                except Exception:
                    pass
    finally:
        conn._ws = None
        try:
            ws.close()
        except Exception:
            pass
