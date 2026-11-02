
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const organizationRoutes = require("./routes/organization.routes");
const boardRoutes = require("./routes/board.routes");
const taskRoutes = require("./routes/task.routes");

const {
  notFound,
  errorHandler,
} = require("./middleware/error.middleware");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "JulleyOnline Kanban API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", organizationRoutes);
app.use("/api", boardRoutes);
app.use("/api", taskRoutes);

app.use(notFound);
app.use(errorHandler);


module.exports = app;
