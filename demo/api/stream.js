const WebSocket = require('ws');
const http = require('http');
const { esc } = require('./_lib/html');

/**
 * GET /api/stream?host=...&port=...&password=...
 *
 * SSE endpoint that holds a persistent WebSocket to Rust RCON
 * and streams all server traffic as HTML fragments.
 *
 * htmx SSE extension auto-reconnects when the function times out.
 */
module.exports = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const host = url.searchParams.get('host');
  const port = url.searchParams.get('port') || '28016';
  const password = url.searchParams.get('password');

  if (!host || !password) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing host or password');
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // Connect to Rust RCON
  const wsUrl = `ws://${host}:${port}/${password}`;
  const ws = new WebSocket(wsUrl, {
    agent: new http.Agent(),
    handshakeTimeout: 5000,
    headers: { 'Host': `${host}:${port}` },
  });

  let eventId = 0;

  ws.on('open', () => {
    // Send connected event
    const html = `<div class="rcon-system fade-in">stream connected</div>`;
    res.write(`id: ${++eventId}\nevent: console\ndata: ${html}\n\n`);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // Only forward unsolicited server messages (Identifier <= 0)
      // Command responses come via the /api/rcon POST endpoint
      if (msg.Identifier !== undefined && msg.Identifier <= 0) {
        const text = msg.Message || '';
        if (!text.trim()) return; // skip empty

        const time = new Date().toLocaleTimeString('en-US', { hour12: true });

        const lines = text.split('\n').filter(Boolean);
        const body = lines.map(l => `<span class="rcon-line">${esc(l)}</span>`).join('');

        const html = `<div class="rcon-server fade-in"><div class="rcon-meta"><span class="rcon-time">${time}</span></div><div class="rcon-body">${body}</div></div>`;

        res.write(`id: ${++eventId}\nevent: console\ndata: ${html}\n\n`);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on('error', (err) => {
    const html = `<div class="rcon-error fade-in"><span class="rcon-error-icon">!</span> Stream error: ${esc(err.message)}</div>`;
    res.write(`event: console\ndata: ${html}\n\n`);
  });

  ws.on('close', () => {
    const html = `<div class="rcon-system fade-in">stream disconnected</div>`;
    res.write(`event: console\ndata: ${html}\n\n`);
    clearInterval(heartbeat);
    res.end();
  });

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(heartbeat);
    ws.close();
  });
};
