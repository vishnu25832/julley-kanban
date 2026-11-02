
require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./src/app");
const {
  connectDatabase,
  disconnectDatabase,
} = require("./src/config/database");

const { initializeSocket } = require("./src/realtime/socket");

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  initializeSocket(io);

  app.set("io", io);

  httpServer.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
    console.log("Socket.IO authentication initialized");
  });

  async function shutdown() {
    console.log("Shutting down server...");

    httpServer.close();

    await new Promise((resolve) => {
      io.close(resolve);
    });

    await disconnectDatabase();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
