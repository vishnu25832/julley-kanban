# JulleyOnline â€“ Real-Time Collaborative Kanban Board

A full-stack, multi-tenant Kanban project management application that enables organizations and their branches to collaborate on tasks in real time. The platform includes role-based access control, live task synchronization, user presence, optimistic concurrency control, and task history with undo and redo.

## Project Overview

JulleyOnline is designed around a hierarchical multi-tenant architecture:

**Organization â†’ Tenant (Branch) â†’ Board â†’ Columns â†’ Tasks**

Users can access resources according to their organization membership, tenant membership, and assigned role. Changes made to tasks are synchronized across connected users through Socket.IO without requiring a page refresh.

## Key Features

### 1. Multi-Tenant Architecture
- Multiple organizations.
- Multiple tenants or branches within an organization.
- Organization-level and tenant-level resource management.
- Strict organization and tenant access isolation.
- Membership-based access control.

### 2. Authentication and Authorization
- User registration and login.
- JWT-based authentication.
- Password hashing using bcrypt.
- Role-based access control.

**Supported roles:**
- `ORG_ADMIN` â€“ Organization-level administration.
- `TENANT_ADMIN` â€“ Tenant-level administration.
- `MEMBER` â€“ Standard tenant membership.

### 3. Kanban Board Management
- Create and manage boards.
- Create, update, and delete columns.
- Create, edit, move, and delete tasks.
- Task priorities: Low, Medium, High, and Urgent.
- Drag-and-drop task movement.
- Task ordering within columns.

### 4. Real-Time Collaboration
- Socket.IO-based real-time communication.
- Authenticated WebSocket connections.
- Tenant-scoped board rooms.
- Real-time task creation, updates, movement, and deletion.
- Online user presence.
- Automatic reconnection and board synchronization.

### 5. Concurrency Handling
- Optimistic concurrency control.
- Task version tracking.
- Detection of stale task updates.
- HTTP 409 conflict responses when concurrent changes conflict.
- Protection against silently overwriting newer task data.

### 6. Undo and Redo
- Task history snapshots.
- User-specific board history.
- Undo and redo operations.
- State restoration with version tracking.
- History isolation between users.

### 7. Activity Logging
- Records task-related actions.
- Tracks the user responsible for an action.
- Associates activity with organization, tenant, board, and task context.

## Technology Stack

### Frontend
- React 19
- Vite
- React Router
- Redux-free React Context-based authentication
- Axios
- Socket.IO Client
- dnd-kit
- Lucide React
- CSS

### Backend
- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- Socket.IO
- JSON Web Tokens (JWT)
- bcrypt
- Zod

### Development Tools
- Visual Studio Code
- Git and GitHub
- npm
- Postman
- PostgreSQL
- Prisma CLI

## Project Structure

```text
julley-kanban/
â”‚
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ prisma/
â”‚   â”‚   â”œâ”€â”€ migrations/
â”‚   â”‚   â””â”€â”€ schema.prisma
â”‚   â”‚
â”‚   â”œâ”€â”€ scripts/
â”‚   â”‚
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â”œâ”€â”€ controllers/
â”‚   â”‚   â”œâ”€â”€ middleware/
â”‚   â”‚   â”œâ”€â”€ realtime/
â”‚   â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â””â”€â”€ utils/
â”‚   â”‚
â”‚   â”œâ”€â”€ server.js
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ package-lock.json
â”‚
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ context/
â”‚   â”‚   â”œâ”€â”€ pages/
â”‚   â”‚   â””â”€â”€ services/
â”‚   â”‚
â”‚   â”œâ”€â”€ index.html
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ package-lock.json
â”‚
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ API-DOCUMENTATION.md
â”‚   â”œâ”€â”€ ER-DIAGRAM.md
â”‚   â””â”€â”€ WEBSOCKET-DOCUMENTATION.md
â”‚
â”œâ”€â”€ .gitignore
â””â”€â”€ README.md
```

## Prerequisites

Install the following before running the application:

- Node.js 18 or later
- npm
- PostgreSQL
- Git

## Installation and Setup

### Step 1: Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd julley-kanban
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with your actual GitHub repository URL.

### Step 2: Configure the Backend

Navigate to the backend directory:

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/julley_kanban?schema=public"

JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=1d
```

Replace the database username, password, and JWT secret with your actual configuration.

### Step 3: Configure PostgreSQL and Prisma

Create a PostgreSQL database named:

```text
julley_kanban
```

Generate the Prisma Client:

```bash
npx prisma generate
```

Apply the existing database migrations:

```bash
npx prisma migrate deploy
```

For local development, Prisma Studio can be opened using:

```bash
npx prisma studio
```

### Step 4: Start the Backend Server

```bash
npm run dev
```

The backend server will run at:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/api/health
```

