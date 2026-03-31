export type {
  RequestFrame,
  ResponseFrame,
  PingFrame,
  InboundFrame,
  ListenOptions,
  Connection,
  DispatchFn,
} from "simplehook-core";

import { Hono } from "hono";

export type App = InstanceType<typeof Hono>;
