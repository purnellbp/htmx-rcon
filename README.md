# rcon-htmx

Source RCON and Rust (WebSocket RCON) bridge for [htmx](https://htmx.org). Uses Node.js built-ins plus the `ws` package.

Connect your htmx frontend to game servers over secure WebSockets: the library supports the **Source RCON** binary protocol (CS2, Garry's Mod, ARK, etc.) and **Rust** WebSocket RCON. You get HTML fragments (e.g. `hx-swap-oob`) and build the UI however you want.

## Why

Browsers can't open raw TCP sockets, so you can't talk RCON directly. If your web panel runs on HTTPS, you also can't use unencrypted WebSockets (mixed content blocking). This package solves both problems:

```
Browser (HTTPS)  <-- wss:// -->  Node Backend  <-- TCP -->  Game Server
     htmx                        rcon-htmx                  RCON :27015
```

The WebSocket rides on the same HTTPS server that serves your page — no mixed content, no CORS, no extra ports.

## Install

```bash
npm install rcon-htmx ws
```

> `ws` is a peer dependency — you likely already have it if you're using WebSockets.

## Quick Start

### Server (5 lines)

```js
const express = require('express');
const { createRconBridge } = require('rcon-htmx');

const app = express();
const server = app.listen(3000);

createRconBridge(server, {
  host: '192.168.1.10',
  port: 27015,
  password: process.env.RCON_PASSWORD,
});
```

### HTML (htmx)

```html
<script src="https://unpkg.com/htmx.org@2/dist/htmx.min.js"></script>
<script src="https://unpkg.com/htmx-ext-ws@2/dist/ws.js"></script>

<div hx-ext="ws" ws-connect="/ws/rcon">

  <!-- RCON output appears here automatically via hx-swap-oob -->
  <div id="rcon-output"></div>

  <!-- ws-send serializes the form as JSON and sends over WebSocket -->
  <form ws-send>
    <input type="text" name="command" placeholder="Enter command..." />
    <button type="submit">Run</button>
  </form>

</div>
```

That's it. Type `status` and hit Run — the server executes the RCON command and pushes styled HTML back into `#rcon-output`.

## API

### `createRconBridge(httpServer, options)`

Attaches a WebSocket endpoint to your HTTP server that bridges to RCON.

**Returns:** `WebSocketServer` instance.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | — | RCON server hostname (required if `authMode` is `'server'`) |
| `port` | `number` | `27015` | RCON server port |
| `password` | `string` | — | RCON password (required if `authMode` is `'server'`) |
| `path` | `string` | `'/ws/rcon'` | WebSocket endpoint path |
| `authMode` | `'server' \| 'client'` | `'server'` | Who provides credentials (see below) |
| `timeout` | `number` | `5000` | Connection and command timeout in ms |
| `targetId` | `string` | `'rcon-output'` | DOM element ID for OOB swap target |
| `swapStyle` | `string` | `'beforeend'` | htmx swap strategy (`beforeend`, `innerHTML`, etc.) |
| `formatLine` | `function` | built-in | Custom formatter: `(text, meta) => htmlString` |
| `onConnect` | `function` | — | Called when a session connects: `(ws, rcon) => void` |
| `onCommand` | `function` | — | Command filter: `(command, ws) => false` to block |

### Auth Modes

#### Server-side auth (default)

RCON credentials are in your server config. Every WebSocket connection auto-authenticates. Use this when your web panel has its own auth layer.

```js
createRconBridge(server, {
  host: '192.168.1.10',
  password: process.env.RCON_PASSWORD,
});
```

#### Client-side auth

The browser sends credentials as the first WebSocket message. Good for multi-server panels where the user picks which server to connect to.

```js
createRconBridge(server, {
  authMode: 'client',
});
```

The first message from the client must be:

```json
{ "auth": { "host": "192.168.1.10", "port": 27015, "password": "secret" } }
```

In htmx, you can do this with a login form:

```html
<div hx-ext="ws" ws-connect="/ws/rcon">
  <!-- Auth form (shown first) -->
  <form ws-send id="auth-form">
    <input type="hidden" name="auth.host" value="192.168.1.10" />
    <input type="hidden" name="auth.port" value="27015" />
    <input type="password" name="auth.password" placeholder="RCON password" />
    <button type="submit">Connect</button>
  </form>

  <div id="rcon-output"></div>

  <form ws-send>
    <input type="text" name="command" />
    <button>Run</button>
  </form>
</div>
```

### Blocking Commands

Use `onCommand` to filter dangerous commands:

```js
createRconBridge(server, {
  host: '192.168.1.10',
  password: 'secret',
  onCommand: (command) => {
    const blocked = ['quit', 'exit', 'rcon_password', 'changelevel'];
    if (blocked.some((b) => command.toLowerCase().startsWith(b))) {
      return false; // sends error HTML back to the client
    }
  },
});
```

### Custom Formatting

Override the default HTML output:

```js
createRconBridge(server, {
  host: '192.168.1.10',
  password: 'secret',
  formatLine: (text, meta) => {
    // meta.type is 'response', 'error', or 'info'
    // meta.command is the command that was run (for responses)
    // meta.timestamp is the current time string
    return `<pre class="my-line">[${meta.timestamp}] ${text}</pre>`;
  },
});
```

### Advanced: Direct RCON Access

For custom setups, you can use the RCON client directly:

```js
const { RconConnection } = require('rcon-htmx');

const rcon = new RconConnection({
  host: '192.168.1.10',
  port: 27015,
  password: 'secret',
});

await rcon.connect();
const response = await rcon.exec('status');
console.log(response);
rcon.destroy();
```

## HTML Output Format

The default formatter produces HTML like this for each command:

```html
<!-- Appended to #rcon-output via hx-swap-oob="beforeend" -->
<div id="rcon-output" hx-swap-oob="beforeend">
  <div class="rcon-response">
    <div class="rcon-meta">
      <span class="rcon-cmd">> status</span>
      <span class="rcon-time">8:30:15 AM</span>
    </div>
    <div class="rcon-body">
      <span class="rcon-line">hostname: My Server</span>
      <span class="rcon-line">players : 12/24</span>
    </div>
  </div>
</div>
```

CSS classes you can style:

- `.rcon-response` — command + output wrapper
- `.rcon-meta` — header row with command and timestamp
- `.rcon-cmd` — the command that was run
- `.rcon-time` — timestamp
- `.rcon-body` — response text container
- `.rcon-line` — individual output line
- `.rcon-error` — error message
- `.rcon-info` — info message (connect, disconnect)
- `.rcon-status` — connection status badge (has `.connected` or `.disconnected`)

## Example

A complete working example is in the `example/` directory:

```bash
# Server-side auth
RCON_HOST=192.168.1.10 RCON_PASSWORD=secret node example/server.js

# Client-side auth (user enters creds in the browser)
AUTH_MODE=client node example/server.js
```

Then open `http://localhost:3001`.

## Demo (Vercel)

The `demo/` app is a minimalist, almost full-screen RCON console that runs on **Vercel** (serverless). Users enter Rust server host, port, and RCON password in the UI; no env vars for credentials.

- **Commands** — `POST /api/rcon` (stateless, one shot per command).
- **Live server traffic** — `GET /api/stream` holds a WebSocket to the Rust server and streams unsolicited messages (chat, events) over SSE; htmx’s SSE extension appends them to the console.

Stack: htmx and htmx-ext-sse from **npm** (no CDN), served from `node_modules` (dev server and Vercel via `postinstall` copy into `public/`).

### Run locally

```bash
cd demo
npm install
npm run dev
```

Open `http://localhost:3000`, enter your Rust server’s host, port, and RCON password, then connect.

### Deploy to Vercel

```bash
cd demo
vercel --prod
```

No build step required; Vercel runs `npm install` (which runs `postinstall` to copy htmx assets into `public/`). Ensure your Rust server allows RCON connections from the internet if you connect from the deployed URL.

## HTTPS / Production

For HTTPS, put the Node server behind a TLS-terminating reverse proxy (nginx, Caddy) or use Node's `https` module directly. The htmx WS extension automatically upgrades `ws://` to `wss://` when the page is served over HTTPS — no config needed.

```nginx
server {
    listen 443 ssl;
    server_name panel.example.com;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3001;
    }

    location /ws/rcon {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## License

MIT
