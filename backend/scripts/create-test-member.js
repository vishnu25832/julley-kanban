require("dotenv").config();

const bcrypt = require("bcrypt");
const { prisma } = require("../src/config/database");

async function main() {
  const email = "member@test.com";
  const password = "Member@12345";

  // Find the existing organization.
  const organization = await prisma.organization.findFirst({
    where: {
      name: "Julley Technologies",
    },
  });

  if (!organization) {
    throw new Error("Julley Technologies organization not found.");
  }

  // Find Hyderabad under that organization.
  const tenant = await prisma.tenant.findFirst({
    where: {
      id: "e9e0c57f-54fc-46ee-b125-94258087384f",
      organizationId: organization.id,
    },
  });

  if (!tenant) {
    throw new Error(
      "Hyderabad tenant not found under Julley Technologies."
    );
  }

  // Prevent duplicate account creation.
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error(
      "member@test.com already exists. Do not create it again."
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: "Test Member",
        email,
        password: hashedPassword,
      },
    });

    await tx.membership.create({
      data: {
        userId: newUser.id,
        organizationId: organization.id,
        tenantId: tenant.id,
        role: "MEMBER",
      },
    });

    return newUser;
  });

  console.log("Test member created successfully.");
  console.log("Email:", user.email);
  console.log("Organization:", organization.name);
  console.log("Tenant:", tenant.name);
  console.log("Role: MEMBER");
}

main()
  .catch((error) => {
    console.error("Account creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
