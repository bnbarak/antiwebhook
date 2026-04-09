export type {
  RequestFrame,
  ResponseFrame,
  PingFrame,
  InboundFrame,
  ListenOptions,
  Connection,
  DispatchFn,
} from "@simplehook/core";

export interface App {
  handle(req: unknown, res: unknown): void;
}
