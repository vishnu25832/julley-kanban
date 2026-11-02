
function requireTenantAccess(req, res, next) {
    const { organizationId, tenantId } = req.params;

    if (!tenantId || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID and tenant ID are required",
      });
    }

    const membership = req.user.memberships.find(
      (item) =>
        item.organizationId === organizationId &&
        (
          item.role === "ORG_ADMIN" ||
          item.tenantId === tenantId
        )
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this tenant",
      });
    }

    req.membership = membership;
    next();
  }

  function allowRoles(...allowedRoles) {
    return (req, res, next) => {
      if (!req.membership || !allowedRoles.includes(req.membership.role)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action",
        });
      }

      next();
    };
  }

  module.exports = {
    requireTenantAccess,
    allowRoles,
  };

