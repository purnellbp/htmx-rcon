const { testConnection } = require('./_lib/rcon');
const { connectForm, consoleView } = require('./_lib/html');

/**
 * POST /api/connect
 * Test RCON credentials by opening the WebSocket only (no command).
 * On success → return console HTML.
 * On failure → return connect form with error.
 */
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const host = (req.body?.host || '').trim();
  const port = (req.body?.port || '28016').trim();
  const password = req.body?.password || '';

  if (!host || !password) {
    return res.status(200).send(connectForm('Enter a server IP and RCON password'));
  }

  try {
    await testConnection(host, port, password);
    return res.status(200).send(consoleView(host, port, password, null));
  } catch (err) {
    return res.status(200).send(connectForm(err.message));
  }
};
