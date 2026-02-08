const { execRcon } = require('./_lib/rcon');
const { commandResponse, errorResponse } = require('./_lib/html');

/**
 * POST /api/rcon
 * Send a command to Rust RCON, return HTML fragment.
 * Expects: host, port, password, command (from form + hx-include).
 */
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const host = (req.body?.host || '').trim();
  const port = (req.body?.port || '28016').trim();
  const password = req.body?.password || '';
  const command = (req.body?.command || '').trim();

  if (!host || !password) {
    return res.status(200).send(errorResponse('Session expired — please reconnect'));
  }

  if (!command) {
    return res.status(200).send(errorResponse('Empty command'));
  }

  try {
    const output = await execRcon(host, port, password, command);
    return res.status(200).send(commandResponse(command, output));
  } catch (err) {
    return res.status(200).send(errorResponse(err.message));
  }
};
