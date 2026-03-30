from __future__ import annotations

import os

from simplehook_flask.utils import (
    decode_body,
    encode_body,
    is_explicitly_disabled,
    is_production,
    parse_frame,
    sanitize_headers,
)


class TestSanitizeHeaders:
    def test_removes_hop_by_hop_headers(self) -> None:
        # Arrange
        raw = {
            "Host": "example.com",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
            "Content-Length": "42",
            "X-Custom": "value",
        }

        # Act
        result = sanitize_headers(raw, None)

        # Assert
        assert "host" not in result
        assert "connection" not in result
        assert "transfer-encoding" not in result
        assert "content-length" not in result
        assert result["x-custom"] == "value"

    def test_lowercases_header_names(self) -> None:
        # Arrange
        raw = {"X-Request-Id": "abc123", "Accept": "application/json"}

        # Act
        result = sanitize_headers(raw, None)

        # Assert
        assert result["x-request-id"] == "abc123"
        assert result["accept"] == "application/json"

    def test_sets_content_length_from_body(self) -> None:
        # Arrange
        raw = {"X-Custom": "value"}

        # Act
        result = sanitize_headers(raw, 128)

        # Assert
        assert result["content-length"] == "128"

    def test_omits_content_length_when_body_is_none(self) -> None:
        # Arrange
        raw = {"X-Custom": "value"}

        # Act
        result = sanitize_headers(raw, None)

        # Assert
        assert "content-length" not in result

    def test_omits_content_length_when_body_is_zero(self) -> None:
        # Arrange
        raw = {"X-Custom": "value"}

        # Act
        result = sanitize_headers(raw, 0)

        # Assert
        assert "content-length" not in result

    def test_empty_headers(self) -> None:
        # Arrange / Act
        result = sanitize_headers({}, None)

        # Assert
        assert result == {}


class TestIsProduction:
    def test_true_when_flask_env_is_production(self, monkeypatch: object) -> None:
        # Arrange
        os.environ["FLASK_ENV"] = "production"

        # Act
        result = is_production()

        # Assert
        assert result is True

        # Cleanup
        del os.environ["FLASK_ENV"]

    def test_false_when_flask_env_is_not_production(self, monkeypatch: object) -> None:
        # Arrange
        os.environ.pop("FLASK_ENV", None)

        # Act
        result = is_production()

        # Assert
        assert result is False


class TestIsExplicitlyDisabled:
    def test_true_when_set_to_false_string(self) -> None:
        # Arrange
        os.environ["SIMPLEHOOK_ENABLED"] = "false"

        # Act
        result = is_explicitly_disabled()

        # Assert
        assert result is True

        # Cleanup
        del os.environ["SIMPLEHOOK_ENABLED"]

    def test_false_when_not_set(self) -> None:
        # Arrange
        os.environ.pop("SIMPLEHOOK_ENABLED", None)

        # Act
        result = is_explicitly_disabled()

        # Assert
        assert result is False

    def test_false_when_set_to_true(self) -> None:
        # Arrange
        os.environ["SIMPLEHOOK_ENABLED"] = "true"

        # Act
        result = is_explicitly_disabled()

        # Assert
        assert result is False

        # Cleanup
        del os.environ["SIMPLEHOOK_ENABLED"]


class TestParseFrame:
    def test_parses_valid_json_string(self) -> None:
        # Arrange
        raw = '{"type": "ping"}'

        # Act
        result = parse_frame(raw)

        # Assert
        assert result == {"type": "ping"}

    def test_parses_valid_json_bytes(self) -> None:
        # Arrange
        raw = b'{"type": "request", "id": "evt_1"}'

        # Act
        result = parse_frame(raw)

        # Assert
        assert result["type"] == "request"
        assert result["id"] == "evt_1"

    def test_returns_none_for_invalid_json(self) -> None:
        # Arrange
        raw = "not json"

        # Act
        result = parse_frame(raw)

        # Assert
        assert result is None

    def test_returns_none_for_none_input(self) -> None:
        # Act
        result = parse_frame(None)

        # Assert
        assert result is None


class TestEncodeDecodeBody:
    def test_roundtrip(self) -> None:
        # Arrange
        original = b"hello world"

        # Act
        encoded = encode_body(original)
        decoded = decode_body(encoded)

        # Assert
        assert decoded == original

    def test_encode_returns_ascii_string(self) -> None:
        # Arrange
        data = b"\x00\x01\x02\xff"

        # Act
        result = encode_body(data)

        # Assert
        assert isinstance(result, str)
        assert result.isascii()

    def test_decode_returns_bytes(self) -> None:
        # Arrange
        encoded = "aGVsbG8="

        # Act
        result = decode_body(encoded)

        # Assert
        assert result == b"hello"
