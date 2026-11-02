require("dotenv").config();

const { prisma } = require("../src/config/database");

async function main() {
  const organizations = await prisma.organization.findMany({
    include: {
      tenants: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  for (const organization of organizations) {
    console.log("\nOrganization:", organization.name);
    console.log("Organization ID:", organization.id);

    console.table(organization.tenants);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
