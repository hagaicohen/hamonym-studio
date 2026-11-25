const net = require('net');
const commentsService = require('./comments.service');

const MESSAGES = {
  INVALID_NAME: 'Name must be 2-60 characters',
  INVALID_CONTENT: 'Comment must be 2-1000 characters',
  DUPLICATE_COMMENT: 'This comment was already sent',
  RATE_LIMITED: 'Too many comments in a short time. Please try again later',
  INVALID_STATUS: 'Status must be published or hidden',
  INVALID_MODE: 'Moderation must be approval or auto',
};

function send(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('[comments]', err.message);
  res.status(status).json({ error: status >= 500 ? 'Comments are unavailable' : (MESSAGES[err.code] || err.message), code: err.code || 'ERROR' });
}

// The visitor as Express resolves it under this module's "trust proxy" setting
// (comments.routes.js): forwarded addresses count only from trusted proxies.
const clientIp = (req) => req.ip;

exports.getComments = async (req, res) => {
  try {
    res.json(await commentsService.getComments(req.params.slug, req.query));
  } catch (err) { send(res, err); }
};

exports.createComment = async (req, res) => {
  try {
    const result = await commentsService.createComment(req.params.slug, req.body, clientIp(req));
    res.status(201).json(result);
  } catch (err) { send(res, err); }
};

exports.listForManager = async (req, res) => {
  try {
    res.json(await commentsService.listForManager(req.user, req.params.campaignId, req.query));
  } catch (err) { send(res, err); }
};

exports.setStatus = async (req, res) => {
  try {
    res.json({ comment: await commentsService.setStatus(req.user, req.params.campaignId, req.params.commentId, req.body?.status) });
  } catch (err) { send(res, err); }
};

exports.deleteComment = async (req, res) => {
  try {
    await commentsService.deleteComment(req.user, req.params.campaignId, req.params.commentId);
    res.json({ deleted: true });
  } catch (err) { send(res, err); }
};

exports.setModeration = async (req, res) => {
  try {
    res.json(await commentsService.setModeration(req.user, req.params.campaignId, req.body?.moderation));
  } catch (err) { send(res, err); }
};

// Counts and address kinds only — never the addresses themselves.
function addressKind(raw) {
  const addr = String(raw || '').replace(/^::ffff:/i, '');
  if (!net.isIP(addr)) return 'unknown';
  if (addr === '::1' || addr.startsWith('127.')) return 'loopback';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(addr) || /^(f[cd]|fe[89ab])/i.test(addr)) return 'private';
  return 'public';
}
exports.proxyCheck = (req, res) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const trustedHops = req.ips.length;
  res.json({
    forwardedForEntries: forwarded.length,
    forwardedForKinds: forwarded.map(addressKind),
    socketAddressKind: addressKind(req.socket?.remoteAddress),
    trustedHopsApplied: trustedHops,
    resolvedFrom: req.ip === req.socket?.remoteAddress ? 'socket' : 'forwarded',
    resolvedAddressKind: addressKind(req.ip),
  });
};
