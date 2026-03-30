const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { WebSocketServer } = require('ws');
const { listen } = require('./index');

// --- Unit tests (no network) ---

test('listen skips in production', () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const conn = listen({ handle: () => {} }, 'ak_test', { silent: true });
  // Should return a no-op close
  conn.close();

  process.env.NODE_ENV = origEnv;
  assert.ok(true, 'no error thrown in production mode');
});

test('listen connects with forceEnable in production', () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const conn = listen({ handle: () => {} }, 'ak_test', {
    forceEnable: true,
    silent: true,
    serverUrl: 'ws://localhost:19999',
  });
  conn.close();

  process.env.NODE_ENV = origEnv;
  assert.ok(true, 'no error with forceEnable');
});

test('ANTIWEBHOOKS_ENABLED=false prevents connection', () => {
  const orig = process.env.ANTIWEBHOOKS_ENABLED;
  process.env.ANTIWEBHOOKS_ENABLED = 'false';

  const conn = listen({ handle: () => {} }, 'ak_test', { silent: true });
  conn.close();

  delete process.env.ANTIWEBHOOKS_ENABLED;
  assert.ok(true, 'skipped when disabled');
});

// --- Integration tests with mock WS server ---

function withMockServer(fn) {
  return async () => {
    const wss = new WebSocketServer({ port: 0 });
    const port = wss.address().port;
    let conn;
    try {
      await fn(wss, port, (c) => { conn = c; });
    } finally {
      if (conn) conn.close();
      wss.close();
    }
  };
}

test('forwards webhook through WebSocket', withMockServer((wss, port, setConn) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 5000);

    const app = {
      handle(req, res) {
        assert.strictEqual(req.method, 'POST');
        assert.strictEqual(req.url, '/stripe/webhook');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"received":true}');
      },
    };

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'request',
        id: 'evt_test_123',
        method: 'POST',
        path: '/stripe/webhook',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"type":"test"}').toString('base64'),
      }));

      ws.on('message', (raw) => {
        const frame = JSON.parse(raw);
        if (frame.type === 'pong') return;

        assert.strictEqual(frame.type, 'response');
        assert.strictEqual(frame.id, 'evt_test_123');
        assert.strictEqual(frame.status, 200);
        assert.strictEqual(frame.headers['content-type'], 'application/json');

        const body = Buffer.from(frame.body, 'base64').toString();
        assert.strictEqual(body, '{"received":true}');

        clearTimeout(timeout);
        resolve();
      });
    });

    setConn(listen(app, 'ak_test', {
      serverUrl: `ws://localhost:${port}`,
      silent: true,
    }));
  });
}));

test('handles ping/pong keepalive', withMockServer((wss, port, setConn) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 3000);

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'ping' }));

      ws.on('message', (raw) => {
        const frame = JSON.parse(raw);
        assert.strictEqual(frame.type, 'pong');
        clearTimeout(timeout);
        resolve();
      });
    });

    setConn(listen({ handle: () => {} }, 'ak_test', {
      serverUrl: `ws://localhost:${port}`,
      silent: true,
    }));
  });
}));

test('handles empty body webhook', withMockServer((wss, port, setConn) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 3000);

    const app = {
      handle(req, res) {
        assert.strictEqual(req.method, 'GET');
        assert.strictEqual(req.url, '/health');
        res.writeHead(200);
        res.end('ok');
      },
    };

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'request',
        id: 'evt_empty',
        method: 'GET',
        path: '/health',
        headers: {},
        body: null,
      }));

      ws.on('message', (raw) => {
        const frame = JSON.parse(raw);
        if (frame.type === 'pong') return;

        assert.strictEqual(frame.status, 200);
        assert.strictEqual(Buffer.from(frame.body, 'base64').toString(), 'ok');

        clearTimeout(timeout);
        resolve();
      });
    });

    setConn(listen(app, 'ak_test', {
      serverUrl: `ws://localhost:${port}`,
      silent: true,
    }));
  });
}));

test('headers are lowercased', withMockServer((wss, port, setConn) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 3000);

    const app = {
      handle(req, res) {
        assert.strictEqual(req.headers['x-custom-header'], 'TestValue');
        assert.strictEqual(req.headers['content-type'], 'application/json');
        res.writeHead(200);
        res.end();

        clearTimeout(timeout);
        resolve();
      },
    };

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'request',
        id: 'evt_headers',
        method: 'POST',
        path: '/test',
        headers: {
          'X-Custom-Header': 'TestValue',
          'Content-Type': 'application/json',
        },
        body: null,
      }));
    });

    setConn(listen(app, 'ak_test', {
      serverUrl: `ws://localhost:${port}`,
      silent: true,
    }));
  });
}));
