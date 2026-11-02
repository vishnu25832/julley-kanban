import React, { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  MapPin,
  ArrowLeft,
  Users,
  FolderKanban,
  ChevronRight,
  Plus,
  Calendar,
  ListTodo,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  Undo2,
  Redo2,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import TaskModal from "../components/TaskModal";
import { connectSocket } from "../services/socket";

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [organizations, setOrganizations] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [boards, setBoards] = useState([]);

  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);

  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);

  const [error, setError] = useState("");

  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDescription, setNewBoardDescription] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [showCreateColumn, setShowCreateColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [creatingColumn, setCreatingColumn] = useState(false);

  const [editingColumnId, setEditingColumnId] = useState(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [savingColumn, setSavingColumn] = useState(false);
  const [deletingColumnId, setDeletingColumnId] = useState(null);

  const [taskModalColumn, setTaskModalColumn] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [activeDragTask, setActiveDragTask] = useState(null);
  const [movingTask, setMovingTask] = useState(false);

  // Users currently connected to the selected board.
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Task history and Undo/Redo state.
  const [taskHistory, setTaskHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAction, setHistoryAction] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load organizations when the dashboard opens.
  useEffect(() => {
    let active = true;

    const fetchOrganizations = async () => {
      try {
        setLoadingOrganizations(true);
        setError("");

        const response = await api.get("/organizations");

        if (active) {
          setOrganizations(response.data.organizations || []);
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load organizations."
          );
        }
      } finally {
        if (active) setLoadingOrganizations(false);
      }
    };

    fetchOrganizations();

    return () => {
      active = false;
    };
  }, []);

  const getUserRole = (organizationId, tenantId = null) => {
    const memberships = user?.memberships || [];

    const exactTenantMembership = tenantId
      ? memberships.find(
          (item) =>
            item.organizationId === organizationId &&
            item.tenantId === tenantId
        )
      : null;

    const organizationMembership = memberships.find(
      (item) =>
        item.organizationId === organizationId &&
        item.tenantId === null
    );

    const membership =
      exactTenantMembership || organizationMembership;

    return membership?.role || "MEMBER";
  };

  const canManageWorkspace = selectedTenant
    ? ["ORG_ADMIN", "TENANT_ADMIN"].includes(
        getUserRole(selectedOrganization?.id, selectedTenant.id)
      )
    : false;

  // Organization selection.
  const handleOrganizationSelect = async (organization) => {
    setSelectedOrganization(organization);
    setSelectedTenant(null);
    setSelectedBoard(null);
    setTenants([]);
    setBoards([]);
    setTaskModalColumn(null);
    setEditingTask(null);
    setEditingColumnId(null);
    setOnlineUsers([]);
    setTaskHistory([]);
    setError("");

    try {
      setLoadingTenants(true);

      const response = await api.get(
        `/organizations/${organization.id}/tenants`
      );

      setTenants(response.data.tenants || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load tenants."
      );
    } finally {
      setLoadingTenants(false);
    }
  };

  // Tenant selection.
  const handleTenantSelect = async (tenant) => {
    setSelectedTenant(tenant);
    setSelectedBoard(null);
    setBoards([]);
    setTaskModalColumn(null);
    setEditingTask(null);
    setEditingColumnId(null);
    setOnlineUsers([]);
    setTaskHistory([]);
    setError("");

    try {
      setLoadingBoards(true);

      const response = await api.get(
        `/tenants/${tenant.id}/boards`
      );

      setBoards(response.data.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load boards."
      );
    } finally {
      setLoadingBoards(false);
    }
  };

  // Load the current user's task history for the selected board.
  const fetchTaskHistory = async (boardId) => {
    if (!boardId) {
      setTaskHistory([]);
      return;
    }

    try {
      setHistoryLoading(true);

      const response = await api.get(
        `/boards/${boardId}/history`
      );

      setTaskHistory(response.data.data || []);
    } catch (err) {
      setTaskHistory([]);

      console.error(
        "Unable to load task history:",
        err.response?.data?.message || err.message
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // Board selection.
  const handleBoardSelect = async (board) => {
    setSelectedBoard(null);
    setOnlineUsers([]);
    setTaskHistory([]);
    setError("");

    try {
      setLoadingBoard(true);

      const response = await api.get(`/boards/${board.id}`);

      setSelectedBoard(response.data.data);

      await fetchTaskHistory(board.id);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load board details."
      );
    } finally {
      setLoadingBoard(false);
    }
  };

  // Refresh the selected board and its history.
  const reloadSelectedBoard = async () => {
    if (!selectedBoard) return;

    const boardId = selectedBoard.id;

    const response = await api.get(`/boards/${boardId}`);

    setSelectedBoard((currentBoard) =>
      currentBoard?.id === boardId
        ? response.data.data
        : currentBoard
    );

    await fetchTaskHistory(boardId);
  };

  // Undo or redo the latest task operation performed by the current user.
  const handleTaskHistoryAction = async (action) => {
    if (!selectedBoard?.id || historyAction) return;

    try {
      setHistoryAction(action);
      setError("");

      await api.post(
        `/boards/${selectedBoard.id}/${action}`
      );

      await reloadSelectedBoard();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Unable to ${action} the latest task action. Refresh the board and try again.`
      );

      try {
        await reloadSelectedBoard();
      } catch {
        // Preserve the original undo/redo error.
      }
    } finally {
      setHistoryAction(null);
    }
  };

  // The backend returns the current user's history newest first.
  const latestHistoryEntry = taskHistory[0];

  const canUndo =
    latestHistoryEntry?.status === "APPLIED";

  const canRedo =
    latestHistoryEntry?.status === "UNDONE";

  // Real-time synchronization, presence, and automatic network recovery.
  useEffect(() => {
    if (!selectedBoard?.id || !selectedTenant?.id) return;

    const token = localStorage.getItem("token");

    if (!token) return;

    const socket = connectSocket(token);
    const boardId = selectedBoard.id;

    let isActive = true;
    let recoveryInProgress = false;

    setOnlineUsers([]);

    // Join the selected board's Socket.IO room.
    const joinBoard = () => {
      socket.emit("board:join", { boardId }, (response) => {
        if (!isActive) return;

        if (response?.success) {
          setOnlineUsers(response.users || []);

          console.log(
            "Successfully joined board:",
            boardId
          );
        } else {
          console.error(
            "Board room join failed:",
            response?.message ||
              response ||
              "No acknowledgement received"
          );
        }
      });
    };

    // Fetch authoritative board data after connecting or reconnecting.
    const handleSocketConnect = async () => {
      if (!isActive || recoveryInProgress) return;

      recoveryInProgress = true;

      console.log(
        "Socket connected. Recovering board:",
        boardId
      );

      try {
        // Rejoin the board room to resume receiving live events.
        joinBoard();

        // Fetch the latest server-side board state.
        const response = await api.get(`/boards/${boardId}`);

        if (!isActive) return;

        setSelectedBoard((currentBoard) =>
          currentBoard?.id === boardId
            ? response.data.data
            : currentBoard
        );

        // Restore the current user's task history too.
        await fetchTaskHistory(boardId);

        console.log(
          "Board successfully recovered:",
          boardId
        );
      } catch (error) {
        console.error(
          "Board recovery failed after socket connection:",
          error.response?.data?.message || error.message
        );
      } finally {
        recoveryInProgress = false;
      }
    };

    // Refresh board data when another user changes a task.
    const handleTaskEvent = async (payload) => {
      if (!isActive || payload?.boardId !== boardId) return;

      console.log("Real-time task event:", payload);

      try {
        const response = await api.get(`/boards/${boardId}`);

        if (!isActive) return;

        setSelectedBoard((currentBoard) =>
          currentBoard?.id === boardId
            ? response.data.data
            : currentBoard
        );

        await fetchTaskHistory(boardId);
      } catch (error) {
        console.error(
          "Board refresh failed after real-time event:",
          error
        );
      }
    };

    // Update the online users list.
    const handlePresenceUpdate = (payload) => {
      if (!isActive || payload?.boardId !== boardId) return;

      setOnlineUsers(payload.users || []);
    };

    const taskEvents = [
      "task:created",
      "task:updated",
      "task:moved",
      "task:deleted",
    ];

    taskEvents.forEach((event) => {
      socket.on(event, handleTaskEvent);
    });

    socket.on("board:presence", handlePresenceUpdate);

    // Run recovery whenever Socket.IO connects or reconnects.
    socket.on("connect", handleSocketConnect);

    // Handle a socket that was already connected before this effect ran.
    if (socket.connected) {
      handleSocketConnect();
    }

    return () => {
      isActive = false;

      socket.off("connect", handleSocketConnect);
      socket.off("board:presence", handlePresenceUpdate);

      taskEvents.forEach((event) => {
        socket.off(event, handleTaskEvent);
      });

      setOnlineUsers([]);

      // Leave the old board room when switching boards or unmounting.
      if (socket.connected) {
        socket.emit("board:leave", { boardId });
      }
    };
  }, [selectedBoard?.id, selectedTenant?.id]);

  // Create board.
  const handleCreateBoard = async (event) => {
    event.preventDefault();

    if (!newBoardName.trim()) {
      setError("Enter a board name.");
      return;
    }

    try {
      setCreatingBoard(true);
      setError("");

      const response = await api.post(
        `/tenants/${selectedTenant.id}/boards`,
        {
          name: newBoardName.trim(),
          description: newBoardDescription.trim() || null,
        }
      );

      setBoards((previous) => [
        response.data.data,
        ...previous,
      ]);

      setNewBoardName("");
      setNewBoardDescription("");
      setShowCreateBoard(false);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to create board."
      );
    } finally {
      setCreatingBoard(false);
    }
  };

  // Create column.
  const handleCreateColumn = async (event) => {
    event.preventDefault();

    if (!newColumnName.trim()) {
      setError("Enter a column name.");
      return;
    }

    try {
      setCreatingColumn(true);
      setError("");

      await api.post(`/boards/${selectedBoard.id}/columns`, {
        name: newColumnName.trim(),
      });

      await reloadSelectedBoard();

      setNewColumnName("");
      setShowCreateColumn(false);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to create column."
      );
    } finally {
      setCreatingColumn(false);
    }
  };

  // Edit column.
  const handleEditColumn = (column) => {
    setEditingColumnId(column.id);
    setEditingColumnName(column.name);
    setError("");
  };

  const handleCancelEditColumn = () => {
    setEditingColumnId(null);
    setEditingColumnName("");
  };

  const handleUpdateColumn = async (event, columnId) => {
    event.preventDefault();

    if (!editingColumnName.trim()) {
      setError("Column name is required.");
      return;
    }

    try {
      setSavingColumn(true);
      setError("");

      await api.patch(`/columns/${columnId}`, {
        name: editingColumnName.trim(),
      });

      await reloadSelectedBoard();

      setEditingColumnId(null);
      setEditingColumnName("");
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to update column."
      );
    } finally {
      setSavingColumn(false);
    }
  };

  // Delete column.
  const handleDeleteColumn = async (column) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${column.name}"?`
    );

    if (!confirmed) return;

    try {
      setDeletingColumnId(column.id);
      setError("");

      await api.delete(`/columns/${column.id}`);

      await reloadSelectedBoard();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to delete column. It may contain tasks."
      );
    } finally {
      setDeletingColumnId(null);
    }
  };

  // Task modal handlers.
  const handleOpenCreateTask = (column) => {
    setEditingTask(null);
    setTaskModalColumn(column);
  };

  const handleOpenEditTask = (task, column) => {
    setTaskModalColumn(column);
    setEditingTask(task);
    setError("");
  };

  const handleCloseTaskModal = () => {
    setTaskModalColumn(null);
    setEditingTask(null);
  };

  // Drag-and-drop handlers.
  const handleDragStart = (event) => {
    const taskId = event.active.id;

    const task = selectedBoard?.columns
      ?.flatMap((column) => column.tasks || [])
      .find((item) => item.id === taskId);

    setActiveDragTask(task || null);
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveDragTask(null);

    if (!over || !selectedBoard || movingTask) return;

    const taskId = active.id;

    const sourceColumn = selectedBoard.columns?.find((column) =>
      column.tasks?.some((task) => task.id === taskId)
    );

    const task = sourceColumn?.tasks?.find(
      (item) => item.id === taskId
    );

    const overData = over.data.current || {};

    const targetColumnId =
      overData.columnId || over.id;

    const targetColumn = selectedBoard.columns?.find(
      (column) => column.id === targetColumnId
    );

    if (!task || !sourceColumn || !targetColumn) return;

    const sourceTasks = sourceColumn.tasks || [];
    const targetTasks = targetColumn.tasks || [];

    const sourceIndex = sourceTasks.findIndex(
      (item) => item.id === taskId
    );

    const destinationWithoutDraggedTask =
      targetTasks.filter((item) => item.id !== taskId);

    let targetPosition = destinationWithoutDraggedTask.length;

    if (overData.type === "task") {
      const overIndex = destinationWithoutDraggedTask.findIndex(
        (item) => item.id === over.id
      );

      if (overIndex >= 0) {
        targetPosition = overIndex;
      }
    }

    if (
      sourceColumn.id === targetColumn.id &&
      sourceIndex === targetPosition
    ) {
      return;
    }

    try {
      setMovingTask(true);
      setError("");

      await api.patch(`/tasks/${task.id}/move`, {
        targetColumnId: targetColumn.id,
        targetPosition,
        version: task.version,
      });

      await reloadSelectedBoard();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to move task. The board will be refreshed."
      );

      try {
        await reloadSelectedBoard();
      } catch {
        // Keep the original move error.
      }
    } finally {
      setMovingTask(false);
    }
  };

  const handleDragCancel = () => {
    setActiveDragTask(null);
  };

  // Called after creating, updating, or deleting a task.
  const handleTaskSaved = async () => {
    try {
      setError("");

      await reloadSelectedBoard();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Task was saved, but the board could not be refreshed."
      );
    }
  };

  // Manual board refresh.
  const refreshBoard = async () => {
    if (!selectedBoard) return;

    try {
      setLoadingBoard(true);
      setError("");

      await reloadSelectedBoard();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to refresh board."
      );
    } finally {
      setLoadingBoard(false);
    }
  };

  // Navigation handlers.
  const handleBackToOrganizations = () => {
    setSelectedOrganization(null);
    setSelectedTenant(null);
    setSelectedBoard(null);
    setTenants([]);
    setBoards([]);
    setTaskModalColumn(null);
    setEditingTask(null);
    setEditingColumnId(null);
    setOnlineUsers([]);
    setTaskHistory([]);
    setError("");
  };

  const handleBackToTenants = () => {
    setSelectedTenant(null);
    setSelectedBoard(null);
    setBoards([]);
    setTaskModalColumn(null);
    setEditingTask(null);
    setEditingColumnId(null);
    setOnlineUsers([]);
    setTaskHistory([]);
    setError("");
  };

  const handleBackToBoards = () => {
    setSelectedBoard(null);
    setTaskHistory([]);
    setTaskModalColumn(null);
    setEditingTask(null);
    setEditingColumnId(null);
    setOnlineUsers([]);
    setError("");
  };

  // Date helpers.
  const formatDate = (date) => {
    if (!date) return "";

    return new Date(date).toLocaleDateString();
  };

  const formatTaskDueDate = (date) => {
    if (!date) return "";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) return "";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsedDate);
  };

  const isTaskOverdue = (date) => {
    if (!date) return false;

    const dueDate = new Date(date);

    if (Number.isNaN(dueDate.getTime())) return false;

    dueDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return dueDate < today;
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <LayoutDashboard />
          <h2>JulleyOnline</h2>
        </div>

        <div className="dashboard-header-actions">
          <span className="user-email">{user?.email}</span>

          <button onClick={logout} className="logout-button">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <h1>Welcome, {user?.name || "User"}</h1>

            <p>
              {selectedBoard
                ? `${selectedBoard.name} â€” Kanban board`
                : selectedTenant
                ? `Select a board in ${selectedTenant.name}.`
                : selectedOrganization
                ? `Select a tenant in ${selectedOrganization.name}.`
                : "Select an organization to access its workspace."}
            </p>
          </div>
        </div>

        {selectedOrganization && (
          <div className="workspace-navigation">
            <button
              className="back-button"
              onClick={handleBackToOrganizations}
            >
              <ArrowLeft size={16} />
              Organizations
            </button>

            {selectedTenant && (
              <button
                className="back-button"
                onClick={handleBackToTenants}
              >
                <ArrowLeft size={16} />
                Tenants
              </button>
            )}

            {selectedBoard && (
              <button
                className="back-button"
                onClick={handleBackToBoards}
              >
                <ArrowLeft size={16} />
                Boards
              </button>
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {!selectedOrganization && (
          <section className="workspace-section">
            <div className="section-heading">
              <h2>Your organizations</h2>
              <span>{organizations.length} organizations</span>
            </div>

            {loadingOrganizations ? (
              <p className="loading-message">
                Loading organizations...
              </p>
            ) : organizations.length === 0 ? (
              <p className="empty-message">
                No organizations are available for your account.
              </p>
            ) : (
              <div className="organization-grid">
                {organizations.map((organization) => (
                  <button
                    className="organization-card"
                    key={organization.id}
                    onClick={() =>
                      handleOrganizationSelect(organization)
                    }
                  >
                    <div className="card-icon">
                      <Building2 size={22} />
                    </div>

                    <div className="card-content">
                      <h3>{organization.name}</h3>

                      <p>
                        {organization.description ||
                          "Organization workspace"}
                      </p>

                      <div className="card-meta">
                        <span>
                          <Users size={14} />
                          {organization._count?.memberships ?? 0} members
                        </span>

                        <span>
                          <MapPin size={14} />
                          {organization._count?.tenants ?? 0} tenants
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedOrganization && !selectedTenant && (
          <section className="workspace-section">
            <div className="section-heading">
              <div>
                <h2>{selectedOrganization.name}</h2>

                <p className="section-description">
                  Select a tenant to access its workspace.
                </p>
              </div>

              <span>{tenants.length} tenants</span>
            </div>

            {loadingTenants ? (
              <p className="loading-message">Loading tenants...</p>
            ) : tenants.length === 0 ? (
              <p className="empty-message">
                No tenants are available in this organization.
              </p>
            ) : (
              <div className="tenant-grid">
                {tenants.map((tenant) => (
                  <button
                    className="tenant-card"
                    key={tenant.id}
                    onClick={() => handleTenantSelect(tenant)}
                  >
                    <div className="card-icon">
                      <MapPin size={22} />
                    </div>

                    <div className="card-content">
                      <h3>{tenant.name}</h3>
                      <p>{tenant.description || "Tenant workspace"}</p>

                      <div className="card-meta">
                        <span>
                          <FolderKanban size={14} />
                          {tenant._count?.boards ?? 0} boards
                        </span>

                        <span>
                          <Users size={14} />
                          {tenant._count?.memberships ?? 0} members
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedTenant && !selectedBoard && (
          <section className="workspace-section">
            <div className="section-heading">
              <div>
                <h2>{selectedTenant.name}</h2>

                <p className="section-description">
                  Select a board or create a new one.
                </p>
              </div>

              {canManageWorkspace && (
                <button
                  className="primary-action-button"
                  onClick={() => setShowCreateBoard(!showCreateBoard)}
                >
                  <Plus size={17} />
                  Create board
                </button>
              )}
            </div>

            {showCreateBoard && (
              <form
                className="create-item-form"
                onSubmit={handleCreateBoard}
              >
                <h3>Create a board</h3>

                <input
                  type="text"
                  placeholder="Board name"
                  value={newBoardName}
                  onChange={(event) =>
                    setNewBoardName(event.target.value)
                  }
                  maxLength={100}
                  required
                />

                <textarea
                  placeholder="Board description (optional)"
                  value={newBoardDescription}
                  onChange={(event) =>
                    setNewBoardDescription(event.target.value)
                  }
                  rows={3}
                />

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-action-button"
                    onClick={() => setShowCreateBoard(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-action-button"
                    disabled={creatingBoard}
                  >
                    {creatingBoard ? "Creating..." : "Create board"}
                  </button>
                </div>
              </form>
            )}

            {loadingBoards ? (
              <p className="loading-message">Loading boards...</p>
            ) : boards.length === 0 ? (
              <p className="empty-message">
                No boards are available in this tenant.
              </p>
            ) : (
              <div className="board-grid">
                {boards.map((board) => (
                  <button
                    className="board-card"
                    key={board.id}
                    onClick={() => handleBoardSelect(board)}
                  >
                    <div className="card-icon">
                      <FolderKanban size={22} />
                    </div>

                    <div className="card-content">
                      <h3>{board.name}</h3>

                      <p>
                        {board.description || "Kanban workspace"}
                      </p>

                      <div className="card-meta">
                        <span>
                          <ListTodo size={14} />
                          {board._count?.columns ?? 0} columns
                        </span>

                        <span>
                          <Calendar size={14} />
                          {formatDate(board.createdAt)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedTenant && selectedBoard && (
          <section className="workspace-section kanban-section">
            <div className="board-toolbar">
              <div>
                <h2>{selectedBoard.name}</h2>

                <p className="section-description">
                  {selectedBoard.description ||
                    "Manage tasks in this workspace."}
                </p>
              </div>

              <div className="board-toolbar-actions">
                {/* Undo latest task operation */}
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => handleTaskHistoryAction("undo")}
                  disabled={
                    !canUndo ||
                    historyLoading ||
                    Boolean(historyAction) ||
                    movingTask
                  }
                  title="Undo your latest task action"
                >
                  <Undo2 size={16} />
                  {historyAction === "undo" ? "Undoing..." : "Undo"}
                </button>

                {/* Redo latest undone task operation */}
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => handleTaskHistoryAction("redo")}
                  disabled={
                    !canRedo ||
                    historyLoading ||
                    Boolean(historyAction) ||
                    movingTask
                  }
                  title="Redo your latest undone task action"
                >
                  <Redo2 size={16} />
                  {historyAction === "redo" ? "Redoing..." : "Redo"}
                </button>

                <button
                  className="secondary-action-button"
                  onClick={refreshBoard}
                  disabled={loadingBoard || movingTask}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>

                {canManageWorkspace && (
                  <button
                    className="primary-action-button"
                    onClick={() =>
                      setShowCreateColumn(!showCreateColumn)
                    }
                  >
                    <Plus size={17} />
                    Add column
                  </button>
                )}
              </div>
            </div>

            {/* Online users presence */}
            <div
              className="board-presence"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                margin: "0 0 18px",
                padding: "10px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                background: "#ffffff",
              }}
              aria-label="Users currently viewing this board"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: "#16a34a",
                    display: "inline-block",
                  }}
                />

                <strong style={{ fontSize: "13px" }}>Online</strong>

                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  ({onlineUsers.length})
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {onlineUsers.length > 0 ? (
                  onlineUsers.map((onlineUser) => {
                    const displayName =
                      onlineUser.name || onlineUser.email || "User";

                    const initials = displayName
                      .split(/[\s@._-]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0].toUpperCase())
                      .join("");

                    return (
                      <span
                        key={onlineUser.id}
                        title={displayName}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          color: "#334155",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "50%",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#e0e7ff",
                            color: "#3730a3",
                            fontWeight: 700,
                            fontSize: "10px",
                          }}
                        >
                          {initials || "U"}
                        </span>

                        <span>{displayName}</span>
                      </span>
                    );
                  })
                ) : (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    No users currently connected.
                  </span>
                )}
              </div>
            </div>

            {showCreateColumn && (
              <form
                className="create-item-form column-form"
                onSubmit={handleCreateColumn}
              >
                <h3>Add a column</h3>

                <input
                  type="text"
                  placeholder="Column name"
                  value={newColumnName}
                  onChange={(event) =>
                    setNewColumnName(event.target.value)
                  }
                  maxLength={100}
                  required
                />

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-action-button"
                    onClick={() => setShowCreateColumn(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-action-button"
                    disabled={creatingColumn}
                  >
                    {creatingColumn ? "Adding..." : "Add column"}
                  </button>
                </div>
              </form>
            )}

            {loadingBoard ? (
              <p className="loading-message">
                Loading board...
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div
                  className={`kanban-board${
                    movingTask ? " is-moving-task" : ""
                  }`}
                >
                  {selectedBoard.columns?.length > 0 ? (
                    selectedBoard.columns.map((column) => (
                      <DroppableColumn
                        className="kanban-column"
                        key={column.id}
                        columnId={column.id}
                      >
                        <div className="kanban-column-header">
                          {editingColumnId === column.id ? (
                            <form
                              className="column-edit-form"
                              onSubmit={(event) =>
                                handleUpdateColumn(event, column.id)
                              }
                            >
                              <input
                                type="text"
                                value={editingColumnName}
                                onChange={(event) =>
                                  setEditingColumnName(event.target.value)
                                }
                                maxLength={100}
                                required
                                autoFocus
                                aria-label="Column name"
                              />

                              <div className="column-edit-actions">
                                <button
                                  type="submit"
                                  disabled={savingColumn}
                                >
                                  <Check size={15} />
                                  {savingColumn ? "Saving..." : "Save"}
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCancelEditColumn}
                                  disabled={savingColumn}
                                >
                                  <X size={15} />
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <h3>{column.name}</h3>

                              <div className="column-header-actions">
                                <span className="task-count">
                                  {column.tasks?.length ?? 0}
                                </span>

                                {canManageWorkspace && (
                                  <>
                                    <button
                                      type="button"
                                      className="add-task-button"
                                      onClick={() =>
                                        handleEditColumn(column)
                                      }
                                      title="Edit column"
                                    >
                                      <Pencil size={14} />
                                    </button>

                                    <button
                                      type="button"
                                      className="add-task-button delete-column-button"
                                      onClick={() =>
                                        handleDeleteColumn(column)
                                      }
                                      disabled={
                                        deletingColumnId === column.id
                                      }
                                      title="Delete column"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}

                                <button
                                  type="button"
                                  className="add-task-button"
                                  onClick={() =>
                                    handleOpenCreateTask(column)
                                  }
                                  title={`Add task to ${column.name}`}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="kanban-task-list">
                          {column.tasks?.length > 0 ? (
                            <SortableContext
                              items={column.tasks.map((task) => task.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {column.tasks.map((task) => (
                                <SortableTaskCard
                                  key={task.id}
                                  task={task}
                                  columnId={column.id}
                                  onEdit={() =>
                                    handleOpenEditTask(task, column)
                                  }
                                  formatDueDate={formatTaskDueDate}
                                  isOverdue={isTaskOverdue(task.dueDate)}
                                />
                              ))}
                            </SortableContext>
                          ) : (
                            <p className="empty-column-message">
                              No tasks in this column.
                            </p>
                          )}
                        </div>
                      </DroppableColumn>
                    ))
                  ) : (
                    <p className="empty-message">
                      This board has no columns yet.
                      {canManageWorkspace &&
                        " Add a column to get started."}
                    </p>
                  )}
                </div>

                <DragOverlay>
                  {activeDragTask ? (
                    <article className="kanban-task-card task-drag-overlay">
                      <strong>{activeDragTask.title}</strong>

                      {activeDragTask.description && (
                        <p>{activeDragTask.description}</p>
                      )}
                    </article>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </section>
        )}
      </main>

      {taskModalColumn && (
        <TaskModal
          column={taskModalColumn}
          task={editingTask}
          onClose={handleCloseTaskModal}
          onCreated={handleTaskSaved}
          onUpdated={handleTaskSaved}
          onDeleted={handleTaskSaved}
        />
      )}
    </div>
  );
}

// Droppable Kanban column.
function DroppableColumn({ columnId, className, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { type: "column", columnId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className}${isOver ? " is-drop-target" : ""}`}
    >
      {children}
    </div>
  );
}

// Sortable task card.
function SortableTaskCard({
  task,
  columnId,
  onEdit,
  formatDueDate,
  isOverdue,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`kanban-task-card${
        isDragging ? " is-dragging" : ""
      }`}
    >
      <div className="task-card-heading">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="task-drag-handle"
          aria-label={`Drag ${task.title}`}
          title="Drag to move task"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>

        <h4>{task.title}</h4>

        <button
          type="button"
          className="edit-task-button"
          onClick={onEdit}
          title="Edit task"
          aria-label={`Edit ${task.title}`}
        >
          <Pencil size={15} />
        </button>
      </div>

      {task.description && <p>{task.description}</p>}

      {task.dueDate && (
        <div
          className={`task-due-date${
            isOverdue ? " overdue" : ""
          }`}
        >
          <Calendar size={13} />
          <span>Due: {formatDueDate(task.dueDate)}</span>
        </div>
      )}

      <div className="task-card-meta">
        {task.priority && (
          <span
            className={`priority-badge priority-${String(
              task.priority
            ).toLowerCase()}`}
          >
            {task.priority}
          </span>
        )}

        <span>v{task.version}</span>
      </div>
    </article>
  );
}
