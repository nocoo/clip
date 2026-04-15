import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { todosRouter } from "../../src/routes/todos";
import { todoStore } from "../../src/store";

const API_KEY = "test-api-key";

function createApp() {
  const app = new Hono();
  app.use("/todos/*", authMiddleware);
  app.use("/todos", authMiddleware);
  app.route("/todos", todosRouter);
  return app;
}

function authHeaders(): Record<string, string> {
  return { "X-API-Key": API_KEY };
}

describe("Todo Routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    todoStore.clear();
    app = createApp();
  });

  describe("GET /todos", () => {
    it("returns empty array initially", async () => {
      const res = await app.request("/todos", { headers: authHeaders() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns 401 without API key", async () => {
      const res = await app.request("/todos");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /todos", () => {
    it("creates a todo and returns 201", async () => {
      const res = await app.request("/todos", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New todo" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe("New todo");
      expect(body.completed).toBe(false);
      expect(body.id).toBeDefined();
    });

    it("returns 400 without title", async () => {
      const res = await app.request("/todos", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("title is required");
    });

    it("returns 400 with non-string title", async () => {
      const res = await app.request("/todos", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: 123 }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 401 without API key", async () => {
      const res = await app.request("/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "No auth" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /todos/:id", () => {
    it("returns an existing todo", async () => {
      const created = todoStore.create("Existing");
      const res = await app.request(`/todos/${created.id}`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(created.id);
      expect(body.title).toBe("Existing");
    });

    it("returns 404 for a missing ID", async () => {
      const res = await app.request("/todos/non-existent", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Not found");
    });

    it("returns 401 without API key", async () => {
      const res = await app.request("/todos/some-id");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /todos/:id", () => {
    it("updates fields of an existing todo", async () => {
      const created = todoStore.create("Original");
      const res = await app.request(`/todos/${created.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated", completed: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Updated");
      expect(body.completed).toBe(true);
    });

    it("returns 404 for a missing ID", async () => {
      const res = await app.request("/todos/non-existent", {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nope" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 when completed is not a boolean", async () => {
      const created = todoStore.create("Validate me");
      const res = await app.request(`/todos/${created.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ completed: "yes" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("completed must be a boolean");
    });

    it("returns 400 when title is not a string", async () => {
      const created = todoStore.create("Validate me");
      const res = await app.request(`/todos/${created.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: 123 }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("title must be a string");
    });

    it("ignores unknown fields", async () => {
      const created = todoStore.create("Original");
      const res = await app.request(`/todos/${created.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated",
          unknownField: "should be ignored",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Updated");
      expect((body as Record<string, unknown>).unknownField).toBeUndefined();
    });

    it("returns 401 without API key", async () => {
      const res = await app.request("/todos/some-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "No auth" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /todos/:id", () => {
    it("deletes an existing todo", async () => {
      const created = todoStore.create("To delete");
      const res = await app.request(`/todos/${created.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/todos/${created.id}`, {
        headers: authHeaders(),
      });
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for a missing ID", async () => {
      const res = await app.request("/todos/non-existent", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
    });

    it("returns 401 without API key", async () => {
      const res = await app.request("/todos/some-id", { method: "DELETE" });
      expect(res.status).toBe(401);
    });
  });
});
