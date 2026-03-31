from __future__ import annotations

import base64
import json
import os
import time

from flask import Flask

from simplehook_flask import listenToWebhooks
from simplehook_flask.client import Connection

from .conftest import MockWSServer


class TestListenToWebhooks:
    def test_returns_noop_in_production(self, flask_app: Flask) -> None:
        # Arrange
        os.environ["FLASK_ENV"] = "production"

        # Act
        conn = listenToWebhooks(flask_app, "test_key")

        # Assert
        assert isinstance(conn, Connection)
        assert conn._closed is True

        # Cleanup
        del os.environ["FLASK_ENV"]

    def test_returns_noop_when_explicitly_disabled(self, flask_app: Flask) -> None:
        # Arrange
        os.environ["SIMPLEHOOK_ENABLED"] = "false"

        # Act
        conn = listenToWebhooks(flask_app, "test_key")

        # Assert
        assert conn._closed is True

        # Cleanup
        del os.environ["SIMPLEHOOK_ENABLED"]

    def test_force_enable_overrides_production(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        os.environ["FLASK_ENV"] = "production"

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "force_enable": True,
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        assert conn._closed is False

        # Cleanup
        conn.close()
        del os.environ["FLASK_ENV"]




class TestListenerId:
    def test_listener_id_in_ws_url_via_opts(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
            "listener_id": "my-listener",
        })
        time.sleep(0.5)

        # Assert
        assert mock_ws_server.last_connection_path is not None
        assert "listener_id=my-listener" in mock_ws_server.last_connection_path

        # Cleanup
        conn.close()

    def test_listener_id_in_ws_url_via_shorthand(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Act
        conn = listenToWebhooks(flask_app, "test_key", "my-listener", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        assert mock_ws_server.last_connection_path is not None
        assert "listener_id=my-listener" in mock_ws_server.last_connection_path

        # Cleanup
        conn.close()

    def test_no_listener_id_when_not_set(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        assert mock_ws_server.last_connection_path is not None
        assert "listener_id" not in mock_ws_server.last_connection_path

        # Cleanup
        conn.close()


class TestPingPong:
    def test_responds_to_ping_with_pong(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        mock_ws_server.frames_to_send = [{"type": "ping"}]

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        pong_frames = [m for m in mock_ws_server.received_messages if m.get("type") == "pong"]
        assert len(pong_frames) >= 1

        # Cleanup
        conn.close()


class TestRequestForwarding:
    def test_forwards_post_request_to_flask(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        body_bytes = b'{"event": "charge.completed"}'
        mock_ws_server.frames_to_send = [{
            "type": "request",
            "id": "evt_123",
            "method": "POST",
            "path": "/webhook",
            "headers": {"content-type": "application/json"},
            "body": base64.b64encode(body_bytes).decode(),
        }]

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        responses = [
            m for m in mock_ws_server.received_messages if m.get("type") == "response"
        ]
        assert len(responses) >= 1
        resp = responses[0]
        assert resp["id"] == "evt_123"
        assert resp["status"] == 200
        assert resp["body"] is not None

        resp_body = json.loads(base64.b64decode(resp["body"]))
        assert "received" in resp_body

        # Cleanup
        conn.close()

    def test_forwards_get_request(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        mock_ws_server.frames_to_send = [{
            "type": "request",
            "id": "evt_456",
            "method": "GET",
            "path": "/health",
            "headers": {},
            "body": None,
        }]

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        responses = [
            m for m in mock_ws_server.received_messages if m.get("type") == "response"
        ]
        assert len(responses) >= 1
        resp = responses[0]
        assert resp["id"] == "evt_456"
        assert resp["status"] == 200
        body_text = base64.b64decode(resp["body"]).decode()
        assert body_text == "ok"

        # Cleanup
        conn.close()

    def test_returns_404_for_unknown_route(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        mock_ws_server.frames_to_send = [{
            "type": "request",
            "id": "evt_789",
            "method": "GET",
            "path": "/nonexistent",
            "headers": {},
            "body": None,
        }]

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.5)

        # Assert
        responses = [
            m for m in mock_ws_server.received_messages if m.get("type") == "response"
        ]
        assert len(responses) >= 1
        assert responses[0]["status"] == 404

        # Cleanup
        conn.close()


class TestCallbacks:
    def test_on_connect_callback_fires(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        connected = []

        # Act
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
            "on_connect": lambda: connected.append(True),
        })
        time.sleep(0.5)

        # Assert
        assert len(connected) >= 1

        # Cleanup
        conn.close()


class TestConnectionClose:
    def test_close_stops_connection(
        self, flask_app: Flask, mock_ws_server: MockWSServer,
    ) -> None:
        # Arrange
        conn = listenToWebhooks(flask_app, "test_key", {
            "server_url": mock_ws_server.url,
            "silent": True,
        })
        time.sleep(0.3)

        # Act
        conn.close()

        # Assert
        assert conn._closed is True
        assert conn._ws is None
