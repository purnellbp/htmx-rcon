const { connectForm } = require('./_lib/html');

/**
 * POST /api/disconnect
 * Return the connect form (replaces console view).
 */
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(connectForm());
};
