
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");

const {
  getBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  createColumn,
  updateColumn,
  deleteColumn,
} = require("../controllers/board.controller");

const router = express.Router();

router.use(authenticate);

router.get("/tenants/:tenantId/boards", getBoards);
router.post("/tenants/:tenantId/boards", createBoard);

router.get("/boards/:boardId", getBoard);
router.patch("/boards/:boardId", updateBoard);
router.delete("/boards/:boardId", deleteBoard);

router.post("/boards/:boardId/columns", createColumn);
router.patch("/columns/:columnId", updateColumn);
router.delete("/columns/:columnId", deleteColumn);

module.exports = router;
