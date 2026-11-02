const BASE_URL = "http://localhost:5000/api";
const EMAIL = "member@test.com";
const PASSWORD = "Member@12345";

// Tenant belonging to the second organization.
const OTHER_ORG_TENANT_ID = "79247268-9945-412e-bc87-f3c02a068ea9";

async function main() {
  console.log("1. Logging in as Member...");

  const login = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const loginData = await login.json();

  if (!login.ok) throw new Error(JSON.stringify(loginData));

  const token = loginData.token || loginData.data?.token;
  if (!token) throw new Error("JWT token not found.");

  console.log("PASS: Login successful.");

  console.log("\n2. Accessing another organization's tenant...");

  const response = await fetch(
    `${BASE_URL}/tenants/${OTHER_ORG_TENANT_ID}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log("HTTP Status:", response.status);
  console.log("Response:", await response.text());

  if ([403, 404].includes(response.status)) {
    console.log("\nPASS: Cross-organization access blocked.");
  } else {
    console.log("\nFAIL: Unexpected access result.");
  }
}

main().catch(error => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
