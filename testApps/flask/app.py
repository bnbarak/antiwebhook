"""Flask test app for simplehook SDK."""

import logging
import os
import sys

from flask import Flask, request, jsonify
from simplehook_flask import listenToWebhooks

# Send simplehook logs to stdout so the e2e test can detect them
logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(message)s")

app = Flask(__name__)

listener_id = os.environ.get("SIMPLEHOOK_LISTENER") or None
opts = {
    "server_url": os.environ.get("SIMPLEHOOK_URL"),
    "force_enable": True,
}
if listener_id:
    opts["listener_id"] = listener_id
connection = listenToWebhooks(app, os.environ.get("SIMPLEHOOK_KEY", "ak_test"), opts)


@app.post("/stripe/events")
def stripe_events():
    print(f"[stripe] {request.json.get('type', 'unknown')}")
    return jsonify(received=True)


@app.post("/github/push")
def github_push():
    print(f"[github] {request.json.get('ref', 'unknown')}")
    return jsonify(ok=True)


@app.post("/twilio/voice")
def twilio_voice():
    print(f"[twilio] {request.json.get('CallSid', 'unknown')}")
    return '<Response><Say>Hello from simplehook!</Say></Response>', 200, {"Content-Type": "text/xml"}


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def catch_all(path):
    print(f"[webhook] {request.method} /{path}")
    return jsonify(received=True, path=f"/{path}", method=request.method)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3003))
    print(f"Flask test app listening on :{port}")
    print("Waiting for webhooks via simplehook...")
    app.run(host="0.0.0.0", port=port)
