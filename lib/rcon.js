'use strict';

const net = require('net');
const { EventEmitter } = require('events');

// Source RCON packet types
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

// Sentinel request ID used to detect multi-packet response boundaries
const SENTINEL_ID = 9999;

/**
 * Encode a Source RCON packet into a Buffer.
 *
 * Packet layout (all little-endian):
 *   int32  size       (byte count after this field)
 *   int32  id         (request ID)
 *   int32  type       (packet type)
 *   string body       (null-terminated ASCII)
 *   byte   0x00       (empty string terminator)
 */
function encodePacket(id, type, body) {
  const bodyBuf = Buffer.from(body, 'utf8');
  // size = 4 (id) + 4 (type) + body.length + 1 (null) + 1 (null)
  const size = 4 + 4 + bodyBuf.length + 1 + 1;
  const packet = Buffer.alloc(4 + size);

  packet.writeInt32LE(size, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  bodyBuf.copy(packet, 12);
  packet[12 + bodyBuf.length] = 0x00;     // body null terminator
  packet[12 + bodyBuf.length + 1] = 0x00; // packet null terminator

  return packet;
}

/**
 * Decode a single Source RCON packet from a Buffer.
 * Returns { id, type, body, totalLength } or null if buffer is incomplete.
 */
function decodePacket(buf) {
  if (buf.length < 4) return null;

  const size = buf.readInt32LE(0);
  const totalLength = 4 + size;

  if (buf.length < totalLength) return null;

  const id = buf.readInt32LE(4);
  const type = buf.readInt32LE(8);

  // Body runs from offset 12 to (totalLength - 2), excluding the two null terminators
  const bodyEnd = totalLength - 2;
  const body = buf.slice(12, bodyEnd).toString('utf8');

  return { id, type, body, totalLength };
}

/**
 * RconConnection manages a TCP connection to a Source RCON server.
 *
 * Events:
 *   'authenticated'      - auth succeeded
 *   'auth-failed'        - auth was rejected
 *   'response' (id, body) - command response received
 *   'error' (err)        - socket or protocol error
 *   'close'              - connection closed
 */
class RconConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 27015;
    this.password = options.password || '';
    this.timeout = options.timeout || 5000;

    this._socket = null;
    this._recvBuf = Buffer.alloc(0);
    this._requestId = 1;
    this._authenticated = false;
    this._pendingAuth = null;

    // Track multi-packet responses: requestId -> { body, sentinelSeen }
    this._pending = new Map();
  }

  get connected() {
    return this._socket !== null && !this._socket.destroyed;
  }

  get authenticated() {
    return this._authenticated;
  }

  /**
   * Connect to the RCON server and authenticate.
   * Returns a Promise that resolves on successful auth, rejects on failure.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        return resolve();
      }

      const timer = setTimeout(() => {
        this.destroy();
        reject(new Error(`Connection timed out: ${this.host}:${this.port}`));
      }, this.timeout);

      this._socket = net.createConnection(this.port, this.host, () => {
        // Connected — send auth packet
        this._pendingAuth = { resolve, reject, timer };
        this._sendRaw(encodePacket(0, SERVERDATA_AUTH, this.password));
      });

      this._socket.on('data', (chunk) => this._onData(chunk));

      this._socket.on('error', (err) => {
        clearTimeout(timer);
        this.emit('error', err);
        if (this._pendingAuth) {
          this._pendingAuth.reject(err);
          this._pendingAuth = null;
        }
      });

      this._socket.on('close', () => {
        this._authenticated = false;
        this._socket = null;
        this.emit('close');
      });
    });
  }

  /**
   * Send a command and return the full response text.
   * Handles multi-packet responses automatically.
   */
  exec(command) {
    return new Promise((resolve, reject) => {
      if (!this._authenticated) {
        return reject(new Error('Not authenticated'));
      }

      const id = this._nextId();
      this._pending.set(id, {
        body: '',
        resolve,
        reject,
      });

      // Send the command
      this._sendRaw(encodePacket(id, SERVERDATA_EXECCOMMAND, command));

      // Send an empty RESPONSE_VALUE as a sentinel to detect end of multi-packet response.
      // The server will mirror this back after the real response is complete.
      this._sendRaw(encodePacket(SENTINEL_ID, SERVERDATA_RESPONSE_VALUE, ''));

      // Timeout for response
      setTimeout(() => {
        if (this._pending.has(id)) {
          const entry = this._pending.get(id);
          this._pending.delete(id);
          // Return whatever we've accumulated so far rather than erroring
          resolve(entry.body || '(no response)');
        }
      }, this.timeout);
    });
  }

  /**
   * Disconnect from the server.
   */
  destroy() {
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    this._authenticated = false;
    this._recvBuf = Buffer.alloc(0);
    this._pending.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _nextId() {
    this._requestId = (this._requestId % 9000) + 1;
    return this._requestId;
  }

  _sendRaw(buf) {
    if (this.connected) {
      this._socket.write(buf);
    }
  }

  _onData(chunk) {
    this._recvBuf = Buffer.concat([this._recvBuf, chunk]);

    // Drain as many complete packets as possible
    while (true) {
      const packet = decodePacket(this._recvBuf);
      if (!packet) break;

      this._recvBuf = this._recvBuf.slice(packet.totalLength);
      this._handlePacket(packet);
    }
  }

  _handlePacket(pkt) {
    // Auth response
    if (this._pendingAuth) {
      if (pkt.type === SERVERDATA_AUTH_RESPONSE) {
        clearTimeout(this._pendingAuth.timer);

        if (pkt.id === -1) {
          // Auth failed
          this._authenticated = false;
          this.emit('auth-failed');
          this._pendingAuth.reject(new Error('RCON authentication failed — bad password'));
          this._pendingAuth = null;
          this.destroy();
        } else {
          // Auth succeeded
          this._authenticated = true;
          this.emit('authenticated');
          this._pendingAuth.resolve();
          this._pendingAuth = null;
        }
        return;
      }

      // Some servers send an empty RESPONSE_VALUE before the AUTH_RESPONSE — ignore it
      if (pkt.type === SERVERDATA_RESPONSE_VALUE && pkt.id === -1) {
        return;
      }

      // During auth, skip any RESPONSE_VALUE with id 0 (pre-auth junk)
      if (pkt.type === SERVERDATA_RESPONSE_VALUE && pkt.id === 0) {
        return;
      }
    }

    // Sentinel response — marks the end of a multi-packet response
    if (pkt.id === SENTINEL_ID) {
      // Find the pending command and resolve it
      for (const [id, entry] of this._pending) {
        this._pending.delete(id);
        this.emit('response', id, entry.body);
        entry.resolve(entry.body);
        break;
      }
      return;
    }

    // Regular response packet — accumulate body
    if (pkt.type === SERVERDATA_RESPONSE_VALUE && this._pending.has(pkt.id)) {
      this._pending.get(pkt.id).body += pkt.body;
      return;
    }
  }
}

module.exports = {
  RconConnection,
  encodePacket,
  decodePacket,
  SERVERDATA_AUTH,
  SERVERDATA_AUTH_RESPONSE,
  SERVERDATA_EXECCOMMAND,
  SERVERDATA_RESPONSE_VALUE,
};
