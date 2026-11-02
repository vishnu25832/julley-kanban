
const jwt = require("jsonwebtoken");
const { prisma } = require("../config/database");

function getRoomName(tenantId, boardId) {
  return `tenant:${tenantId}:board:${boardId}`;
}

function extractToken(socket) {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.startsWith("Bearer ")
      ? authToken.slice(7)
      : authToken;
  }

  const authorization = socket.handshake.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  return null;
}

async function authenticateSocket(socket, next) {
  try {
    const token = extractToken(socket);

    if (!token) {
      return next(new Error("Authentication token is required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      return next(new Error("Invalid authentication token"));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          select: {
            organizationId: true,
            tenantId: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      return next(new Error("User account no longer exists"));
    }

    socket.data.user = user;
    socket.data.joinedBoards = new Map();

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return next(new Error("Invalid or expired authentication token"));
    }

    console.error("Socket authentication error:", error);
    next(new Error("Socket authentication failed"));
  }
}

async function authorizeBoardAccess(user, boardId) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          organizationId: true,
        },
      },
    },
  });

  if (!board || !board.tenant) {
    return null;
  }

  const membership = user.memberships.find((item) => {
    if (item.organizationId !== board.tenant.organizationId) {
      return false;
    }

    if (item.role === "ORG_ADMIN" && item.tenantId === null) {
      return true;
    }

    return item.tenantId === board.tenantId;
  });

  if (!membership) {
    return null;
  }

  return {
    boardId: board.id,
    tenantId: board.tenantId,
    organizationId: board.tenant.organizationId,
    room: getRoomName(board.tenantId, board.id),
  };
}

// Get unique users currently connected to a board room.
async function getRoomPresence(io, room) {
  const sockets = await io.in(room).fetchSockets();
  const uniqueUsers = new Map();

  for (const connectedSocket of sockets) {
    const user = connectedSocket.data.user;

    if (user) {
      uniqueUsers.set(user.id, {
        id: user.id,
        name: user.name,
      });
    }
  }

  return Array.from(uniqueUsers.values());
}

// Publish the current online-user list to everyone in the room.
async function broadcastPresence(io, room, boardId) {
  const users = await getRoomPresence(io, room);

  io.to(room).emit("board:presence", {
    boardId,
    users,
    count: users.length,
  });
}

function initializeSocket(io) {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user = socket.data.user;

    console.log(`Authenticated socket connected: ${socket.id}`);

    socket.emit("socket:ready", {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

    // JOIN BOARD
    socket.on("board:join", async (payload, callback) => {
      const respond =
        typeof callback === "function" ? callback : () => {};

      try {
        const boardId = payload?.boardId;

        if (typeof boardId !== "string" || !boardId.trim()) {
          return respond({
            success: false,
            message: "A valid boardId is required",
          });
        }

        const access = await authorizeBoardAccess(user, boardId);

        if (!access) {
          return respond({
            success: false,
            message: "Board not found or access denied",
          });
        }

        const alreadyJoined = socket.rooms.has(access.room);

        // Check whether this user is already present through another tab.
        const existingUsers = await getRoomPresence(io, access.room);
        const userAlreadyPresent = existingUsers.some(
          (existingUser) => existingUser.id === user.id
        );

        await socket.join(access.room);

        socket.data.joinedBoards.set(access.room, {
          boardId: access.boardId,
          tenantId: access.tenantId,
        });

        const users = await getRoomPresence(io, access.room);

        respond({
          success: true,
          message: "Joined board room",
          boardId: access.boardId,
          tenantId: access.tenantId,
          users,
          count: users.length,
        });

        // Notify others only when this is the user's first connection
        // to this board, not when they open another tab.
        if (!alreadyJoined && !userAlreadyPresent) {
          socket.to(access.room).emit("board:user-joined", {
            userId: user.id,
            name: user.name,
            boardId: access.boardId,
          });
        }

        await broadcastPresence(io, access.room, access.boardId);
      } catch (error) {
        console.error("Board room join error:", error);

        respond({
          success: false,
          message: "Unable to join board room",
        });
      }
    });

    // LEAVE BOARD
    socket.on("board:leave", async (payload, callback) => {
      const respond =
        typeof callback === "function" ? callback : () => {};

      try {
        const boardId = payload?.boardId;

        if (typeof boardId !== "string" || !boardId.trim()) {
          return respond({
            success: false,
            message: "A valid boardId is required",
          });
        }

        const access = await authorizeBoardAccess(user, boardId);

        if (!access) {
          return respond({
            success: false,
            message: "Board not found or access denied",
          });
        }

        await socket.leave(access.room);
        socket.data.joinedBoards.delete(access.room);

        const remainingUsers = await getRoomPresence(io, access.room);

        const userStillConnected = remainingUsers.some(
          (remainingUser) => remainingUser.id === user.id
        );

        respond({
          success: true,
          message: "Left board room",
          boardId: access.boardId,
        });

        if (!userStillConnected) {
          io.to(access.room).emit("board:user-left", {
            userId: user.id,
            name: user.name,
            boardId: access.boardId,
          });
        }

        await broadcastPresence(io, access.room, access.boardId);
      } catch (error) {
        console.error("Board room leave error:", error);

        respond({
          success: false,
          message: "Unable to leave board room",
        });
      }
    });

    // DISCONNECT
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.id}`);

      try {
        const joinedBoards = Array.from(
          socket.data.joinedBoards?.entries() || []
        );

        for (const [room, board] of joinedBoards) {
          const remainingUsers = await getRoomPresence(io, room);

          const userStillConnected = remainingUsers.some(
            (remainingUser) => remainingUser.id === user.id
          );

          if (!userStillConnected) {
            io.to(room).emit("board:user-left", {
              userId: user.id,
              name: user.name,
              boardId: board.boardId,
            });
          }

          await broadcastPresence(io, room, board.boardId);
        }
      } catch (error) {
        console.error("Presence cleanup error:", error);
      }
    });
  });
}

module.exports = {
  initializeSocket,
  getRoomName,
};
