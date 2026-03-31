from __future__ import annotations

from typing import TypedDict


class RequestFrame(TypedDict):
    type: str
    id: str
    method: str
    path: str
    headers: dict[str, str]
    body: str | None


class ResponseFrame(TypedDict):
    type: str
    id: str
    status: int
    headers: dict[str, str]
    body: str | None


class PingFrame(TypedDict):
    type: str


class ListenOptions(TypedDict, total=False):
    force_enable: bool
    server_url: str
    on_connect: callable
    on_disconnect: callable
    silent: bool
