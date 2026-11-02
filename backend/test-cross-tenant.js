const BASE_URL = "http://localhost:5000/api";

const MEMBER_EMAIL = "member@test.com";
const MEMBER_PASSWORD = "Member@12345";

// Bangalore tenant — Member is not assigned to this tenant.
const BANGALORE_TENANT_ID = "87a6f84a-6ec1-498e-a255-2a2f5f000957";

async function main() {
  console.log("1. Logging in as Hyderabad Member...");

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: MEMBER_EMAIL,
      password: MEMBER_PASSWORD,
    }),
  });

  const loginData = await loginResponse.json();

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }

  const token = loginData.token || loginData.data?.token;

  if (!token) {
    throw new Error("JWT token was not found in login response.");
  }

  console.log("PASS: Member login successful.");

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  console.log("\n2. Attempting to access Bangalore tenant...");

  const tenantResponse = await fetch(
    `${BASE_URL}/tenants/${BANGALORE_TENANT_ID}`,
    { headers }
  );

  console.log("Tenant HTTP Status:", tenantResponse.status);
  console.log("Tenant Response:", await tenantResponse.text());

  console.log("\n3. Attempting to access Bangalore boards...");

  const boardsResponse = await fetch(
    `${BASE_URL}/tenants/${BANGALORE_TENANT_ID}/boards`,
    { headers }
  );

  console.log("Boards HTTP Status:", boardsResponse.status);
  console.log("Boards Response:", await boardsResponse.text());

  const tenantDenied = [403, 404].includes(tenantResponse.status);
  const boardsDenied = [403, 404].includes(boardsResponse.status);

  console.log("\n========== TEST RESULT ==========");

  if (tenantDenied && boardsDenied) {
    console.log("PASS: Member cannot access Bangalore tenant or its boards.");
  } else {
    console.log("FAIL: At least one request was not denied.");
    console.log("Inspect the responses before making any code changes.");
  }
}

main().catch((error) => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
