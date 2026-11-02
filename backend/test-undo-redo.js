
const BASE_URL = "http://127.0.0.1:5000/api";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";
const TASK_ID = "9459630b-ca8a-4039-b286-15f363e4512b";

async function request(url, token, method = "GET") {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

async function runTest() {
  try {
    console.log("1. Admin login...");

    const login = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@test.com",
        password: "TestPass123!",
      }),
    });

    const loginData = await login.json();
    const token = loginData.token || loginData.data?.token;

    if (!login.ok || !token) {
      throw new Error("Admin login failed.");
    }

    console.log("PASS: Admin login successful.");

    console.log("\n2. Verifying test task exists...");

    const initialTask = await request(
      `${BASE_URL}/tasks/${TASK_ID}`,
      token
    );

    if (initialTask.status !== 200) {
      throw new Error("Test task does not exist.");
    }

    console.log("PASS: Test task exists.");

    console.log("\n3. Undo CREATE action...");

    const undo = await request(
      `${BASE_URL}/boards/${BOARD_ID}/undo`,
      token,
      "POST"
    );

    console.log("Undo status:", undo.status);
    console.log(JSON.stringify(undo.data, null, 2));

    if (undo.status !== 200) {
      throw new Error("Undo failed.");
    }

    console.log("\n4. Verify task was deleted by Undo...");

    const afterUndo = await request(
      `${BASE_URL}/tasks/${TASK_ID}`,
      token
    );

    console.log("Task status:", afterUndo.status);

    if (afterUndo.status !== 404) {
      throw new Error("Undo did not delete the test task.");
    }

    console.log("PASS: Undo deleted the task.");

    console.log("\n5. Redo CREATE action...");

    const redo = await request(
      `${BASE_URL}/boards/${BOARD_ID}/redo`,
      token,
      "POST"
    );

    console.log("Redo status:", redo.status);
    console.log(JSON.stringify(redo.data, null, 2));

    if (redo.status !== 200) {
      throw new Error("Redo failed.");
    }

    console.log("\n6. Verify task was restored by Redo...");

    const afterRedo = await request(
      `${BASE_URL}/tasks/${TASK_ID}`,
      token
    );

    console.log("Task status:", afterRedo.status);

    if (afterRedo.status !== 200) {
      throw new Error("Redo did not restore the test task.");
    }

    console.log("PASS: Redo restored the task.");

    console.log(
      "\nALL TESTS PASSED: Undo and Redo are working."
    );
  } catch (error) {
    console.error("\nTEST FAILED:", error.message);
  }
}

runTest();
