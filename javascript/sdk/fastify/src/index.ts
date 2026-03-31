import type { FastifyInstance } from "fastify";
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

export type { Connection, ListenOptions, RequestFrame, ResponseFrame };

export function listenToWebhooks(
  app: FastifyInstance,
  apiKey: string,
  opts: ListenOptions = {},
): Connection {
  const dispatch = async (frame: RequestFrame): Promise<ResponseFrame> => {
    const bodyBuffer = frame.body ? Buffer.from(frame.body, "base64") : null;
    const headers = sanitizeHeaders(frame.headers ?? {}, bodyBuffer?.length ?? null);

    try {
      const response = await app.inject({
        method: frame.method as any,
        url: frame.path,
        headers,
        payload: bodyBuffer ?? undefined,
      });

      const respHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (typeof v === "string") respHeaders[k] = v;
      }

      const responseBody = response.rawPayload;

      return {
        type: "response",
        id: frame.id,
        status: response.statusCode,
        headers: respHeaders,
        body: responseBody.length > 0 ? responseBody.toString("base64") : null,
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

  return createClient(dispatch, apiKey, opts);
}

/** @deprecated Use `listenToWebhooks` instead. */
export const listen = listenToWebhooks;
