const WebSocket = require('ws');
const http = require('http');

const DEFAULT_URL = 'wss://hooks.antiwebhooks.dev';

/**
 * Connect your Express app to antiwebhooks.
 * Webhooks sent to your stable URL will be forwarded to your app.
 *
 * @param {object} app - Express app instance (or any object with .handle(req, res))
 * @param {string} apiKey - Your API key (ak_...)
 * @param {object} [opts]
 * @param {boolean} [opts.forceEnable] - Connect even in production
 * @param {string} [opts.serverUrl] - Override the antiwebhooks server URL
 * @param {function} [opts.onConnect] - Called when connection is established
 * @param {function} [opts.onDisconnect] - Called when disconnected
 * @param {boolean} [opts.silent] - Suppress console output
 */
function listen(app, apiKey, opts = {}) {
  // Dev mode guard: skip in production unless forced
  if (!opts.forceEnable && process.env.NODE_ENV === 'production') {
    return { close() {} };
  }
  if (process.env.ANTIWEBHOOKS_ENABLED === 'false') return { close() {} };

  const serverUrl = opts.serverUrl || process.env.ANTIWEBHOOKS_URL || DEFAULT_URL;
  const log = opts.silent ? () => {} : console.log.bind(console);
  let backoff = 1000;
  let closed = false;
  let currentWs = null;

  // Spin up a loopback HTTP server that feeds requests into app.handle()
  // This is the most reliable way to synthesize requests — no mocking needed.
  let loopbackPort = null;
  const loopbackServer = http.createServer((req, res) => {
    app.handle(req, res);
  });

  loopbackServer.listen(0, '127.0.0.1', () => {
    loopbackPort = loopbackServer.address().port;
    connect();
  });

  function connect() {
    if (closed) return;
    const ws = new WebSocket(`${serverUrl}/tunnel?key=${apiKey}`);
    currentWs = ws;

    ws.on('open', () => {
      log('[antiwebhooks] connected');
      backoff = 1000;
      if (opts.onConnect) opts.onConnect();
    });

    ws.on('message', (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch { return; }

      if (frame.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (frame.type !== 'request') return;

      // Forward via real HTTP to our loopback server
      const body = frame.body ? Buffer.from(frame.body, 'base64') : null;
      const headers = lowerKeys(frame.headers || {});
      // Strip hop-by-hop headers that cause issues on the loopback
      delete headers['host'];
      delete headers['connection'];
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      if (body) headers['content-length'] = String(body.length);

      const reqOpts = {
        hostname: '127.0.0.1',
        port: loopbackPort,
        path: frame.path,
        method: frame.method,
        headers,
      };

      const proxyReq = http.request(reqOpts, (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          const respHeaders = {};
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (typeof v === 'string') respHeaders[k] = v;
          }

          try {
            ws.send(JSON.stringify({
              type: 'response',
              id: frame.id,
              status: proxyRes.statusCode,
              headers: respHeaders,
              body: responseBody.length > 0 ? responseBody.toString('base64') : null,
            }));
          } catch {
            // WS might have closed
          }
        });
      });

      proxyReq.on('error', () => {
        try {
          ws.send(JSON.stringify({
            type: 'response',
            id: frame.id,
            status: 502,
            headers: {},
            body: null,
          }));
        } catch {}
      });

      if (body) proxyReq.write(body);
      proxyReq.end();
    });

    ws.on('close', () => {
      if (closed) return;
      log(`[antiwebhooks] disconnected, reconnecting in ${backoff / 1000}s...`);
      if (opts.onDisconnect) opts.onDisconnect();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30000);
    });

    ws.on('error', () => {});
  }

  return {
    close() {
      closed = true;
      if (currentWs) { currentWs.close(); currentWs = null; }
      loopbackServer.close();
    },
  };
}

function lowerKeys(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k.toLowerCase()] = v;
  }
  return result;
}

module.exports = { listen };
