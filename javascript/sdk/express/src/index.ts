import http from "node:http";
import {
  createClient,
  sanitizeHeaders,
} from "simplehook-core";
import type {
  Connection,
  ListenOptions,
  RequestFrame,
  ResponseFrame,
} from "simplehook-core";
import { isExplicitlyDisabled, isProduction } from "simplehook-core";

export type { Connection, ListenOptions, RequestFrame, ResponseFrame };
export type { App } from "./types.js";

import type { App } from "./types.js";

const NOOP_CONNECTION: Connection = { close() {} };

export function listenToWebhooks(app: App, apiKey: string, opts: ListenOptions = {}): Connection {
  if (!opts.forceEnable && isProduction()) return NOOP_CONNECTION;
  if (isExplicitlyDisabled()) return NOOP_CONNECTION;

  const loopback = http.createServer((req, res) => app.handle(req, res));
  let loopbackPort: number;
  let coreConn: Connection | null = null;
  let closed = false;

  loopback.listen(0, "127.0.0.1", () => {
    loopbackPort = (loopback.address() as { port: number }).port;

    const dispatch = (frame: RequestFrame): Promise<ResponseFrame> => {
      return new Promise((resolve) => {
        const body = frame.body ? Buffer.from(frame.body, "base64") : null;
        const headers = sanitizeHeaders(frame.headers ?? {}, body?.length ?? null);

        const proxyReq = http.request(
          {
            hostname: "127.0.0.1",
            port: loopbackPort,
            path: frame.path,
            method: frame.method,
            headers,
          },
          (proxyRes) => {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              const responseBody = Buffer.concat(chunks);
              const respHeaders: Record<string, string> = {};
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                if (typeof v === "string") respHeaders[k] = v;
              }

              resolve({
                type: "response",
                id: frame.id,
                status: proxyRes.statusCode ?? 500,
                headers: respHeaders,
                body: responseBody.length > 0 ? responseBody.toString("base64") : null,
              });
            });
          },
        );

        proxyReq.on("error", () => {
          resolve({
            type: "response",
            id: frame.id,
            status: 502,
            headers: {},
            body: null,
          });
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
      });
    };

    coreConn = createClient(dispatch, apiKey, opts);
  });

  return {
    close() {
      closed = true;
      coreConn?.close();
      coreConn = null;
      loopback.close();
    },
  };
}
