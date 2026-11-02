
const { z } = require("zod");
const { randomBytes } = require("crypto");
const { prisma } = require("../config/database");
const { createSlug } = require("../utils/slug");

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});

const tenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});

function makeUniqueSlug(value) {
  return `${createSlug(value)}-${randomBytes(3).toString("hex")}`;
}

function hasOrganizationAccess(user, organizationId) {
  return user.memberships.some(
    (membership) =>
      membership.organizationId === organizationId
  );
}

function isOrganizationAdmin(user, organizationId) {
  return user.memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.role === "ORG_ADMIN" &&
      membership.tenantId === null
  );
}

function hasTenantAccess(user, organizationId, tenantId) {
  return user.memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      (
        (membership.role === "ORG_ADMIN" &&
          membership.tenantId === null) ||
        membership.tenantId === tenantId
      )
  );
}

// GET /api/organizations
async function getOrganizations(req, res, next) {
  try {
    const organizationIds = [
      ...new Set(
        req.user.memberships.map(
          (membership) => membership.organizationId
        )
      ),
    ];

    const organizations = await prisma.organization.findMany({
      where: {
        id: { in: organizationIds },
      },
      include: {
        _count: {
          select: {
            tenants: true,
            memberships: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      organizations,
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/organizations
async function createOrganization(req, res, next) {
  try {
    const validation = organizationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization details",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { name, description } = validation.data;

    const organization = await prisma.$transaction(async (tx) => {
      const createdOrganization = await tx.organization.create({
        data: {
          name,
          description,
          slug: makeUniqueSlug(name),
        },
      });

      await tx.membership.create({
        data: {
          userId: req.user.id,
          organizationId: createdOrganization.id,
          tenantId: null,
          role: "ORG_ADMIN",
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: createdOrganization.id,
          userId: req.user.id,
          action: "CREATED",
          entityType: "ORGANIZATION",
          entityId: createdOrganization.id,
          details: {
            name: createdOrganization.name,
          },
        },
      });

      return createdOrganization;
    });

    return res.status(201).json({
      success: true,
      message: "Organization created successfully",
      organization,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/organizations/:organizationId/tenants
async function getTenants(req, res, next) {
  try {
    const { organizationId } = req.params;

    if (!hasOrganizationAccess(req.user, organizationId)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this organization",
      });
    }

    const isAdmin = isOrganizationAdmin(
      req.user,
      organizationId
    );

    const allowedTenantIds = req.user.memberships
      .filter(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.tenantId !== null
      )
      .map((membership) => membership.tenantId);

    const tenants = await prisma.tenant.findMany({
      where: {
        organizationId,
        ...(isAdmin
          ? {}
          : {
              id: { in: allowedTenantIds },
            }),
      },
      include: {
        _count: {
          select: {
            boards: true,
            memberships: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      tenants,
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/organizations/:organizationId/tenants
async function createTenant(req, res, next) {
  try {
    const { organizationId } = req.params;

    if (!isOrganizationAdmin(req.user, organizationId)) {
      return res.status(403).json({
        success: false,
        message: "Only an organization admin can create tenants",
      });
    }

    const validation = tenantSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant details",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { name, description } = validation.data;

    const tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          organizationId,
          name,
          description,
          slug: makeUniqueSlug(name),
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          tenantId: createdTenant.id,
          userId: req.user.id,
          action: "CREATED",
          entityType: "TENANT",
          entityId: createdTenant.id,
          details: {
            name: createdTenant.name,
          },
        },
      });

      return createdTenant;
    });

    return res.status(201).json({
      success: true,
      message: "Tenant created successfully",
      tenant,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/tenants/:tenantId
async function getTenant(req, res, next) {
  try {
    const { tenantId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            boards: true,
            memberships: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    if (
      !hasTenantAccess(
        req.user,
        tenant.organizationId,
        tenant.id
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this tenant",
      });
    }

    return res.json({
      success: true,
      tenant,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrganizations,
  createOrganization,
  getTenants,
  createTenant,
  getTenant,
};
