import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { todosRouter } from "./routes/todos";

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
