require("dotenv").config();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const organizationId = "57615d00-cce8-499e-8c19-19969fe773a4";
  const tenantId = "79247268-9945-412e-bc87-f3c02a068ea9";

  const email = "org2.member@test.com";
  const password = "Org2Pass123!";

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId },
  });

  if (!tenant) {
    throw new Error("Organization 2 tenant not found");
  }

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "Organization 2 Test Member",
        email,
        password: await bcrypt.hash(password, 12),
      },
    });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId, tenantId },
  });

  if (!membership) {
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        tenantId,
        role: "MEMBER",
      },
    });
  }

  console.log("Organization 2 test member ready:", {
    email,
    password,
    role: "MEMBER",
    tenant: tenant.name,
  });
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
