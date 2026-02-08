/**
 * Shared HTML template helpers.
 * Minimalist full-screen RCON console. Zero custom JS.
 */

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSS class for terminal line colorization by content. */
function lineClass(line) {
  const s = (line || '').trim();
  if (/^\[OpenAI\]/.test(s)) return 'log-openai';
  if (/^\[CSharp\]/.test(s)) return 'log-csharp';
  if (/^\[event\]/.test(s)) return 'log-event';
  if (/^Error\b/i.test(s)) return 'log-error';
  if (/shutting down|shutdown|compiler/i.test(s)) return 'log-warn';
  if (/loaded plugin/i.test(s)) return 'log-plugin';
  if (/network group|dynamicpreventbuilding|prefab/i.test(s)) return 'log-game';
  return 'log-default';
}

/** Single terminal line: content left, timestamp right. */
function terminalLine(line, time) {
  const cls = lineClass(line);
  return `<div class="terminal-line ${cls} fade-in"><span class="terminal-text">${esc(line)}</span><span class="terminal-time">${time}</span></div>`;
}

/** The connect form (initial state + after disconnect) */
function connectForm(error) {
  const errorHtml = error
    ? `<div class="connect-error">${esc(error)}</div>`
    : '';

  return `
    <div class="connect-panel">
      <div class="connect-inner">
        <div class="connect-title">&gt;_ rcon</div>
        <p>Connect to your Rust server</p>
        ${errorHtml}
        <form
          hx-post="/api/connect"
          hx-target="#app"
          hx-swap="innerHTML"
          hx-indicator="#connect-spin"
        >
          <div class="field-row">
            <div class="field-group field-grow">
              <input type="text" name="host" placeholder="server ip" required autocomplete="off">
            </div>
            <div class="field-group field-port">
              <input type="text" name="port" placeholder="28016" value="28016" autocomplete="off">
            </div>
          </div>
          <div class="field-group">
            <input type="password" name="password" placeholder="rcon password" required autocomplete="off">
          </div>
          <button type="submit" class="connect-btn">
            <span class="btn-text">connect</span>
            <span class="htmx-indicator" id="connect-spin">connecting...</span>
          </button>
        </form>
      </div>
    </div>`;
}

/** The console view (after successful connect) */
function consoleView(host, port, password, _initialResponse) {
  const initial = '';

  // Encode credentials for the SSE stream URL
  const streamUrl = `/api/stream?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&password=${encodeURIComponent(password)}`;

  return `
    <div id="creds" style="display:none">
      <input type="hidden" name="host" value="${esc(host)}">
      <input type="hidden" name="port" value="${esc(port)}">
      <input type="hidden" name="password" value="${esc(password)}">
    </div>

    <div class="console-wrap">
      <div class="console-bar">
        <span class="console-badge">connected</span>
        <button
          class="disconnect-btn"
          hx-post="/api/disconnect"
          hx-target="#app"
          hx-swap="innerHTML"
        >disconnect</button>
      </div>

      <div
        hx-ext="sse"
        sse-connect="${streamUrl}"
        class="console-sse-wrap"
      >
        <div class="console-output" id="rcon-output"
          sse-swap="console"
          hx-swap="beforeend scroll:#rcon-output:bottom"
        >
          ${initial}
        </div>
      </div>

      <form
        class="console-input"
        hx-post="/api/rcon"
        hx-target="#rcon-output"
        hx-swap="beforeend scroll:#rcon-output:bottom"
        hx-include="#creds"
        hx-indicator="#cmd-loading"
        hx-on::after-request="this.reset()"
      >
        <span class="console-prompt">&gt;</span>
        <input type="text" name="command" placeholder="type a command..." autocomplete="off" autofocus>
        <button type="submit">send</button>
        <span class="htmx-indicator" id="cmd-loading">...</span>
      </form>
    </div>`;
}

/** Single command response fragment — terminal style: > cmd on first line, then output lines with time on right. */
function commandResponse(cmd, output) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: true });
  const lines = output.split('\n').filter(Boolean);
  const cmdLine = `<div class="terminal-line log-cmd fade-in"><span class="terminal-text">&gt; ${esc(cmd)}</span><span class="terminal-time">${time}</span></div>`;
  const outLines = lines.length
    ? lines.map(l => terminalLine(l, time)).join('')
    : `<div class="terminal-line log-default fade-in"><span class="terminal-text">(no output)</span><span class="terminal-time">${time}</span></div>`;
  return `<div class="rcon-response">${cmdLine}${outLines}</div>`;
}

/** Error fragment */
function errorResponse(message) {
  return `<div class="rcon-error fade-in">
    <span class="rcon-error-icon">!</span> ${esc(message)}
  </div>`;
}

module.exports = { esc, lineClass, terminalLine, connectForm, consoleView, commandResponse, errorResponse };
