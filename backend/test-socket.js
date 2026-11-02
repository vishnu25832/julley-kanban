
const { io } = require("socket.io-client");

const API_URL = "http://localhost:5000";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";

const accounts = [
  {
    name: "Organization Admin",
    email: "admin@test.com",
    password: "TestPass123!",
    shouldJoin: true,
  },
  {
    name: "Bangalore Member",
    email: "bangalore.member@test.com",
    password: "MemberPass123!",
    shouldJoin: false,
  },
  {
    name: "Other Organization Member",
    email: "org2.member@test.com",
    password: "Org2Pass123!",
    shouldJoin: false,
  },
];

async function login(account) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  const token =
    data.token ||
    data.data?.token ||
    data.result?.token;

  if (!token) {
    throw new Error(`Token missing: ${JSON.stringify(data)}`);
  }

  return token;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API_URL, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.close();
      reject(error);
    });
  });
}

function joinBoard(socket) {
  return new Promise((resolve) => {
    socket.emit("board:join", { boardId: BOARD_ID }, resolve);
  });
}

async function testUnauthenticatedConnection() {
  console.log("\nTEST 1: Unauthenticated connection");

  try {
    const socket = await connectSocket(null);
    socket.disconnect();
    console.log("FAIL: Unauthenticated connection accepted");
  } catch (error) {
    console.log("PASS: Connection rejected:", error.message);
  }
}

async function testAccount(account) {
  console.log(`\nTEST: ${account.name}`);

  let socket;

  try {
    const token = await login(account);
    socket = await connectSocket(token);

    console.log("PASS: Socket authenticated");

    const result = await joinBoard(socket);

    if (account.shouldJoin && result.success) {
      console.log("PASS: Board access granted");
    } else if (!account.shouldJoin && !result.success) {
      console.log("PASS: Board access rejected");
    } else {
      console.log("FAIL: Unexpected result:", result);
    }
  } catch (error) {
    console.log("FAIL:", error.message);
  } finally {
    socket?.disconnect();
  }
}

async function main() {
  await testUnauthenticatedConnection();

  for (const account of accounts) {
    await testAccount(account);
  }

  console.log("\nSocket tests completed.");
}

main().catch(console.error);
