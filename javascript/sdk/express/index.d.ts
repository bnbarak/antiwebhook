interface ListenOptions {
  /** Connect even in production (default: false) */
  forceEnable?: boolean;
  /** Override the antiwebhooks server URL */
  serverUrl?: string;
  /** Called when WebSocket connection is established */
  onConnect?: () => void;
  /** Called when WebSocket disconnects */
  onDisconnect?: () => void;
  /** Suppress console output */
  silent?: boolean;
}

/**
 * Connect your Express app to antiwebhooks.
 * Webhooks sent to your stable URL will be forwarded through a WebSocket
 * and dispatched through Express's router.
 */
export function listen(
  app: { handle: (req: any, res: any) => void },
  apiKey: string,
  opts?: ListenOptions,
): void;
