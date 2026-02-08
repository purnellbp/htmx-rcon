const WebSocket = require('ws');

/**
 * Vercel serverless function that bridges HTTP to Rust WebSocket RCON.
 *
 * POST /api/rcon  { host, port, password, command }
 * Returns HTML fragment for htmx to swap into the console.
 *
 * No server-side credentials — the user supplies everything per-request.
 */
module.exports = async (req, res) => {
  // CORS headers for htmx
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, HX-Request');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send(errorHtml('Method not allowed'));
  }

  const { host, port, password, command } = req.body || {};

  if (!host || !password) {
    return res.status(400).send(errorHtml('Missing connection info — enter your server IP and RCON password'));
  }

  const cmd = (command || '').trim();
  if (!cmd) {
    return res.status(400).send(errorHtml('Empty command'));
  }

  const rconPort = port || '28016';

  try {
    const response = await execRcon(host, rconPort, password, cmd);
    const time = new Date().toLocaleTimeString('en-US', { hour12: true });

    const lines = response.split('\n').filter(Boolean);
    const formatted = lines
      .map((line) => `<span class="rcon-line">${esc(line)}</span>`)
      .join('');

    const html =
      `<div class="rcon-response fade-in">` +
        `<div class="rcon-meta">` +
          `<span class="rcon-cmd">&gt; ${esc(cmd)}</span>` +
          `<span class="rcon-time">${time}</span>` +
        `</div>` +
        `<div class="rcon-body">${formatted || '<span class="rcon-empty">(no output)</span>'}</div>` +
      `</div>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(200).send(errorHtml(err.message));
  }
};

/**
 * Connect to Rust RCON via WebSocket, send a command, return the response.
 */
function execRcon(host, port, password, command) {
  return new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}/${password}`;
    const ws = new WebSocket(url);
    const id = Math.floor(Math.random() * 9000) + 1;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error('RCON command timed out (8s) — check your IP, port, and password'));
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
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Connection failed — ${err.message}`));
      }
    });

    ws.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Connection closed (code ${code}) — check your credentials`));
      }
    });
  });
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function errorHtml(message) {
  return `<div class="rcon-error fade-in"><span class="rcon-error-icon">!</span> ${esc(message)}</div>`;
}
