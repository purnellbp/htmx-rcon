# htmx-rcon Vite example

Vite frontend + serverless API routes (POST + SSE). **Deployable to Vercel.** No env vars — you enter server IP, port, and RCON password in the browser. Same architecture as the [Node demo](../htmx-rcon-node): stateless RCON over HTTP, live stream via SSE.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Run**

   ```bash
   npm run dev
   ```

   Starts the API server on **http://localhost:3001** and Vite on **http://localhost:5174** (or 5173). Vite proxies `/api` to the API server. Open the Vite URL, enter your Rust server’s host, port (default 28016), and RCON password, then click Connect.

## Scripts

- **`npm run dev`** — API server + Vite (concurrently). Use the Vite URL.
- **`npm run api`** — Run only the API server (port 3001).
- **`npm run build`** — Vite production build to `dist/`.
- **`npm run preview`** — Build and serve `dist/` (static only; no API).

## Deploy to Vercel

```bash
vercel --prod
```

- **Build** — Vercel runs `npx vite build` and deploys `dist/` plus the `api/` serverless functions.
- **Stream** — `vercel.json` sets `maxDuration: 300` for `api/stream.js`. Enable **Fluid Compute** (Project → Settings → Functions) so the stream can run up to 5 minutes; htmx SSE auto-reconnects when it ends.
- **No env vars** — RCON host, port, and password are supplied by the user in the UI.

## Repo

Package: [purnellbp/htmx-rcon](https://github.com/purnellbp/htmx-rcon).
