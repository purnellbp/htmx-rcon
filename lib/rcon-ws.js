'use strict';

const WebSocket = require('ws');
const { EventEmitter } = require('events');

/**
 * RconWebSocket manages a WebSocket connection to a Rust RCON server.
 *
 * Rust RCON protocol:
 *   Connect:  ws://host:port/password
 *   Send:     { "Identifier": int, "Message": "command", "Name": "rcon-htmx" }
 *   Receive:  { "Identifier": int, "Message": "text", "Type": "Generic"|"Warning"|"Error", "Stacktrace": "" }
 *
 * Server also pushes unsolicited console output (Identifier: -1).
 *
 * Events:
 *   'authenticated'           - WebSocket connected (Rust auth is implicit in the URL)
 *   'auth-failed' (err)       - Connection failed (bad password returns 401 or closes)
 *   'response' (id, body)     - Command response received
 *   'server-message' (body, type) - Unsolicited server console output
 *   'error' (err)             - Connection error
 *   'close'                   - Connection closed
 */
class RconWebSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28016;
    this.password = options.password || '';
    this.timeout = options.timeout || 5000;

    this._ws = null;
    this._requestId = 0;
    this._authenticated = false;
    this._pending = new Map();
  }

  get connected() {
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  get authenticated() {
    return this._authenticated;
  }

  /**
   * Connect to the Rust RCON server.
   * Auth is implicit — the password is part of the WebSocket URL.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) return resolve();

      const url = `ws://${this.host}:${this.port}/${this.password}`;

      const timer = setTimeout(() => {
        if (this._ws) this._ws.terminate();
        reject(new Error(`Connection timed out: ${this.host}:${this.port}`));
      }, this.timeout);

      this._ws = new WebSocket(url);

      this._ws.on('open', () => {
        clearTimeout(timer);
        this._authenticated = true;
        this.emit('authenticated');
        resolve();
      });

      this._ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          this._handleMessage(msg);
        } catch (e) {
          this.emit('error', new Error(`Failed to parse RCON message: ${e.message}`));
        }
      });

      this._ws.on('error', (err) => {
        clearTimeout(timer);
        this.emit('error', err);
        if (!this._authenticated) {
          reject(err);
        }
      });

      this._ws.on('close', (code) => {
        clearTimeout(timer);
        const wasAuthed = this._authenticated;
        this._authenticated = false;
        this._ws = null;

        if (!wasAuthed) {
          // Connection closed before we authenticated — likely bad password
          this.emit('auth-failed');
          reject(new Error(`RCON connection rejected (code ${code}) — check password`));
        } else {
          this.emit('close');
        }

        // Reject any pending commands
        for (const [id, entry] of this._pending) {
          entry.reject(new Error('Connection closed'));
        }
        this._pending.clear();
      });
    });
  }

  /**
   * Execute an RCON command and return the response text.
   */
  exec(command) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Not connected'));
      }

      const id = this._nextId();

      this._pending.set(id, { resolve, reject });

      const payload = JSON.stringify({
        Identifier: id,
        Message: command,
        Name: 'rcon-htmx',
      });

      this._ws.send(payload);

      // Timeout for response
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          resolve('(no response — timed out)');
        }
      }, this.timeout);
    });
  }

  /**
   * Disconnect from the server.
   */
  destroy() {
    if (this._ws) {
      this._ws.terminate();
      this._ws = null;
    }
    this._authenticated = false;
    this._pending.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _nextId() {
    this._requestId = (this._requestId % 9000) + 1;
    return this._requestId;
  }

  _handleMessage(msg) {
    const id = msg.Identifier;
    const body = msg.Message || '';
    const type = msg.Type || 'Generic';

    // Unsolicited server console output (chat, logs, etc.)
    if (id === -1 || id === 0) {
      this.emit('server-message', body, type);
      return;
    }

    // Response to a command we sent
    if (this._pending.has(id)) {
      const entry = this._pending.get(id);
      this._pending.delete(id);
      this.emit('response', id, body);
      entry.resolve(body);
      return;
    }

    // Unknown identifier — still emit it
    this.emit('server-message', body, type);
  }
}

module.exports = { RconWebSocket };
