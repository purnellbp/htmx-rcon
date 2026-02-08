const WebSocket = require('ws');
const http = require('http');

/**
 * Connect to Rust RCON via WebSocket, send a command, return the response.
 * Opens a fresh connection per call (stateless, serverless-friendly).
 *
 * Uses explicit HTTP agent to avoid issues with Vercel's outbound proxy
 * intercepting the WebSocket upgrade handshake.
 */
function execRcon(host, port, password, command) {
  return new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}/${password}`;
    const ws = new WebSocket(url, {
      agent: new http.Agent(),
      handshakeTimeout: 5000,
      headers: {
        'Host': `${host}:${port}`,
      },
    });
    const id = Math.floor(Math.random() * 9000) + 1000;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error('RCON timed out (8s) — check IP, port, and password'));
      }
    }, 8000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        Identifier: id,
        Message: command,
        Name: 'rcon-htmx-demo',
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.Identifier === id && !settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(msg.Message || '');
        }
      } catch { /* ignore */ }
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Connection failed: ${err.message}`));
      }
    });

    ws.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Connection closed (code ${code})`));
      }
    });
  });
}

/**
 * Test that RCON credentials work by opening the WebSocket only (no command).
 */
function testConnection(host, port, password) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => () => { if (!done) { done = true; clearTimeout(timer); fn(); } };
    const url = `ws://${host}:${port}/${password}`;
    const ws = new WebSocket(url, {
      agent: new http.Agent(),
      handshakeTimeout: 10000,
      headers: { 'Host': `${host}:${port}` },
    });
    const timer = setTimeout(() => {
      if (!done) { done = true; ws.terminate(); reject(new Error('Connection timed out — check IP, port, and password')); }
    }, 12000);
    ws.on('open', finish(() => { ws.close(); resolve(); }));
    ws.on('error', (err) => finish(() => reject(new Error(`Connection failed: ${err.message}`)))());
    ws.on('close', (code) => { if (!done && code !== 1000) finish(() => reject(new Error(`Connection closed (code ${code})`)))(); });
  });
}

module.exports = { execRcon, testConnection };
