module.exports = (permission) => (req, res, next) => {
  if (req.user?.isSuperAdmin) return next();
  if (Array.isArray(req.user?.platformPermissions) && req.user.platformPermissions.includes(permission)) return next();
  return res.status(403).json({ error: 'Forbidden' });
};
