"""FastAPI test app for simplehook SDK."""

import logging
import os
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from simplehook_fastapi import listenToWebhooks

# Send simplehook logs to stdout so the e2e test can detect them
logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(message)s")

app = FastAPI()

listener_id = os.environ.get("SIMPLEHOOK_LISTENER") or None
connection = listenToWebhooks(
    app,
    os.environ.get("SIMPLEHOOK_KEY", "ak_test"),
    listener_id,
    {
        "server_url": os.environ.get("SIMPLEHOOK_URL"),
        "force_enable": True,
    },
)


@app.post("/stripe/events")
async def stripe_events(request: Request) -> JSONResponse:
    body = await request.json()
    print(f"[stripe] {body.get('type', 'unknown')}")
    return JSONResponse({"received": True})


@app.post("/github/push")
async def github_push(request: Request) -> JSONResponse:
    body = await request.json()
    print(f"[github] {body.get('ref', 'unknown')}")
    return JSONResponse({"ok": True})


@app.post("/twilio/voice")
async def twilio_voice(request: Request) -> Response:
    body = await request.json()
    print(f"[twilio] {body.get('CallSid', 'unknown')}")
    return Response(
        content="<Response><Say>Hello from simplehook!</Say></Response>",
        media_type="text/xml",
    )


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def catch_all(request: Request, path: str = "") -> JSONResponse:
    print(f"[webhook] {request.method} /{path}")
    return JSONResponse({"received": True, "path": f"/{path}", "method": request.method})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 3003))
    print(f"FastAPI test app listening on :{port}")
    print("Waiting for webhooks via simplehook...")
    uvicorn.run(app, host="0.0.0.0", port=port)
