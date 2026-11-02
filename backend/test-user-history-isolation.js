const BASE_URL = "http://localhost:5000/api";
const BOARD_ID = "074955e2-509e-4ff0-9cd8-fe065630028d";

const accounts = {
  admin: {
    email: "admin@test.com",
    password: "TestPass123!",
  },
  member: {
    email: "member@test.com",
    password: "Member@12345",
  },
};

async function login(account) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  return data.token || data.data?.token;
}

async function getHistory(token) {
  const response = await fetch(
    `${BASE_URL}/boards/${BOARD_ID}/history`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`History request failed: ${JSON.stringify(data)}`);
  }

  return data.data || [];
}

async function main() {
  console.log("1. Logging in as Admin and Member...");

  const adminToken = await login(accounts.admin);
  const memberToken = await login(accounts.member);

  console.log("PASS: Both logins successful.");

  console.log("\n2. Fetching each user's task history...");

  const adminHistory = await getHistory(adminToken);
  const memberHistory = await getHistory(memberToken);

  console.log("Admin history records:", adminHistory.length);
  console.log("Member history records:", memberHistory.length);

  console.log("\nAdmin history:");
  console.table(adminHistory.map(({ taskId, action, status }) => ({
    taskId, action, status
  })));

  console.log("\nMember history:");
  console.table(memberHistory.map(({ taskId, action, status }) => ({
    taskId, action, status
  })));

  const adminIds = new Set(adminHistory.map(item => item.id));
  const sharedRecords = memberHistory.filter(item => adminIds.has(item.id));

  console.log("\n3. Checking history separation...");

  if (sharedRecords.length === 0) {
    console.log("PASS: No shared history record IDs.");
  } else {
    console.log("FAIL: Users share history records:", sharedRecords);
    process.exitCode = 1;
    return;
  }

  console.log("\n4. Attempting Redo as Member...");

  const redoResponse = await fetch(
    `${BASE_URL}/boards/${BOARD_ID}/redo`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${memberToken}` },
    }
  );

  const redoData = await redoResponse.json();

  console.log("Member Redo HTTP Status:", redoResponse.status);
  console.log("Member Redo Response:", JSON.stringify(redoData, null, 2));

  console.log("\n5. Checking Admin history remains unchanged...");

  const adminHistoryAfter = await getHistory(adminToken);

  const unchanged =
    JSON.stringify(adminHistory) === JSON.stringify(adminHistoryAfter);

  if (unchanged) {
    console.log("PASS: Member Redo did not modify Admin history.");
  } else {
    console.log("FAIL: Admin history changed after Member Redo.");
    process.exitCode = 1;
    return;
  }

  console.log("\nALL CHECKS PASSED: User history is isolated.");
}

main().catch(error => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
