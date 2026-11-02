const BASE_URL = "http://localhost:5000/api";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";

async function testTaskHistory() {
  try {
    console.log("1. Logging in as admin...");

    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: "admin@test.com",
        password: "TestPass123!"
      })
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      throw new Error(JSON.stringify(loginData));
    }

    const token =
      loginData.token ||
      loginData.data?.token;

    if (!token) {
      throw new Error(
        "Login response did not contain a token: " +
        JSON.stringify(loginData)
      );
    }

    console.log("Admin login successful.");

    console.log("\n2. Fetching task history...");

    const historyResponse = await fetch(
      `${BASE_URL}/boards/${BOARD_ID}/history`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const historyData = await historyResponse.json();

    console.log("\nHTTP Status:", historyResponse.status);
    console.log("\nResponse:");
    console.log(JSON.stringify(historyData, null, 2));

    if (!historyResponse.ok) {
      throw new Error("History request failed.");
    }

    console.log("\nSUCCESS: Task history endpoint is working.");

  } catch (error) {
    console.error("\nTEST FAILED:");
    console.error(error.message);
  }
}

testTaskHistory();