### Step 5: Configure the Frontend

Open a separate terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
```

Create a `.env` file inside the `frontend` directory:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### Step 6: Start the Frontend

```bash
npm run dev
```

The frontend will run at:

```text
http://localhost:5173
```

Open this address in your browser to access the application.

## API Documentation

The backend provides REST APIs for authentication, organization management, tenant management, boards, columns, tasks, and task history.

| Module | Operations |
|---|---|
| Authentication | Register, Login, Get Current User |
| Organizations | Create and List |
| Tenants | Create, List, Get Details |
| Boards | Create, Read, Update, Delete |
| Columns | Create, Update, Delete |
| Tasks | Create, Read, Update, Move, Delete |
| Task History | Get History, Undo, Redo |

All protected API endpoints require JWT authentication.

See [API Documentation](docs/API-DOCUMENTATION.md) for the endpoint reference.

## WebSocket Documentation

Socket.IO is used for real-time communication between connected clients.

**Implemented functionality:**
- Authenticated socket connections.
- Board room joining and leaving.
- Tenant-scoped room authorization.
- User presence tracking.
- Real-time task events.
- Client reconnection handling.

**Task events:**
- `task:created`
- `task:updated`
- `task:moved`
- `task:deleted`

**Presence events:**
- `board:user-joined`
- `board:user-left`
- `board:presence`

See [WebSocket Documentation](docs/WEBSOCKET-DOCUMENTATION.md) for connection details, event payloads, and room management.

## Database Design

The application uses PostgreSQL with Prisma ORM.

The main database entities are:

1. Organization
2. Tenant
3. User
4. Membership
5. Board
6. BoardColumn
7. Task
8. ActivityLog
9. TaskHistory

**Important database design considerations:**
- Organizations contain multiple tenants.
- Memberships associate users with organizations and tenants.
- Boards belong to organizations and tenants.
- Columns belong to boards.
- Tasks belong to columns.
- Column positions are unique within a board.
- Task positions are unique within a column.
- Task versions support concurrency detection.
- Task history stores snapshots for undo and redo.

See [ER Diagram](docs/ER-DIAGRAM.md) for the database relationships.

## Testing and Verification

Backend verification scripts are available in the `backend` directory.

Run them from the backend directory after configuring the database and starting the backend server.

```bash
node test-task-events.js
node test-task-history.js
node test-undo-redo.js
node test-cross-tenant.js
node test-cross-organization.js
node test-user-history-isolation.js
node test-member-rbac.js
```

### Verified Functionality

The following functionality has been tested during development:

- Backend startup and database connectivity.
- JWT authentication.
- Socket.IO authentication.
- Board room authorization.
- Real-time task creation, update, movement, and deletion.
- User presence updates.
- Cross-tenant access restrictions.
- Cross-organization access restrictions.
- Role-based column creation restrictions.
- Concurrent task update conflict detection.
- User-specific task history isolation.
- Undo and redo operations.
- Frontend production build.
- Real-time synchronization between administrator and member clients.
- Network reconnection and board synchronization.

## Security Considerations

- Passwords are hashed using bcrypt.
- Protected API routes use JWT authentication.
- Organization and tenant membership are checked before resource access.
- Role-based authorization restricts administrative operations.
- Socket.IO connections require authentication.
- Board rooms are scoped to authorized tenants.
- Task version checks detect stale updates.
- Environment variables are excluded from Git version control.

Never commit `.env` files, database credentials, JWT secrets, or other sensitive configuration.

## Deployment

The application is structured for separate frontend and backend deployment.

Suggested deployment architecture:

| Component | Deployment Platform |
|---|---|
| Frontend | Vercel |
| Backend and Socket.IO | Render |
| PostgreSQL Database | Render PostgreSQL |

Production deployment requires configuring:
- Production database connection.
- Backend environment variables.
- Frontend API URL.
- Socket.IO server URL.
- Allowed frontend origin.
- Production JWT secret.
- Prisma production migrations.

## Documentation

- [API Documentation](docs/API-DOCUMENTATION.md)
- [WebSocket Documentation](docs/WEBSOCKET-DOCUMENTATION.md)
- [ER Diagram](docs/ER-DIAGRAM.md)

## Project Objective

The objective of JulleyOnline is to demonstrate the design and implementation of a scalable, real-time collaborative project management platform with multi-tenant architecture, secure access control, reliable task synchronization, and concurrency management.
