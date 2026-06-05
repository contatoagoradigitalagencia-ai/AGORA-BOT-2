const ADMIN_ROLES = new Set(['owner', 'admin']);

export function requireAdminRole(req, res, next) {
  if (req.user?.type === 'internal') return next();
  if (ADMIN_ROLES.has(req.user?.role)) return next();
  return res.status(403).json({ error: 'Forbidden' });
}
