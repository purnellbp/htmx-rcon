'use strict';

const { createBridge } = require('./lib/bridge');
const { RconConnection } = require('./lib/rcon');
const { RconWebSocket } = require('./lib/rcon-ws');
const { createFormatter } = require('./lib/formatter');

/**
 * Attach an RCON-to-WebSocket bridge to an HTTP server.
 *
 * @param {import('http').Server} httpServer - Node HTTP/HTTPS server
 * @param {Object} options
 * @param {string}   options.host        - RCON server hostname
 * @param {number}  [options.port=27015] - RCON server port
 * @param {string}   options.password    - RCON password (required if authMode is 'server')
 * @param {string}  [options.path='/ws/rcon'] - WebSocket endpoint path
 * @param {'server'|'client'} [options.authMode='server'] - Who provides RCON credentials
 * @param {number}  [options.timeout=5000]    - Connection/command timeout in ms
 * @param {string}  [options.targetId='rcon-output'] - htmx OOB swap target element ID
 * @param {string}  [options.swapStyle='beforeend']  - htmx OOB swap strategy
 * @param {Function} [options.formatLine]    - Custom line formatter: (text, meta) => string
 * @param {Function} [options.onConnect]     - Callback when a session connects: (ws, rcon) => void
 * @param {Function} [options.onCommand]     - Command filter: (command, ws) => false to block
 * @returns {import('ws').WebSocketServer}
 *
 * @example
 * // Server-side auth (simplest)
 * const server = app.listen(3000);
 * createRconBridge(server, {
 *   host: '192.168.1.10',
 *   port: 27015,
 *   password: process.env.RCON_PASSWORD,
 * });
 *
 * @example
 * // Client-side auth (user enters credentials in the UI)
 * createRconBridge(server, {
 *   authMode: 'client',
 *   path: '/ws/rcon',
 * });
 *
 * @example
 * // Custom formatting and command filtering
 * createRconBridge(server, {
 *   host: 'game.example.com',
 *   password: 'secret',
 *   targetId: 'my-console',
 *   onCommand: (cmd, ws) => {
 *     if (cmd.startsWith('quit')) return false; // block dangerous commands
 *   },
 *   formatLine: (text, meta) => {
 *     return `<pre>${text}</pre>`;
 *   },
 * });
 */
function createRconBridge(httpServer, options = {}) {
  if (!httpServer) {
    throw new Error('rcon-htmx: an HTTP server instance is required as the first argument.');
  }

  return createBridge(httpServer, options);
}

module.exports = {
  createRconBridge,
  // Also export lower-level pieces for advanced usage
  RconConnection,
  RconWebSocket,
  createFormatter,
};
