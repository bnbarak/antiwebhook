from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, Generator

import pytest
import websockets.server


class MockWSServer:
    def __init__(self) -> None:
        self.received_messages: list[dict[str, Any]] = []
        self.frames_to_send: list[dict[str, Any]] = []
        self._server: Any = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self.port: int = 0
        self._ready = threading.Event()
        self._connections: list[Any] = []

    async def _handler(self, websocket: Any) -> None:
        self._connections.append(websocket)
        try:
            for frame in self.frames_to_send:
                await websocket.send(json.dumps(frame))

            async for message in websocket:
                parsed = json.loads(message)
                self.received_messages.append(parsed)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._connections.remove(websocket)

    def start(self) -> None:
        self._loop = asyncio.new_event_loop()

        async def _run() -> None:
            self._server = await websockets.server.serve(
                self._handler,
                "127.0.0.1",
                0,
            )
            addrs = self._server.sockets[0].getsockname()
            self.port = addrs[1]
            self._ready.set()
            await asyncio.Future()

        def _thread_target() -> None:
            assert self._loop is not None
            self._loop.run_until_complete(_run())

        self._thread = threading.Thread(target=_thread_target, daemon=True)
        self._thread.start()
        self._ready.wait(timeout=5)

    def stop(self) -> None:
        if self._server and self._loop:
            self._loop.call_soon_threadsafe(self._server.close)

    @property
    def url(self) -> str:
        return f"ws://127.0.0.1:{self.port}"


@pytest.fixture()
def mock_ws_server() -> Generator[MockWSServer, None, None]:
    server = MockWSServer()
    server.start()
    yield server
    server.stop()
