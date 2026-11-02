const { z } = require("zod");
const { prisma } = require("../config/database");
const { emitTaskEvent } = require("../realtime/task-events");

// ==================================================
// VALIDATION
// ==================================================

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  version: z.number().int().positive(),
}).refine((data) =>
  Object.keys(data).some((key) => key !== "version")
);

const moveTaskSchema = z.object({
  targetColumnId: z.string().uuid(),
  version: z.number().int().positive(),
  targetPosition: z.number().int().min(0).optional(),
});

// ==================================================
// COMMON HELPERS
// ==================================================

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function canManageTasks(role) {
  return ["ORG_ADMIN", "TENANT_ADMIN", "MEMBER"].includes(role);
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

async function getColumnAccess(userId, columnId) {
  const column = await prisma.boardColumn.findUnique({
    where: { id: columnId },
    include: {
      board: {
        include: { tenant: true },
      },
    },
  });

  if (!column) return null;

  const access = await getTenantAccess(
    userId,
    column.board.tenantId
  );

  if (!access) return null;

  return { column, ...access };
}

async function getBoardAccess(userId, boardId) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { tenant: true },
  });

  if (!board) return null;

  const access = await getTenantAccess(
    userId,
    board.tenantId
  );

  if (!access) return null;

  return { board, ...access };
}

async function validateAssignee(
  tx,
  assigneeId,
  tenantId,
  organizationId
) {
  if (!assigneeId) return true;

  const membership = await tx.membership.findFirst({
    where: {
      userId: assigneeId,
      organizationId,
      OR: [
        { role: "ORG_ADMIN", tenantId: null },
        { tenantId },
      ],
    },
  });

  return Boolean(membership);
}

// ==================================================
// TRANSACTION AND ORDERING HELPERS
// ==================================================

async function runOrderingTransaction(callback) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (error) {
      const retryable =
        error.code === "P2034" ||
        error.code === "P2002";

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 100)
      );
    }
  }
}

async function lockColumns(tx, columnIds) {
  const uniqueIds = [...new Set(columnIds)].sort();

  for (const columnId of uniqueIds) {
    await tx.$queryRaw`
      WITH lock_result AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtext(${`julley-kanban-column:${columnId}`})
        )
      )
      SELECT 1 AS locked
      FROM lock_result
    `;
  }
}

