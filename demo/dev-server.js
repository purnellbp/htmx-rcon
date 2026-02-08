/**
 * Local dev server to test the demo without Vercel CLI.
 * Mimics the Vercel routing: static files + serverless function.
 *
 * Usage: node dev-server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const rconHandler = require('./api/rcon');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/**
 * Shim Vercel's Express-like helpers onto raw http.ServerResponse.
 */
function shimRes(res) {
  if (!res.status) {
    res.status = (code) => { res.statusCode = code; return res; };
  }
  if (!res.send) {
    res.send = (body) => {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      res.end(body);
    };
  }
  if (!res.json) {
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
  }
  return res;
}

const server = http.createServer(async (req, res) => {
  shimRes(res);

  // API route
  if (req.url === '/api/rcon' || req.url.startsWith('/api/rcon?')) {
    // Parse body
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch {
        // Try URL-encoded
        const params = new URLSearchParams(body);
        req.body = Object.fromEntries(params);
      }
      await rconHandler(req, res);
    });
    return;
  }

  // Static files from public/
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  rcon-htmx demo server`);
  console.log(`  ─────────────────────`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  User provides RCON credentials via the UI`);
  console.log();
});
