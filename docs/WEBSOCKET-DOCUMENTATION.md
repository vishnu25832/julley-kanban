
## Exact Task Event Names

The task controller broadcasts these events:

| Event | Description |
|---|---|
| `task:created` | A task was created |
| `task:updated` | A task was updated |
| `task:moved` | A task was moved |
| `task:deleted` | A task was deleted |

Undo and redo operations also broadcast the corresponding event based on the resulting task operation.

### Task Event Payload

All task events use the shared `emitTaskEvent` helper and include:

| Field | Description |
|---|---|
| `boardId` | Board identifier |
| `tenantId` | Tenant identifier |
| `task` | Task data, when available |
| `taskId` | Affected task identifier |
| `affectedColumnIds` | Columns affected by the operation |
| `actorId` | User who performed the operation |
| `timestamp` | ISO 8601 event timestamp |

Events are emitted to the corresponding tenant-scoped board room.