async function getOrderedTasks(tx, columnId) {
  return tx.task.findMany({
    where: { columnId },
    orderBy: [
      { position: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
}

async function reindexColumn(tx, columnId, tasks) {
  const needsReindex = tasks.some(
    (task, index) => task.position !== index
  );

  if (!needsReindex) return;

  for (let index = 0; index < tasks.length; index++) {
    await tx.task.update({
      where: { id: tasks[index].id },
      data: { position: -(index + 1) },
    });
  }

  for (let index = 0; index < tasks.length; index++) {
    await tx.task.update({
      where: { id: tasks[index].id },
      data: {
        position: index,
        version: { increment: 1 },
      },
    });
  }
}

async function writeFinalOrder(tx, columnId, tasks) {
  for (let index = 0; index < tasks.length; index++) {
    await tx.task.update({
      where: { id: tasks[index].id },
      data: {
        columnId,
        position: index,
        version: { increment: 1 },
      },
    });
  }
}

// ==================================================
// ACTIVITY LOGGING
// ==================================================

async function createTaskActivity(
  tx,
  {
    organizationId,
    tenantId,
    userId,
    taskId,
    action,
    details,
  }
) {
  await tx.activityLog.create({
    data: {
      organizationId,
      tenantId,
      userId,
      action,
      entityType: "TASK",
      entityId: taskId,
      details,
    },
  });
}

// ==================================================
// TASK HISTORY SNAPSHOTS
// ==================================================

function serializeTask(task) {
  return {
    id: task.id,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate
      ? new Date(task.dueDate).toISOString()
      : null,
    position: task.position,
    version: task.version,
    createdById: task.createdById,
    createdAt: task.createdAt
      ? new Date(task.createdAt).toISOString()
      : null,
    updatedAt: task.updatedAt
      ? new Date(task.updatedAt).toISOString()
      : null,
  };
}

async function snapshotColumns(tx, columnIds) {
  const snapshots = [];

  for (const columnId of [...new Set(columnIds)].sort()) {
    const tasks = await getOrderedTasks(tx, columnId);

    snapshots.push({
      columnId,
      tasks: tasks.map(serializeTask),
    });
  }

  return { columns: snapshots };
}

async function recordTaskHistory(tx, data) {
  // A new action invalidates this user's redo branch.
  await tx.taskHistory.deleteMany({
    where: {
      userId: data.userId,
      boardId: data.boardId,
      status: "UNDONE",
    },
  });

  return tx.taskHistory.create({
    data: {
      boardId: data.boardId,
      tenantId: data.tenantId,
      userId: data.userId,
      taskId: data.taskId,
      action: data.action,
      status: "APPLIED",
      beforeState: data.beforeState,
      afterState: data.afterState,
    },
  });
}

function sameColumnState(current, expected) {
  if (!expected || !Array.isArray(expected.columns)) {
    return false;
  }

  if (current.columns.length !== expected.columns.length) {
    return false;
  }

  const currentById = new Map(
    current.columns.map((column) => [
      column.columnId,
      column,
    ])
  );

  for (const expectedColumn of expected.columns) {
    const actual = currentById.get(expectedColumn.columnId);

    if (!actual || actual.tasks.length !== expectedColumn.tasks.length) {
      return false;
    }

    const actualTasks = new Map(
      actual.tasks.map((task) => [task.id, task])
    );

    for (const expectedTask of expectedColumn.tasks) {
      const actualTask = actualTasks.get(expectedTask.id);

      if (
        !actualTask ||
        actualTask.version !== expectedTask.version ||
        actualTask.columnId !== expectedTask.columnId ||
        actualTask.position !== expectedTask.position
      ) {
        return false;
      }
    }
  }

  return true;
}

// Restore all affected columns, including neighboring tasks.
// This prevents incorrect ordering after undoing or redoing moves.
async function restoreColumnSnapshot(tx, targetState) {
  const targetColumns = targetState.columns || [];

  const columnIds = targetColumns.map(
    (column) => column.columnId
  );

  await lockColumns(tx, columnIds);

  const targetTasks = targetColumns.flatMap(
    (column) => column.tasks
  );

  const targetById = new Map(
    targetTasks.map((task) => [task.id, task])
  );

  const currentTasks = await tx.task.findMany({
    where: {
      columnId: { in: columnIds },
    },
    orderBy: [
      { columnId: "asc" },
      { position: "asc" },
    ],
  });

  // Stage existing rows at temporary negative positions.
  const currentByColumn = new Map();

  for (const task of currentTasks) {
    const list = currentByColumn.get(task.columnId) || [];
    list.push(task);
    currentByColumn.set(task.columnId, list);
  }

  for (const [columnId, tasks] of currentByColumn.entries()) {
    for (let index = 0; index < tasks.length; index++) {
      await tx.task.update({
        where: { id: tasks[index].id },
        data: {
          position: -1000000000 + index,
        },
      });
    }
  }

  // Delete tasks that are absent from the target snapshot.
  for (const task of currentTasks) {
    if (!targetById.has(task.id)) {
      await tx.task.delete({
        where: { id: task.id },
      });
    }
  }

  // Restore or recreate all target tasks.
  for (const column of targetColumns) {
    for (let index = 0; index < column.tasks.length; index++) {
      const snapshot = column.tasks[index];

      const existing = await tx.task.findUnique({
        where: { id: snapshot.id },
      });

      const data = {
        columnId: column.columnId,
        title: snapshot.title,
        description: snapshot.description,
        priority: snapshot.priority,
        assigneeId: snapshot.assigneeId,
        dueDate: snapshot.dueDate
          ? new Date(snapshot.dueDate)
          : null,
        position: -2000000000 + index,
        createdById: snapshot.createdById,
      };

      if (existing) {
        await tx.task.update({
          where: { id: snapshot.id },
          data,
        });
      } else {
        await tx.task.create({
          data: {
            id: snapshot.id,
            ...data,
            version: snapshot.version + 1,
            ...(snapshot.createdAt
              ? { createdAt: new Date(snapshot.createdAt) }
              : {}),
          },
        });
      }
    }
  }

  // Restore compact positions and advance versions.
  for (const column of targetColumns) {
    for (let index = 0; index < column.tasks.length; index++) {
      const snapshot = column.tasks[index];

      const existedBefore = currentTasks.some(
        (task) => task.id === snapshot.id
      );

      await tx.task.update({
        where: { id: snapshot.id },
        data: {
          position: index,
          ...(existedBefore
            ? { version: { increment: 1 } }
            : {}),
        },
      });
    }
  }

  return snapshotColumns(tx, columnIds);
}

// ==================================================
// CREATE TASK
// POST /api/columns/:columnId/tasks
// ==================================================

async function createTask(req, res, next) {
  try {
    const parsed = createTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid task data");
    }

    const access = await getColumnAccess(
      req.user.id,
      req.params.columnId
    );

    if (!access) {
      return sendError(res, 404, "Column not found");
    }

    if (!canManageTasks(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const task = await runOrderingTransaction(async (tx) => {
      await lockColumns(tx, [access.column.id]);

      const validAssignee = await validateAssignee(
        tx,
        parsed.data.assigneeId,
        access.tenant.id,
        access.tenant.organizationId
      );

      if (!validAssignee) {
        throw createHttpError(
          400,
          "Assignee does not belong to this tenant"
        );
      }

      const beforeState = await snapshotColumns(
        tx,
        [access.column.id]
      );

      const existingTasks = await getOrderedTasks(
        tx,
        access.column.id
      );

      await reindexColumn(
        tx,
        access.column.id,
        existingTasks
      );

      const created = await tx.task.create({
        data: {
          columnId: access.column.id,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          priority: parsed.data.priority ?? "MEDIUM",
          assigneeId: parsed.data.assigneeId ?? null,
          dueDate: parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : null,
          position: existingTasks.length,
          createdById: req.user.id,
        },
      });

      const afterState = await snapshotColumns(
        tx,
        [access.column.id]
      );

      await recordTaskHistory(tx, {
        boardId: access.column.boardId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: created.id,
        action: "CREATED",
        beforeState,
        afterState,
      });

      await createTaskActivity(tx, {
        organizationId: access.tenant.organizationId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: created.id,
        action: "CREATED",
        details: { title: created.title },
      });

      return created;
    });

    emitTaskEvent(req, {
      event: "task:created",
      boardId: access.column.boardId,
      tenantId: access.tenant.id,
      task,
      affectedColumnIds: [access.column.id],
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// GET TASKS BY COLUMN
// GET /api/columns/:columnId/tasks
// ==================================================

async function getTasksByColumn(req, res, next) {
  try {
    const access = await getColumnAccess(
      req.user.id,
      req.params.columnId
    );

    if (!access) {
      return sendError(res, 404, "Column not found");
    }

    const tasks = await prisma.task.findMany({
      where: { columnId: access.column.id },
      orderBy: [
        { position: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// GET SINGLE TASK
// GET /api/tasks/:taskId
// ==================================================

async function getTask(req, res, next) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        column: {
          include: {
            board: {
              include: { tenant: true },
            },
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const access = await getTenantAccess(
      req.user.id,
      task.column.board.tenantId
    );

    if (!access) {
      return sendError(res, 404, "Task not found");
    }

    return res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// UPDATE TASK
// PATCH /api/tasks/:taskId
// ==================================================

async function updateTask(req, res, next) {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "Invalid task update data or missing version"
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        column: {
          include: {
            board: {
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const access = await getTenantAccess(
      req.user.id,
      task.column.board.tenantId
    );

    if (!access) {
      return sendError(res, 404, "Task not found");
    }

    const { version, ...updates } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      await lockColumns(tx, [task.columnId]);

      const beforeState = await snapshotColumns(
        tx,
        [task.columnId]
      );

      const validAssignee = await validateAssignee(
        tx,
        updates.assigneeId,
        access.tenant.id,
        access.tenant.organizationId
      );

      if (!validAssignee) {
        throw createHttpError(
          400,
          "Assignee does not belong to this tenant"
        );
      }

      const updatedCount = await tx.task.updateMany({
        where: {
          id: task.id,
          version,
        },
        data: {
          ...updates,
          dueDate:
            updates.dueDate === undefined
              ? undefined
              : updates.dueDate === null
                ? null
                : new Date(updates.dueDate),
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw createHttpError(
          409,
          "Task was modified by another user. Refresh and retry."
        );
      }

      const updated = await tx.task.findUnique({
        where: { id: task.id },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      const afterState = await snapshotColumns(
        tx,
        [task.columnId]
      );

      await recordTaskHistory(tx, {
        boardId: task.column.boardId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: task.id,
        action: "UPDATED",
        beforeState,
        afterState,
      });

      await createTaskActivity(tx, {
        organizationId: access.tenant.organizationId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: task.id,
        action: "UPDATED",
        details: updates,
      });

      return updated;
    });

    emitTaskEvent(req, {
      event: "task:updated",
      boardId: task.column.boardId,
      tenantId: access.tenant.id,
      task: result,
      affectedColumnIds: [task.columnId],
      userId: req.user.id,
    });

    return res.json({
      success: true,
      message: "Task updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// MOVE / REORDER TASK
// PATCH /api/tasks/:taskId/move
// ==================================================

async function moveTask(req, res, next) {
  try {
    const parsed = moveTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid move request");
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        column: {
          include: {
            board: {
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const access = await getTenantAccess(
      req.user.id,
      task.column.board.tenantId
    );

    if (!access) {
      return sendError(res, 404, "Task not found");
    }

    if (!canManageTasks(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    const targetColumn = await prisma.boardColumn.findUnique({
      where: { id: parsed.data.targetColumnId },
      include: { board: true },
    });

    if (
      !targetColumn ||
      targetColumn.boardId !== task.column.boardId
    ) {
      return sendError(
        res,
        400,
        "Target column must belong to the same board"
      );
    }

    const moved = await runOrderingTransaction(async (tx) => {
      const sourceColumnId = task.columnId;
      const targetColumnId = targetColumn.id;

      await lockColumns(tx, [
        sourceColumnId,
        targetColumnId,
      ]);

      const beforeState = await snapshotColumns(
        tx,
        [sourceColumnId, targetColumnId]
      );

      const current = await tx.task.findUnique({
        where: { id: task.id },
      });

      if (
        !current ||
        current.version !== parsed.data.version ||
        current.columnId !== sourceColumnId
      ) {
        throw createHttpError(
          409,
          "Task was modified by another user. Refresh and retry."
        );
      }

      const sourceTasks = await getOrderedTasks(
        tx,
        sourceColumnId
      );

      const sourceIndex = sourceTasks.findIndex(
        (item) => item.id === current.id
      );

      if (sourceIndex === -1) {
        throw createHttpError(
          409,
          "Task ordering changed. Refresh and retry."
        );
      }

      if (sourceColumnId === targetColumnId) {
        const reordered = [...sourceTasks];
        const [movingTask] = reordered.splice(sourceIndex, 1);

        const requestedPosition =
          parsed.data.targetPosition ?? reordered.length;

        const destination = Math.min(
          requestedPosition,
          reordered.length
        );

        reordered.splice(destination, 0, movingTask);

        const changed = reordered.some(
          (item, index) => item.id !== sourceTasks[index]?.id
        );

        if (!changed) {
          return tx.task.findUnique({
            where: { id: current.id },
          });
        }

        for (let index = 0; index < sourceTasks.length; index++) {
          await tx.task.update({
            where: { id: sourceTasks[index].id },
            data: { position: -(index + 1) },
          });
        }

        await writeFinalOrder(
          tx,
          sourceColumnId,
          reordered
        );
      } else {
        const targetTasks = await getOrderedTasks(
          tx,
          targetColumnId
        );

        const sourceRemaining = sourceTasks.filter(
          (item) => item.id !== current.id
        );

        const targetReordered = [...targetTasks];

        const requestedPosition =
          parsed.data.targetPosition ?? targetReordered.length;

        const destination = Math.min(
          requestedPosition,
          targetReordered.length
        );

        targetReordered.splice(destination, 0, current);

        for (let index = 0; index < sourceTasks.length; index++) {
          await tx.task.update({
            where: { id: sourceTasks[index].id },
            data: { position: -(index + 1) },
          });
        }

        for (let index = 0; index < targetTasks.length; index++) {
          await tx.task.update({
            where: { id: targetTasks[index].id },
            data: { position: -(index + 1) },
          });
        }

        await tx.task.update({
          where: { id: current.id },
          data: {
            columnId: targetColumnId,
            position: -(targetTasks.length + 1),
          },
        });

        await writeFinalOrder(
          tx,
          sourceColumnId,
          sourceRemaining
        );

        await writeFinalOrder(
          tx,
          targetColumnId,
          targetReordered
        );
      }

      const updated = await tx.task.findUnique({
        where: { id: current.id },
      });

      const afterState = await snapshotColumns(
        tx,
        [sourceColumnId, targetColumnId]
      );

      await recordTaskHistory(tx, {
        boardId: task.column.boardId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: current.id,
        action: "MOVED",
        beforeState,
        afterState,
      });

      await createTaskActivity(tx, {
        organizationId: access.tenant.organizationId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: current.id,
        action: "MOVED",
        details: {
          fromColumnId: sourceColumnId,
          toColumnId: targetColumnId,
          targetPosition: updated.position,
        },
      });

      return updated;
    });

    emitTaskEvent(req, {
      event: "task:moved",
      boardId: task.column.boardId,
      tenantId: access.tenant.id,
      task: moved,
      affectedColumnIds: [
        task.columnId,
        parsed.data.targetColumnId,
      ],
      userId: req.user.id,
    });

    return res.json({
      success: true,
      message: "Task moved successfully",
      data: moved,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// DELETE TASK
// DELETE /api/tasks/:taskId
// ==================================================

async function deleteTask(req, res, next) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        column: {
          include: {
            board: {
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const access = await getTenantAccess(
      req.user.id,
      task.column.board.tenantId
    );

    if (!access) {
      return sendError(res, 404, "Task not found");
    }

    if (!canManageTasks(access.membership.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }

    await runOrderingTransaction(async (tx) => {
      await lockColumns(tx, [task.columnId]);

      const beforeState = await snapshotColumns(
        tx,
        [task.columnId]
      );

      const current = await tx.task.findUnique({
        where: { id: task.id },
      });

      if (!current) {
        throw createHttpError(404, "Task not found");
      }

      if (current.columnId !== task.columnId) {
        throw createHttpError(
          409,
          "Task was moved by another user. Refresh and retry."
        );
      }

      await createTaskActivity(tx, {
        organizationId: access.tenant.organizationId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: current.id,
        action: "DELETED",
        details: { title: current.title },
      });

      await tx.task.delete({
        where: { id: current.id },
      });

      const remainingTasks = await getOrderedTasks(
        tx,
        task.columnId
      );

      await reindexColumn(
        tx,
        task.columnId,
        remainingTasks
      );

      const afterState = await snapshotColumns(
        tx,
        [task.columnId]
      );

      await recordTaskHistory(tx, {
        boardId: task.column.boardId,
        tenantId: access.tenant.id,
        userId: req.user.id,
        taskId: current.id,
        action: "DELETED",
        beforeState,
        afterState,
      });
    });

    emitTaskEvent(req, {
      event: "task:deleted",
      boardId: task.column.boardId,
      tenantId: access.tenant.id,
      taskId: task.id,
      affectedColumnIds: [task.columnId],
      userId: req.user.id,
    });

    return res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// UNDO / REDO
// ==================================================

async function changeTaskHistory(req, res, next, direction) {
  try {
    const access = await getBoardAccess(
      req.user.id,
      req.params.boardId
    );

    if (!access) {
      return sendError(res, 404, "Board not found");
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const history = await tx.taskHistory.findFirst({
          where: {
            boardId: access.board.id,
            tenantId: access.tenant.id,
            userId: req.user.id,
            status: direction === "UNDO"
              ? "APPLIED"
              : "UNDONE",
          },
          orderBy: {
            createdAt: direction === "UNDO"
              ? "desc"
              : "asc",
          },
        });

        if (!history) {
          throw createHttpError(
            404,
            direction === "UNDO"
              ? "Nothing to undo"
              : "Nothing to redo"
          );
        }

        const expectedState = direction === "UNDO"
          ? history.afterState
          : history.beforeState;

        const targetState = direction === "UNDO"
          ? history.beforeState
          : history.afterState;

        if (!expectedState || !targetState) {
          throw createHttpError(
            409,
            "Task history snapshot is incomplete"
          );
        }

        const columnIds = expectedState.columns.map(
          (column) => column.columnId
        );

        await lockColumns(tx, columnIds);

        const currentState = await snapshotColumns(
          tx,
          columnIds
        );

        if (!sameColumnState(currentState, expectedState)) {
          throw createHttpError(
            409,
            "Task state has changed since this action. Undo/redo was cancelled to protect newer changes."
          );
        }

        const restoredState = await restoreColumnSnapshot(
          tx,
          targetState
        );

        const restoredTask = await tx.task.findUnique({
          where: { id: history.taskId },
        });

        await tx.taskHistory.update({
          where: { id: history.id },
          data: direction === "UNDO"
            ? {
                status: "UNDONE",
                beforeState: restoredState,
              }
            : {
                status: "APPLIED",
                afterState: restoredState,
              },
        });

        await createTaskActivity(tx, {
          organizationId: access.tenant.organizationId,
          tenantId: access.tenant.id,
          userId: req.user.id,
          taskId: history.taskId,
          action:
            history.action === "CREATED" && direction === "UNDO"
              ? "DELETED"
              : history.action === "DELETED" && direction === "UNDO"
                ? "CREATED"
                : history.action === "MOVED"
                  ? "MOVED"
                  : "UPDATED",
          details: {
            operation: direction,
            originalAction: history.action,
            historyId: history.id,
          },
        });

        return {
          history,
          task: restoredTask,
          affectedColumnIds: columnIds,
        };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );

    let event = "task:updated";

    if (result.history.action === "MOVED") {
      event = "task:moved";
    }

    if (result.history.action === "CREATED") {
      event = direction === "UNDO"
        ? "task:deleted"
        : "task:created";
    }

    if (result.history.action === "DELETED") {
      event = direction === "UNDO"
        ? "task:created"
        : "task:deleted";
    }

    emitTaskEvent(req, {
      event,
      boardId: access.board.id,
      tenantId: access.tenant.id,
      task: result.task || undefined,
      taskId: result.history.taskId,
      affectedColumnIds: result.affectedColumnIds,
      userId: req.user.id,
    });

    return res.json({
      success: true,
      message: direction === "UNDO"
        ? "Task action undone successfully"
        : "Task action redone successfully",
      data: {
        action: result.history.action,
        task: result.task,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function undoTaskAction(req, res, next) {
  return changeTaskHistory(
    req,
    res,
    next,
    "UNDO"
  );
}

async function redoTaskAction(req, res, next) {
  return changeTaskHistory(
    req,
    res,
    next,
    "REDO"
  );
}

// ==================================================
// GET TASK HISTORY
// GET /api/boards/:boardId/history
// ==================================================

async function getTaskHistory(req, res, next) {
  try {
    const access = await getBoardAccess(
      req.user.id,
      req.params.boardId
    );

    if (!access) {
      return sendError(res, 404, "Board not found");
    }

    const history = await prisma.taskHistory.findMany({
      where: {
        boardId: access.board.id,
        tenantId: access.tenant.id,
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      select: {
        id: true,
        taskId: true,
        action: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    next(error);
  }
}

// ==================================================
// EXPORTS
// ==================================================

module.exports = {
  createTask,
  getTasksByColumn,
  getTask,
  updateTask,
  moveTask,
  deleteTask,
  undoTaskAction,
  redoTaskAction,
  getTaskHistory,
};
