'use strict';

/**
 * Default HTML formatter for RCON responses.
 * Produces htmx-compatible HTML with hx-swap-oob attributes.
 */

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a timestamp for display.
 */
function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: true });
}

/**
 * Create a formatter with the given options.
 *
 * Options:
 *   targetId    - DOM element ID to swap into (default: 'rcon-output')
 *   swapStyle   - hx-swap-oob style (default: 'beforeend')
 *   formatLine  - custom function(text, meta) => innerHTML string
 *
 * Returns an object with methods: response(), error(), info(), auth(), serverMessage()
 */
function createFormatter(options = {}) {
  const targetId = options.targetId || 'rcon-output';
  const swapStyle = options.swapStyle || 'beforeend';
  const customFormat = options.formatLine || null;

  function wrap(innerHTML) {
    return `<div id="${targetId}" hx-swap-oob="${swapStyle}">${innerHTML}</div>`;
  }

  return {
    /**
     * Format a command response.
     */
    response(text, command) {
      if (customFormat) {
        return wrap(customFormat(text, { type: 'response', command, timestamp: timestamp() }));
      }

      const time = timestamp();
      const lines = text.split('\n').filter(Boolean);
      const formatted = lines
        .map((line) => `<span class="rcon-line">${escapeHtml(line)}</span>`)
        .join('');

      return wrap(
        `<div class="rcon-response">` +
          `<div class="rcon-meta">` +
            `<span class="rcon-cmd">&gt; ${escapeHtml(command)}</span>` +
            `<span class="rcon-time">${time}</span>` +
          `</div>` +
          `<div class="rcon-body">${formatted || '<span class="rcon-empty">(no output)</span>'}</div>` +
        `</div>`
      );
    },

    /**
     * Format an error message.
     */
    error(message) {
      if (customFormat) {
        return wrap(customFormat(message, { type: 'error', timestamp: timestamp() }));
      }

      return wrap(
        `<div class="rcon-error">` +
          `<span class="rcon-error-icon">!</span> ${escapeHtml(message)}` +
        `</div>`
      );
    },

    /**
     * Format an informational message (connect, disconnect, etc).
     */
    info(message) {
      if (customFormat) {
        return wrap(customFormat(message, { type: 'info', timestamp: timestamp() }));
      }

      return wrap(
        `<div class="rcon-info">${escapeHtml(message)}</div>`
      );
    },

    /**
     * Format unsolicited server console output (Rust pushes chat, kills, logs, etc.)
     */
    serverMessage(text, type) {
      if (customFormat) {
        return wrap(customFormat(text, { type: 'server', serverType: type, timestamp: timestamp() }));
      }

      const time = timestamp();
      const typeClass = (type || '').toLowerCase() === 'warning' ? 'rcon-warn'
        : (type || '').toLowerCase() === 'error' ? 'rcon-error'
        : 'rcon-server';

      return wrap(
        `<div class="${typeClass}">` +
          `<span class="rcon-time">${time}</span> ${escapeHtml(text)}` +
        `</div>`
      );
    },

    /**
     * Format authentication status.
     * Also updates a #rcon-status element if present.
     */
    auth(success, detail) {
      const statusHtml = success
        ? `<span id="rcon-status" hx-swap-oob="true" class="rcon-status connected">Connected</span>`
        : `<span id="rcon-status" hx-swap-oob="true" class="rcon-status disconnected">Disconnected</span>`;

      const msgHtml = success
        ? this.info(detail || 'Authenticated to RCON server.')
        : this.error(detail || 'Authentication failed.');

      // Return both OOB swaps as siblings
      return statusHtml + msgHtml;
    },
  };
}

module.exports = { createFormatter, escapeHtml };
