'use strict';

/**
 * Example server for rcon-htmx.
 *
 * Usage (Source RCON — CS2, Garry's Mod, ARK, etc.):
 *   RCON_HOST=192.168.1.10 RCON_PASSWORD=mysecret node example/server.js
 *
 * Usage (Rust — WebSocket RCON):
 *   PROTOCOL=rust RCON_HOST=192.168.1.10 RCON_PORT=28016 RCON_PASSWORD=mysecret node example/server.js
 *
 * HTTPS mode (set HTTPS=1 and provide cert/key paths, or use the bundled self-signed ones):
 *   HTTPS=1 PROTOCOL=rust RCON_HOST=192.168.1.10 RCON_PORT=28016 RCON_PASSWORD=mysecret node example/server.js
 *
 * Client-side auth (user enters creds in the UI):
 *   AUTH_MODE=client PROTOCOL=rust node example/server.js
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createRconBridge } = require('../index');

const app = express();

// Serve the example console page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'console.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
const useHttps = process.env.HTTPS === '1';

let server;
if (useHttps) {
  const https = require('https');
  const certPath = process.env.SSL_CERT || path.join(__dirname, 'cert.pem');
  const keyPath = process.env.SSL_KEY || path.join(__dirname, 'key.pem');
  const sslOpts = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(sslOpts, app);
  server.listen(PORT, () => {
    console.log(`rcon-htmx example running at https://localhost:${PORT}`);
  });
} else {
  server = app.listen(PORT, () => {
    console.log(`rcon-htmx example running at http://localhost:${PORT}`);
  });
}

// Attach the RCON bridge
const authMode = process.env.AUTH_MODE || 'server';
const protocol = process.env.PROTOCOL || 'source';
const defaultPort = protocol === 'rust' ? 28016 : 27015;

if (authMode === 'client') {
  createRconBridge(server, {
    authMode: 'client',
    protocol,
    path: '/ws/rcon',
  });
  console.log(`Auth mode: client | Protocol: ${protocol}`);
} else {
  const host = process.env.RCON_HOST;
  const port = parseInt(process.env.RCON_PORT || String(defaultPort), 10);
  const password = process.env.RCON_PASSWORD;

  if (!host || !password) {
    console.error('');
    console.error('  Set RCON_HOST and RCON_PASSWORD environment variables, or use AUTH_MODE=client');
    console.error('');
    console.error('  Examples:');
    console.error('    RCON_HOST=192.168.1.10 RCON_PASSWORD=secret node example/server.js');
    console.error('    PROTOCOL=rust RCON_HOST=192.168.1.10 RCON_PORT=28016 RCON_PASSWORD=secret node example/server.js');
    console.error('    AUTH_MODE=client PROTOCOL=rust node example/server.js');
    console.error('');
    process.exit(1);
  }

  createRconBridge(server, {
    protocol,
    host,
    port,
    password,
    path: '/ws/rcon',
    onCommand: (cmd) => {
      console.log(`[rcon] > ${cmd}`);
    },
  });
  console.log(`Auth mode: server | Protocol: ${protocol} | Target: ${host}:${port}`);
}
