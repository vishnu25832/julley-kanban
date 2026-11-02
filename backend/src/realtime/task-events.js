const { getRoomName } = require("./socket");

function emitTaskEvent(req, {
  event,
  boardId,
  tenantId,
  task,
  taskId,
  affectedColumnIds = [],
  userId,
}) {
  const io = req.app.get("io");

  if (!io) {
    console.error("Socket.IO instance is not available");
    return;
  }

  const room = getRoomName(tenantId, boardId);

  io.to(room).emit(event, {
    boardId,
    tenantId,
    task,
    taskId: taskId || task?.id,
    affectedColumnIds,
    actorId: userId,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { emitTaskEvent };
