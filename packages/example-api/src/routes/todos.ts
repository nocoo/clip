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
