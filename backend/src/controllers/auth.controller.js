
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { z } = require("zod");
const { prisma } = require("../config/database");
const { createSlug } = require("../utils/slug");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  organizationName: z.string().trim().min(2).max(100),
  tenantName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function generateToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

async function register(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration data",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const {
      name,
      email,
      password,
      organizationName,
      tenantName,
    } = parsed.data;

    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const suffix = randomBytes(3).toString("hex");
    const organizationSlug =
      `${createSlug(organizationName)}-${suffix}`;

    const tenantSlug = createSlug(tenantName);

    const user = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          organizationId: organization.id,
        },
      });

      const newUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      await tx.membership.create({
        data: {
          userId: newUser.id,
          organizationId: organization.id,
          tenantId: null,
          role: "ORG_ADMIN",
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: organization.id,
          tenantId: tenant.id,
          userId: newUser.id,
          action: "CREATED",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          details: {
            message: "Organization created",
          },
        },
      });

      return newUser;
    });

    const token = generateToken(user.id);

    return res.status(201).json({
      success: true,
      message: "Account and organization created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A record with this unique value already exists",
      });
    }

    next(error);
  }
}

async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid login data",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
      include: {
        memberships: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        memberships: user.memberships,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
};
