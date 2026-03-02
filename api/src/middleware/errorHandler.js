const crypto = require('crypto');

function errorHandler(err, req, res, next) {
  const id = req.requestId || crypto.randomUUID();
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  const message = err.message || 'Internal error';
  const body = { ok: false, error: { code, message, id } };
  if (err.details) body.error.details = err.details;
  console.error(`[${id}]`, err);
  res.status(status).json(body);
}

module.exports = { errorHandler };
