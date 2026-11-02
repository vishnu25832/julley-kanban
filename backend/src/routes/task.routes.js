
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");

const {
  createTask,
  getTasksByColumn,
  getTask,
  updateTask,
  moveTask,
  deleteTask,
  undoTaskAction,
  redoTaskAction,
  getTaskHistory,
} = require("../controllers/task.controller");

const router = express.Router();

router.use(authenticate);

// Task CRUD
router.post("/columns/:columnId/tasks", createTask);
router.get("/columns/:columnId/tasks", getTasksByColumn);

router.get("/tasks/:taskId", getTask);
router.patch("/tasks/:taskId", updateTask);
router.patch("/tasks/:taskId/move", moveTask);
router.delete("/tasks/:taskId", deleteTask);

// Task undo / redo / history
router.post("/boards/:boardId/undo", undoTaskAction);
router.post("/boards/:boardId/redo", redoTaskAction);
router.get("/boards/:boardId/history", getTaskHistory);

module.exports = router;
