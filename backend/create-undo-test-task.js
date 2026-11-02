const BASE_URL = "http://127.0.0.1:5000/api";
const COLUMN_ID = "781a58ba-c269-4e87-b452-1045accca844";

async function run() {
  const login = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.com",
      password: "TestPass123!"
    })
  });

  const loginData = await login.json();
  const token = loginData.token || loginData.data?.token;

  if (!login.ok || !token) {
    throw new Error("Admin login failed.");
  }

  const response = await fetch(
    `${BASE_URL}/columns/${COLUMN_ID}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: `Undo Redo Test ${Date.now()}`,
        description: "Temporary task for undo and redo verification"
      })
    }
  );

  const data = await response.json();
  console.log("HTTP Status:", response.status);
  console.log(JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error("Task creation failed.");
  }

  const task = data.data?.task || data.data;

  console.log("\nNEW TEST TASK ID:", task.id);
}

run().catch(error => console.error("FAILED:", error.message));
