/**
 * Minimal debug: connect WS directly, send webhook, see what happens.
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const SERVER_BIN = path.join(__dirname, '../server/target/debug/simplehook-server');
const DB_URL = 'postgres://admin:secret@localhost:5434/simplehook';
const PORT = 8403;

// Clean DB
try {
  require('child_process').execSync(`psql "${DB_URL}" -c "DELETE FROM events; DELETE FROM routes; DELETE FROM projects;" 2>/dev/null`);
} catch {}

// Start server
const server = spawn(SERVER_BIN, [], {
  env: { ...process.env, DATABASE_URL: DB_URL, PORT: String(PORT), BASE_URL: `http://localhost:${PORT}`, FRONTEND_URL: 'http://localhost:4000', RUST_LOG: 'simplehook_server=debug' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write(d));

function httpReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, json: () => JSON.parse(d) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

setTimeout(async () => {
  try {
    // 1. Register
    const reg = await httpReq('POST', '/api/register', { name: 'debug' });
    const proj = reg.json();
    console.log('1. REGISTERED:', proj.project_id, proj.api_key);

    // 2. Connect raw WebSocket
    const ws = new WebSocket(`ws://localhost:${PORT}/tunnel?key=${proj.api_key}`);

    ws.on('open', () => console.log('2. WS CONNECTED'));

    ws.on('message', (raw) => {
      const msg = raw.toString();
      console.log('3. WS RECEIVED:', msg.substring(0, 200));

      const frame = JSON.parse(msg);
      if (frame.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (frame.type === 'request') {
        console.log('4. GOT REQUEST FRAME:', frame.id, frame.method, frame.path);
        // Send response back
        ws.send(JSON.stringify({
          type: 'response',
          id: frame.id,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"ok":true}').toString('base64'),
        }));
        console.log('5. SENT RESPONSE');
      }
    });

    ws.on('error', e => console.log('WS ERROR:', e.message));
    ws.on('close', () => console.log('WS CLOSED'));

    // Wait for WS to connect
    await new Promise(r => setTimeout(r, 500));

    // 3. Send webhook (queue mode)
    console.log('6. SENDING WEBHOOK (queue mode)...');
    const qres = await httpReq('POST', `/hooks/${proj.project_id}/test/webhook`, { event: 'test_queue' });
    console.log('7. QUEUE RESPONSE:', qres.status, qres.body);

    // Wait for delivery
    await new Promise(r => setTimeout(r, 1000));

    // 4. Create passthrough route and send webhook
    console.log('8. CREATING PASSTHROUGH ROUTE...');
    const rres = await httpReq('POST', '/api/routes', null);
    // Need auth header... let me use raw http
    await new Promise((resolve) => {
      const body = JSON.stringify({ path_prefix: '/pt', mode: 'passthrough' });
      const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/routes', method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${proj.api_key}`, 'content-length': Buffer.byteLength(body) } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { console.log('9. ROUTE CREATED:', res.statusCode, d); resolve(); });
      });
      req.write(body);
      req.end();
    });

    console.log('10. SENDING WEBHOOK (passthrough)...');
    const pres = await httpReq('POST', `/hooks/${proj.project_id}/pt/call`, { from: '+1234' });
    console.log('11. PASSTHROUGH RESPONSE:', pres.status, pres.body);

    // Done
    await new Promise(r => setTimeout(r, 500));
    console.log('\n=== DONE ===');
    ws.close();
    server.kill();
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e);
    server.kill();
    process.exit(1);
  }
}, 2000);

setTimeout(() => { console.log('TIMEOUT'); server.kill(); process.exit(1); }, 20000);
