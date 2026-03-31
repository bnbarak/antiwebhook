export interface RequestFrame {
  type: "request";
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ResponseFrame {
  type: "response";
  id: string;
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export interface PingFrame {
  type: "ping";
}

export type InboundFrame = RequestFrame | PingFrame;

export interface ListenOptions {
  forceEnable?: boolean;
  serverUrl?: string;
  listenerId?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  silent?: boolean;
}

export interface Connection {
  close(): void;
}

export type DispatchFn = (frame: RequestFrame) => Promise<ResponseFrame>;
