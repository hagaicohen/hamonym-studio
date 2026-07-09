module.exports = (req, res, next) => {
  if (req.user?.isSuperAdmin) return next();
  if (Array.isArray(req.user?.platformPermissions) && req.user.platformPermissions.length > 0) return next();
  return res.status(403).json({ error: 'Forbidden' });
};
