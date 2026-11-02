require("dotenv").config();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const organizationId = "c25e6fae-d0f8-496f-b2d7-8bd84b45472c";
  const tenantId = "87a6f84a-6ec1-498e-a255-2a2f5f000957";

  const email = "bangalore.member@test.com";
  const password = "MemberPass123!";

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId },
  });

  if (!tenant) {
    throw new Error("Bangalore tenant not found in the specified organization");
  }

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    const hashedPassword = await bcrypt.hash(password, 12);

    user = await prisma.user.create({
      data: {
        name: "Bangalore Test Member",
        email,
        password: hashedPassword,
      },
    });
  }

  const existingMembership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      organizationId,
      tenantId,
    },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        tenantId,
        role: "MEMBER",
      },
    });
  }

  console.log("Test member ready:");
  console.log({
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
