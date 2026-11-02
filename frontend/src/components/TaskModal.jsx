
import React, { useEffect, useState } from "react";
import { X, Plus, Save, Trash2 } from "lucide-react";
import api from "../services/api";

export default function TaskModal({
  column,
  task = null,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}) {
  const isEditing = Boolean(task);

  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(
    task?.description || ""
  );
  const [priority, setPriority] = useState(
    task?.priority || "MEDIUM"
  );
  const [dueDate, setDueDate] = useState(
    task?.dueDate
      ? new Date(task.dueDate).toISOString().slice(0, 10)
      : ""
  );

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTitle(task?.title || "");
    setDescription(task?.description || "");
    setPriority(task?.priority || "MEDIUM");
    setDueDate(
      task?.dueDate
        ? new Date(task.dueDate).toISOString().slice(0, 10)
        : ""
    );
    setError("");
  }, [task]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }

    if (isEditing && task.version === undefined) {
      setError("Task version is missing. Refresh the board and try again.");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueDate: dueDate
        ? new Date(`${dueDate}T00:00:00`).toISOString()
        : null,
    };

    try {
      setSubmitting(true);

      let response;

      if (isEditing) {
        response = await api.patch(`/tasks/${task.id}`, {
          ...payload,
          version: task.version,
        });

        onUpdated?.(response.data.data);
      } else {
        response = await api.post(
          `/columns/${column.id}/tasks`,
          payload
        );

        onCreated?.(response.data.data);
      }

      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Unable to ${isEditing ? "update" : "create"} task.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing || submitting || deleting) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${task.title}"? This action can be undone using the Undo button.`
    );

    if (!confirmed) return;

    setError("");

    try {
      setDeleting(true);

      await api.delete(`/tasks/${task.id}`);

      onDeleted?.(task.id);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to delete task."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="task-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{isEditing ? "Edit task" : "Create task"}</h2>
            <p>
              {isEditing
                ? "Update the task details."
                : `Add a task to ${column.name}`}
            </p>
          </div>

          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close"
            disabled={submitting || deleting}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="task-title">Task title</label>
          <input
            id="task-title"
            type="text"
            placeholder="e.g. Implement user authentication"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            autoFocus
            disabled={submitting || deleting}
          />

          <label htmlFor="task-description">Description</label>
          <textarea
            id="task-description"
            placeholder="Describe what needs to be done..."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={4}
            disabled={submitting || deleting}
          />

          <label htmlFor="task-priority">Priority</label>
          <select
            id="task-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={submitting || deleting}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={submitting || deleting}
          />

          <div className="modal-actions">
            {isEditing && (
              <button
                type="button"
                className="secondary-action-button"
                onClick={handleDelete}
                disabled={submitting || deleting}
                style={{
                  marginRight: "auto",
                  color: "#dc2626",
                  borderColor: "#fecaca",
                }}
              >
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Delete task"}
              </button>
            )}

            <button
              type="button"
              className="secondary-action-button"
              onClick={onClose}
              disabled={submitting || deleting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-action-button"
              disabled={submitting || deleting}
            >
              {isEditing ? (
                <Save size={16} />
              ) : (
                <Plus size={16} />
              )}

              {submitting
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                ? "Save changes"
                : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
