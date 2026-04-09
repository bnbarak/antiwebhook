import type { App } from "./types.js";
import {
  createClient,
  sanitizeHeaders,
} from "@simplehook/core";
import type {
  Connection,
  ListenOptions,
  RequestFrame,
  ResponseFrame,
} from "@simplehook/core";

export type { Connection, ListenOptions, RequestFrame, ResponseFrame };

export function listenToWebhooks(
  app: App,
  apiKey: string,
  listenerIdOrOpts?: string | ListenOptions,
  opts?: ListenOptions,
): Connection {
  let resolvedOpts: ListenOptions;
  if (typeof listenerIdOrOpts === "string") {
    resolvedOpts = { ...opts, listenerId: listenerIdOrOpts };
  } else {
    resolvedOpts = listenerIdOrOpts ?? opts ?? {};
  }

  const dispatch = async (frame: RequestFrame): Promise<ResponseFrame> => {
    const bodyBuffer = frame.body ? Buffer.from(frame.body, "base64") : null;
    const headers = sanitizeHeaders(frame.headers ?? {}, bodyBuffer?.length ?? null);

    try {
      const response = await app.request(frame.path, {
        method: frame.method,
        headers,
        body: bodyBuffer,
      });

      const respBody = Buffer.from(await response.arrayBuffer());
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });

      return {
        type: "response",
        id: frame.id,
        status: response.status,
        headers: respHeaders,
        body: respBody.length > 0 ? respBody.toString("base64") : null,
      };
    } catch {
      return {
        type: "response",
        id: frame.id,
        status: 502,
        headers: {},
        body: null,
      };
    }
  };

  return createClient(dispatch, apiKey, resolvedOpts);
}
