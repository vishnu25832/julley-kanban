
const { z } = require("zod");
const { prisma } = require("../config/database");

const boardSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

const columnSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const updateBoardSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0);

const updateColumnSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

async function getTenantAccess(userId, tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) return null;

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId: tenant.organizationId,
      OR: [
        { role: "ORG_ADMIN", tenantId: null },
        { tenantId },
      ],
    },
  });

  if (!membership) return null;

  return { tenant, membership };
}

async function getBoardAccess(userId, boardId) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { tenant: true },
  });

  if (!board) return null;

  const access = await getTenantAccess(userId, board.tenantId);
  if (!access) return null;

  return { board, ...access };
}

function canManageBoard(role) {
  return role === "ORG_ADMIN" || role === "TENANT_ADMIN";
}

// GET /api/tenants/:tenantId/boards
async function getBoards(req, res, next) {
  try {
    const access = await getTenantAccess(req.user.id, req.params.tenantId);

    if (!access) return sendError(res, 404, "Tenant not found");

    const boards = await prisma.board.findMany({
      where: { tenantId: access.tenant.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { columns: true } },
      },
    });

    return res.json({ success: true, data: boards });
  } catch (error) {
    next(error);
  }
}

// POST /api/tenants/:tenantId/boards
async function createBoard(req, res, next) {
  try {
    const parsed = boardSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid board data");
    }

    const access = await getTenantAccess(req.user.id, req.params.tenantId);

    if (!access) return sendError(res, 404, "Tenant not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          tenantId: access.tenant.id,
          createdById: req.user.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "CREATED",
          entityType: "BOARD",
          entityId: created.id,
          details: { name: created.name },
        },
      });

      return created;
    });

    return res.status(201).json({
      success: true,
      message: "Board created successfully",
      data: board,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/boards/:boardId
async function getBoard(req, res, next) {
  try {
    const access = await getBoardAccess(req.user.id, req.params.boardId);

    if (!access) return sendError(res, 404, "Board not found");

    const board = await prisma.board.findUnique({
      where: { id: access.board.id },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              orderBy: { position: "asc" },
            },
          },
        },
      },
    });

    return res.json({ success: true, data: board });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/boards/:boardId
async function updateBoard(req, res, next) {
  try {
    const parsed = updateBoardSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid board update data");
    }

    const access = await getBoardAccess(req.user.id, req.params.boardId);

    if (!access) return sendError(res, 404, "Board not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const board = await prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({
        where: { id: access.board.id },
        data: parsed.data,
      });

      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "UPDATED",
          entityType: "BOARD",
          entityId: updated.id,
          details: parsed.data,
        },
      });

      return updated;
    });

    return res.json({
      success: true,
      message: "Board updated successfully",
      data: board,
    });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/boards/:boardId
async function deleteBoard(req, res, next) {
  try {
    const access = await getBoardAccess(req.user.id, req.params.boardId);

    if (!access) return sendError(res, 404, "Board not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "DELETED",
          entityType: "BOARD",
          entityId: access.board.id,
          details: { name: access.board.name },
        },
      });

      // The schema cascades deletion to columns and tasks.
      await tx.board.delete({
        where: { id: access.board.id },
      });
    });

    return res.json({
      success: true,
      message: "Board and its columns/tasks deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/boards/:boardId/columns
async function createColumn(req, res, next) {
  try {
    const parsed = columnSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid column data");
    }

    const access = await getBoardAccess(req.user.id, req.params.boardId);

    if (!access) return sendError(res, 404, "Board not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const column = await prisma.$transaction(async (tx) => {
      const lastColumn = await tx.boardColumn.findFirst({
        where: { boardId: access.board.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const created = await tx.boardColumn.create({
        data: {
          boardId: access.board.id,
          name: parsed.data.name,
          position: lastColumn ? lastColumn.position + 1 : 0,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "CREATED",
          entityType: "COLUMN",
          entityId: created.id,
          details: { name: created.name },
        },
      });

      return created;
    });

    return res.status(201).json({
      success: true,
      message: "Column created successfully",
      data: column,
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/columns/:columnId
async function updateColumn(req, res, next) {
  try {
    const parsed = updateColumnSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid column update data");
    }

    const column = await prisma.boardColumn.findUnique({
      where: { id: req.params.columnId },
      include: { board: true },
    });

    if (!column) return sendError(res, 404, "Column not found");

    const access = await getBoardAccess(req.user.id, column.boardId);

    if (!access) return sendError(res, 404, "Column not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.boardColumn.update({
        where: { id: column.id },
        data: parsed.data,
      });

      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "UPDATED",
          entityType: "COLUMN",
          entityId: result.id,
          details: parsed.data,
        },
      });

      return result;
    });

    return res.json({
      success: true,
      message: "Column updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/columns/:columnId
async function deleteColumn(req, res, next) {
  try {
    const column = await prisma.boardColumn.findUnique({
      where: { id: req.params.columnId },
      include: {
        board: true,
        _count: { select: { tasks: true } },
      },
    });

    if (!column) return sendError(res, 404, "Column not found");

    const access = await getBoardAccess(req.user.id, column.boardId);

    if (!access) return sendError(res, 404, "Column not found");

    if (!canManageBoard(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    if (column._count.tasks > 0) {
      return sendError(
        res,
        409,
        "Cannot delete a column containing tasks. Move or delete its tasks first."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          action: "DELETED",
          entityType: "COLUMN",
          entityId: column.id,
          details: { name: column.name },
        },
      });

      await tx.boardColumn.delete({
        where: { id: column.id },
      });
    });

    return res.json({
      success: true,
      message: "Column deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  createColumn,
  updateColumn,
  deleteColumn,
};
