# 05 — Example API

## 1. Overview

The example API is a standalone Hono-based Todo application living in `packages/example-api/`. It serves two purposes:

1. **Dogfooding** — The Todo API is the canonical example for clip, with a `clip.yaml` in the package root
2. **Integration testing** — `@clip/cli` integration tests start this server and run generated tests against it

## 2. Package Structure

```
packages/example-api/
├── src/
│   ├── index.ts              # Server entry point, Hono app setup
│   ├── routes/
│   │   └── todos.ts          # CRUD route handlers
│   ├── middleware/
│   │   └── auth.ts           # X-API-Key header validation middleware
│   └── store.ts              # In-memory todo storage
├── clip.yaml                 # Schema file for dogfooding
├── package.json
└── tsconfig.json
```

## 3. API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/todos` | List all todos | Yes |
| `POST` | `/todos` | Create a new todo | Yes |
| `GET` | `/todos/:id` | Get a todo by ID | Yes |
| `PATCH` | `/todos/:id` | Update a todo | Yes |
| `DELETE` | `/todos/:id` | Delete a todo | Yes |

## 4. Implementation Details

### Server Entry — `src/index.ts`

```typescript
import { Hono } from "hono";
import { todosRouter } from "./routes/todos";
import { authMiddleware } from "./middleware/auth";

const app = new Hono();

// Apply auth middleware to all /todos routes
app.use("/todos/*", authMiddleware);
app.use("/todos", authMiddleware);

// Mount routes
app.route("/todos", todosRouter);

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3456;
console.log(`Example API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

### Auth Middleware — `src/middleware/auth.ts`

```typescript
import type { MiddlewareHandler } from "hono";

const VALID_API_KEY = process.env.API_KEY || "test-api-key";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey || apiKey !== VALID_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
```

### In-Memory Store — `src/store.ts`

```typescript
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

class TodoStore {
  private todos: Map<string, Todo> = new Map();

  list(): Todo[] {
    return Array.from(this.todos.values());
  }

  get(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(title: string): Todo {
    const id = crypto.randomUUID();
    const todo: Todo = {
      id,
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    this.todos.set(id, todo);
    return todo;
  }

  update(id: string, data: Partial<Pick<Todo, "title" | "completed">>): Todo | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    if (data.title !== undefined) todo.title = data.title;
    if (data.completed !== undefined) todo.completed = data.completed;

    this.todos.set(id, todo);
    return todo;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }

  clear(): void {
    this.todos.clear();
  }
}

export const todoStore = new TodoStore();
```

### Route Handlers — `src/routes/todos.ts`

```typescript
import { Hono } from "hono";
import { todoStore } from "../store";

export const todosRouter = new Hono();

// GET /todos — List all todos
todosRouter.get("/", (c) => {
  return c.json(todoStore.list());
});

// POST /todos — Create a new todo
todosRouter.post("/", async (c) => {
  const body = await c.req.json();
  const { title } = body;

  if (!title || typeof title !== "string") {
    return c.json({ error: "title is required" }, 400);
  }

  const todo = todoStore.create(title);
  return c.json(todo, 201);
});

// GET /todos/:id — Get a todo by ID
todosRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const todo = todoStore.get(id);

  if (!todo) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(todo);
});

// PATCH /todos/:id — Update a todo
todosRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const todo = todoStore.update(id, body);

  if (!todo) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(todo);
});

// DELETE /todos/:id — Delete a todo
todosRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const deleted = todoStore.delete(id);

  if (!deleted) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ deleted: true });
});
```

## 5. Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server listen port |
| `API_KEY` | `"test-api-key"` | Valid API key for authentication |

## 6. clip.yaml for Dogfooding

The `clip.yaml` in `packages/example-api/` mirrors the example from the schema definition doc. This file is used to:

1. Demonstrate the clip workflow: `clip generate` → `clip auth set todo` → `clip test todo`
2. Serve as the fixture for `@clip/cli` integration tests

```yaml
name: "Todo API"
alias: todo
version: "1.0.0"
baseUrl: "http://localhost:3456"
auth:
  type: header
  headerName: "X-API-Key"
endpoints:
  - name: list
    method: GET
    path: /todos
    description: "List all todos"
    response:
      type: array
      items: { type: object, properties: { id: string, title: string, completed: boolean } }
  - name: create
    method: POST
    path: /todos
    description: "Create a new todo"
    params:
      body:
        title: { type: string, required: true }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: get
    method: GET
    path: "/todos/:id"
    description: "Get a todo by ID"
    params:
      path:
        id: { type: string, required: true }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: update
    method: PATCH
    path: "/todos/:id"
    description: "Update a todo"
    params:
      path:
        id: { type: string, required: true }
      body:
        title: { type: string }
        completed: { type: boolean }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: delete
    method: DELETE
    path: "/todos/:id"
    description: "Delete a todo"
    params:
      path:
        id: { type: string, required: true }
```

## 7. Integration Testing Flow

When `@clip/cli` integration tests run:

```
1. Start example-api on random port
2. Set API_KEY env variable
3. Run: clip generate (using example-api/clip.yaml)
4. Run: clip test todo --base-url http://localhost:<port> --api-key <key>
5. Assert all tests pass
6. Shut down example-api
```

The random port prevents conflicts when tests run in parallel.

## 8. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/example-api/src/index.ts` | Create | Hono server entry point |
| `packages/example-api/src/routes/todos.ts` | Create | CRUD route handlers |
| `packages/example-api/src/middleware/auth.ts` | Create | API key validation middleware |
| `packages/example-api/src/store.ts` | Create | In-memory todo storage |
| `packages/example-api/clip.yaml` | Create | Schema for dogfooding |
| `packages/example-api/package.json` | Create | Package manifest |
| `packages/example-api/tsconfig.json` | Create | TypeScript config |

## 9. Test Strategy

### Unit Tests — `packages/example-api/tests/`

**`store.test.ts`**:
- ✅ `create` generates unique IDs
- ✅ `list` returns all todos
- ✅ `get` returns existing todo
- ✅ `get` returns undefined for missing ID
- ✅ `update` modifies title
- ✅ `update` modifies completed status
- ✅ `update` returns null for missing ID
- ✅ `delete` removes todo
- ✅ `delete` returns false for missing ID
- ✅ `clear` empties the store

**`routes.test.ts`**:
- ✅ GET /todos returns empty array initially
- ✅ POST /todos creates a todo and returns 201
- ✅ POST /todos returns 400 without title
- ✅ GET /todos/:id returns existing todo
- ✅ GET /todos/:id returns 404 for missing ID
- ✅ PATCH /todos/:id updates fields
- ✅ DELETE /todos/:id removes todo
- ✅ All endpoints require X-API-Key (401 without it)

### Atomic Commit Plan

1. `feat(example-api): implement in-memory todo store`
2. `feat(example-api): implement auth middleware`
3. `feat(example-api): implement CRUD route handlers`
4. `feat(example-api): add Hono server entry point`
5. `feat(example-api): add clip.yaml for dogfooding`
6. `test(example-api): add unit tests for store`
7. `test(example-api): add unit tests for routes`
