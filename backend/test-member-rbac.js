const BASE_URL = "http://localhost:5000/api";

const MEMBER_EMAIL = "member@test.com";
const MEMBER_PASSWORD = "Member@12345";

const TENANT_ID = "e9e0c57f-54fc-46ee-b125-94258087384f";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";

async function main() {
  console.log("1. Logging in as Member...");

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
    throw new Error(JSON.stringify(loginData));
  }

  const token = loginData.token || loginData.data?.token;

  if (!token) {
    throw new Error("Login succeeded but token was not found.");
  }

  console.log("PASS: Member login successful.");

  console.log("\n2. Attempting to create a column as Member...");

  const response = await fetch(`${BASE_URL}/boards/${BOARD_ID}/columns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Unauthorized Member Column Test",
    }),
  });

  const result = await response.json();

  console.log("HTTP Status:", response.status);
  console.log("Response:", JSON.stringify(result, null, 2));

  if (response.status === 403) {
    console.log("\nPASS: Backend correctly rejected the Member.");
  } else if (response.ok) {
    console.log("\nFAIL: Member was allowed to create a column.");
  } else {
    console.log("\nCHECK: Unexpected response. Inspect the status and message.");
  }
}

main().catch((error) => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
