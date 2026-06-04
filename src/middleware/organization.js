export function requireOrganization(req, res, next) {
  const organizationId = req.user?.organizationId || req.params.organizationId || req.header('x-organization-id');
  if (!organizationId) return res.status(400).json({ error: 'organizationId is required' });
  req.organizationId = organizationId;
  return next();
}
