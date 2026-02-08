const { execRcon } = require('./_lib/rcon');
const { connectForm, consoleView } = require('./_lib/html');

/**
 * POST /api/connect
 * Test RCON credentials with a "serverinfo" command.
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
    // Test connection with serverinfo
    const info = await execRcon(host, port, password, 'serverinfo');
    return res.status(200).send(consoleView(host, port, password, info));
  } catch (err) {
    return res.status(200).send(connectForm(err.message));
  }
};
