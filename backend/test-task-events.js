
const BASE_URL = "http://localhost:5000";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";

const TODO_COLUMN_ID = "781a58ba-c269-4e87-b452-1045accca844";
const IN_PROGRESS_COLUMN_ID = "857c3b0b-397f-44e5-943c-5b1145fb6ae7";

const EMAIL = "admin@test.com";
const PASSWORD = "TestPass123!";

const { io } = require("socket.io-client");

const receivedEvents = new Set();

function waitForEvent(eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeout);

    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      receivedEvents.add(eventName);
      console.log(`PASS: Received ${eventName}`);
      console.log("Payload:", JSON.stringify(payload, null, 2));
      resolve(payload);
    });
  });
}

let socket;

async function request(path, method = "GET", token, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function main() {
  let taskId;

  try {
    console.log("\n1. Logging in...");

    const login = await request("/api/auth/login", "POST", null, {
      email: EMAIL,
      password: PASSWORD,
    });

    const token = login.token || login.data?.token;

    if (!token) {
      throw new Error("Login response did not contain a token.");
    }

    console.log("PASS: Login successful");

    console.log("\n2. Connecting Socket.IO...");

    socket = io(BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      setTimeout(() => reject(new Error("Socket connection timed out")), 5000);
    });

    console.log("PASS: Socket connected");

    console.log("\n3. Joining board room...");

    await new Promise((resolve, reject) => {
      socket.emit("board:join", { boardId: BOARD_ID }, (result) => {
        if (!result?.success) {
          reject(new Error(JSON.stringify(result)));
          return;
        }

        console.log("PASS: Joined board room");
        resolve();
      });
    });

    console.log("\n4. Testing task creation...");

    const createdEvent = waitForEvent("task:created");

    const created = await request(
      `/api/columns/${TODO_COLUMN_ID}/tasks`,
      "POST",
      token,
      {
        title: `Realtime test ${Date.now()}`,
        description: "Temporary task for Socket.IO event testing",
        priority: "MEDIUM",
      }
    );

    const task = created.task || created.data?.task || created.data || created;

    taskId = task.id;

    if (!taskId) {
      throw new Error(`Could not find created task ID: ${JSON.stringify(created)}`);
    }

    await createdEvent;

    console.log("\n5. Testing task update...");

    const updatedEvent = waitForEvent("task:updated");

    await request(`/api/tasks/${taskId}`, "PATCH", token, {
      title: "Realtime test updated",
      version: task.version || 1,
    });

    await updatedEvent;

    console.log("\n6. Testing task movement...");

    const movedEvent = waitForEvent("task:moved");

    await request(`/api/tasks/${taskId}/move`, "PATCH", token, {
      targetColumnId: IN_PROGRESS_COLUMN_ID,
      targetPosition: 0,
      version: (task.version || 1) + 1,
    });

    await movedEvent;

    console.log("\n7. Testing task deletion...");

    const deletedEvent = waitForEvent("task:deleted");

    await request(`/api/tasks/${taskId}`, "DELETE", token);

    await deletedEvent;

    console.log("\n========== EVENT TEST RESULTS ==========");

    for (const event of [
      "task:created",
      "task:updated",
      "task:moved",
      "task:deleted",
    ]) {
      console.log(
        `${receivedEvents.has(event) ? "PASS" : "FAIL"}: ${event}`
      );
    }

    console.log("\nAll event tests completed.");
  } catch (error) {
    console.error("\nTEST FAILED:", error.message);
    console.error("Received events:", [...receivedEvents]);

    if (taskId) {
      console.log(
        `Temporary task may remain. Task ID: ${taskId}`
      );
    }

    process.exitCode = 1;
  } finally {
    if (socket) {
      socket.disconnect();
    }
  }
}

main();
