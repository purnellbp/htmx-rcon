/**
 * Local dev API server — mimics Vercel API routes.
 * Vite proxies /api/* to this server. Run with: npm run dev
 */
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.API_PORT) || 3001;

const streamHandler = require('./api/stream');
const handlers = {
  '/api/connect': require('./api/connect'),
  '/api/rcon': require('./api/rcon'),
  '/api/disconnect': require('./api/disconnect'),
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

  if (pathname === '/api/stream') {
    return streamHandler(req, res);
  }

  const handler = handlers[pathname];
  if (handler) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const ct = req.headers['content-type'] || '';
        req.body = ct.includes('json') ? JSON.parse(body || '{}') : Object.fromEntries(new URLSearchParams(body));
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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`API server http://localhost:${PORT} (proxied from Vite /api)`);
});
