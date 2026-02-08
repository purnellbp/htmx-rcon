/**
 * Local dev server — mimics Vercel routing.
 * Usage: node dev-server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

const streamHandler = require('./api/stream');

const handlers = {
  '/api/connect':    require('./api/connect'),
  '/api/rcon':       require('./api/rcon'),
  '/api/disconnect': require('./api/disconnect'),
};

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function shimRes(res) {
  if (!res.status) res.status = (c) => { res.statusCode = c; return res; };
  if (!res.send) res.send = (b) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(b);
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  shimRes(res);
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // SSE stream (no body parsing needed, uses query params)
  if (pathname === '/api/stream') {
    return streamHandler(req, res);
  }

  // API routes
  const handler = handlers[pathname];
  if (handler) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('json')) {
          req.body = JSON.parse(body);
        } else {
          req.body = Object.fromEntries(new URLSearchParams(body));
        }
      } catch {
        req.body = {};
      }
      try {
        await handler(req, res);
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal error');
      }
    });
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  rcon-htmx demo`);
  console.log(`  ──────────────`);
  console.log(`  http://localhost:${PORT}\n`);
});
