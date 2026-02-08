'use strict';

const { WebSocketServer } = require('ws');
const { RconConnection } = require('./rcon');
const { RconWebSocket } = require('./rcon-ws');
const { createFormatter } = require('./formatter');

/**
 * Create an RCON-to-WebSocket bridge and attach it to an HTTP server.
 *
 * Options:
 *   protocol    - 'source' (binary TCP) or 'rust' (WebSocket JSON) — default: 'source'
 *   host        - RCON server hostname (required if authMode is 'server')
 *   port        - RCON server port (default: 27015 for source, 28016 for rust)
 *   password    - RCON password (required if authMode is 'server')
 *   path        - WebSocket endpoint path (default: '/ws/rcon')
 *   authMode    - 'server' (default) or 'client'
 *   timeout     - RCON connection/command timeout in ms (default: 5000)
 *   targetId    - htmx OOB swap target ID (default: 'rcon-output')
 *   swapStyle   - htmx OOB swap style (default: 'beforeend')
 *   formatLine  - custom line formatter function (optional)
 *   onConnect   - callback(ws, rcon) when a session is established (optional)
 *   onCommand   - callback(command, ws) before sending — return false to block (optional)
 *
 * Returns the WebSocketServer instance.
 */
function createBridge(httpServer, options = {}) {
  const protocol = options.protocol || 'source';
  const defaultPort = protocol === 'rust' ? 28016 : 27015;

  const {
    host,
    port = defaultPort,
    password,
    path = '/ws/rcon',
    authMode = 'server',
    timeout = 5000,
    targetId,
    swapStyle,
    formatLine,
    onConnect,
    onCommand,
  } = options;

  if (!host && authMode === 'server') {
    throw new Error('rcon-htmx: "host" option is required');
  }

  if (!password && authMode === 'server') {
    throw new Error('rcon-htmx: "password" option is required when authMode is "server"');
  }

  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (ws) => {
    const fmt = createFormatter({ targetId, swapStyle, formatLine });
    let rcon = null;
    let authenticated = false;

    /**
     * Create an RCON client based on the selected protocol.
     */
    function createRcon(rHost, rPort, rPassword) {
      if (protocol === 'rust') {
        return new RconWebSocket({ host: rHost, port: rPort, password: rPassword, timeout });
      }
      return new RconConnection({ host: rHost, port: rPort, password: rPassword, timeout });
    }

    /**
     * Wire up RCON event handlers and the server-message stream for Rust.
     */
    function wireRconEvents(rconClient) {
      rconClient.on('error', (err) => {
        safeSend(ws, fmt.error(`RCON error: ${err.message}`));
      });

      rconClient.on('close', () => {
        authenticated = false;
        safeSend(ws, fmt.auth(false, 'RCON connection closed.'));
      });

      // Rust pushes unsolicited server console output (chat, kills, logs, etc.)
      if (protocol === 'rust') {
        rconClient.on('server-message', (body, type) => {
          if (body && body.trim()) {
            safeSend(ws, fmt.serverMessage(body, type));
          }
        });
      }
    }

    // --- Server-side auth: connect + auth immediately ---
    if (authMode === 'server') {
      rcon = createRcon(host, port, password);

      rcon.connect()
        .then(() => {
          authenticated = true;
          safeSend(ws, fmt.auth(true, `Connected to ${host}:${port}`));
          if (onConnect) onConnect(ws, rcon);
        })
        .catch((err) => {
          safeSend(ws, fmt.auth(false, err.message));
          ws.close();
        });

      wireRconEvents(rcon);
    }

    // --- Handle incoming messages from the browser ---
    ws.on('message', async (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        safeSend(ws, fmt.error('Invalid message format.'));
        return;
      }

      // Normalize flat form keys (auth.host, auth.port, auth.password) to nested data.auth
      if (!data.auth && (data['auth.host'] != null || data['auth.password'] != null)) {
        data.auth = {
          host: data['auth.host'],
          port: data['auth.port'],
          password: data['auth.password'],
        };
      }

      // --- Client-side auth mode ---
      if (authMode === 'client' && !authenticated) {
        if (data.auth) {
          const authHost = data.auth.host || host;
          const authPort = data.auth.port || port || defaultPort;
          const authPass = data.auth.password || password;

          if (!authHost || !authPass) {
            safeSend(ws, fmt.auth(false, 'Missing host or password.'));
            return;
          }

          rcon = createRcon(authHost, authPort, authPass);

          try {
            await rcon.connect();
            authenticated = true;
            safeSend(ws, fmt.auth(true, `Connected to ${authHost}:${authPort}`));
            if (onConnect) onConnect(ws, rcon);
          } catch (err) {
            safeSend(ws, fmt.auth(false, err.message));
          }

          wireRconEvents(rcon);
          return;
        }

        safeSend(ws, fmt.error(`Not authenticated. Send {"auth": {"host": "...", "port": ${defaultPort}, "password": "..."}} first.`));
        return;
      }

      // --- Command execution ---
      const command = (data.command || '').trim();
      if (!command) {
        safeSend(ws, fmt.error('Empty command.'));
        return;
      }

      if (onCommand) {
        const allowed = onCommand(command, ws);
        if (allowed === false) {
          safeSend(ws, fmt.error(`Command blocked: ${command}`));
          return;
        }
      }

      if (!authenticated || !rcon || !rcon.connected) {
        safeSend(ws, fmt.error('Not connected to RCON server.'));
        return;
      }

      try {
        const response = await rcon.exec(command);
        safeSend(ws, fmt.response(response, command));
      } catch (err) {
        safeSend(ws, fmt.error(`Command failed: ${err.message}`));
      }
    });

    // --- Cleanup on disconnect ---
    ws.on('close', () => {
      if (rcon) {
        rcon.destroy();
        rcon = null;
      }
      authenticated = false;
    });

    ws.on('error', () => {
      if (rcon) {
        rcon.destroy();
        rcon = null;
      }
    });
  });

  return wss;
}

/**
 * Safe WebSocket send — only sends if socket is open.
 */
function safeSend(ws, data) {
  if (ws.readyState === 1) {
    ws.send(data);
  }
}

module.exports = { createBridge };
