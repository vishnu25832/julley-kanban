# JulleyOnline – API Documentation

## 1. Overview

JulleyOnline provides REST APIs for managing organizations, tenants, users, Kanban boards, columns, tasks, and task history.

**Local API Base URL:**

`http://localhost:5000/api`

## 2. Authentication

Protected endpoints require a valid JWT access token.

**Authorization header:**

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Authentication Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a user with a new organization and tenant |
| POST | `/auth/login` | Authenticate a user |
| GET | `/auth/me` | Retrieve authenticated user information |

## 3. Organization Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/organizations` | Retrieve accessible organizations |
| POST | `/organizations` | Create an organization |

## 4. Tenant Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/organizations/:organizationId/tenants` | Retrieve tenants belonging to an organization |
| POST | `/organizations/:organizationId/tenants` | Create a tenant |
| GET | `/tenants/:tenantId` | Retrieve tenant details |

## 5. Board Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tenants/:tenantId/boards` | Retrieve boards within a tenant |
| POST | `/tenants/:tenantId/boards` | Create a board |
| GET | `/boards/:boardId` | Retrieve board details |
| PATCH | `/boards/:boardId` | Update a board |
| DELETE | `/boards/:boardId` | Delete a board |

## 6. Column Management

| Method | Endpoint | Description |
|---|---|---|
| POST | `/boards/:boardId/columns` | Create a column |
| PATCH | `/columns/:columnId` | Update a column |
| DELETE | `/columns/:columnId` | Delete a column |

## 7. Task Management

| Method | Endpoint | Description |
|---|---|---|
| POST | `/columns/:columnId/tasks` | Create a task |
| GET | `/columns/:columnId/tasks` | Retrieve tasks in a column |
| GET | `/tasks/:taskId` | Retrieve task details |
| PATCH | `/tasks/:taskId` | Update a task |
| PATCH | `/tasks/:taskId/move` | Move a task between columns |
| DELETE | `/tasks/:taskId` | Delete a task |

### Task Priorities

- LOW
- MEDIUM
- HIGH
- URGENT

### Concurrency Handling

Tasks maintain a version number to support optimistic concurrency control.

When a client attempts to update a task using a stale version, the server rejects the conflicting update with HTTP `409 Conflict`.

## 8. Task History and Undo/Redo

| Method | Endpoint | Description |
|---|---|---|
| POST | `/boards/:boardId/undo` | Undo the current user's latest applicable board action |
| POST | `/boards/:boardId/redo` | Redo the current user's latest undoable board action |
| GET | `/boards/:boardId/history` | Retrieve the current user's board history |

Task history stores state snapshots and supports user-specific undo and redo operations.

## 9. Health Check Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Root server endpoint |
| GET | `/api/health` | API health check |

## 10. Authorization and Security

The application implements JWT authentication and role-based access control.

### Supported Roles

| Role | Description |
|---|---|
| ORG_ADMIN | Organization-level administrator |
| TENANT_ADMIN | Tenant-level administrator |
| MEMBER | Standard tenant member |

### Access Control

- Protected endpoints require authentication.
- Organization membership is checked before accessing organization resources.
- Tenant membership is checked before accessing tenant resources.
- Board access is restricted to authorized users.
- Administrative operations are restricted by role.
- Task history is scoped to the authenticated user and board.
- Socket.IO rooms use tenant and board authorization.

## 11. HTTP Status Codes

| Status | Description |
|---|---|
| 200 | Request successful |
| 201 | Resource created |
| 400 | Invalid request |
| 401 | Authentication required or invalid |
| 403 | Access denied |
| 404 | Resource not found |
| 409 | Concurrent update conflict |
| 500 | Internal server error |

## 12. Related Documentation

- [Database ER Diagram](ER-DIAGRAM.md)
- [WebSocket Documentation](WEBSOCKET-DOCUMENTATION.md)

**Implementation note:** This document lists the implemented endpoint paths and methods. Exact request and response schemas should be verified against the corresponding backend controllers rather than assumed.