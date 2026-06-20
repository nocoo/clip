import { Hono } from "hono";
import * as store from "./store";

/**
 * Demo bookmark API used as a clip integration target.
 *
 * Auth model:
 * - `Authorization: Bearer <token>` required on every /api/* route
 *   except /api/auth/cli (the browser-login callback) and /health.
 * - Any non-empty bearer token is accepted; the value is echoed back
 *   by /me so tests can prove which header value reached the server.
 */

export interface AppOptions {
  /** Override the login token issued by /api/auth/cli. Default: "demo-token-xyz" */
  loginToken?: string;
}

export function createApp(opts: AppOptions = {}): Hono {
  const loginToken = opts.loginToken ?? "demo-token-xyz";
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  /**
   * Browser-login callback: clip's generated `<alias> login` opens this
   * URL with ?callback=http://localhost:<random>/. We 302 to that callback
   * with ?api_key=<token>, which clip parses and stores as credentials.
   */
  app.get("/api/auth/cli", (c) => {
    const callback = c.req.query("callback");
    if (!callback) {
      return c.json({ error: "missing callback param" }, 400);
    }
    const url = new URL(callback);
    url.searchParams.set("api_key", loginToken);
    return c.redirect(url.toString(), 302);
  });

  // Auth middleware for everything below.
  app.use("/api/*", async (c, next) => {
    /* v8 ignore next -- /api/auth/cli is mounted before this middleware,
       so this defensive bypass is unreachable but kept for clarity. */
    if (c.req.path === "/api/auth/cli") return next();
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ") || auth === "Bearer ") {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("token" as never, auth.slice("Bearer ".length));
    return next();
  });

  app.get("/api/me", (c) => {
    const token = c.get("token" as never) as string;
    return c.json({ token, email: "demo@example.com" });
  });

  app.get("/api/bookmarks", (c) => {
    const tag = c.req.query("tag") || undefined;
    const archivedRaw = c.req.query("archived");
    const limitRaw = c.req.query("limit");
    const archived =
      archivedRaw === undefined ? undefined : archivedRaw === "true";
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limit !== undefined && !Number.isFinite(limit)) {
      return c.json({ error: "limit must be a number" }, 400);
    }
    return c.json(store.list({ tag, archived, limit }));
  });

  app.get("/api/bookmarks/:id", (c) => {
    const bm = store.get(c.req.param("id"));
    if (!bm) return c.json({ error: "not found" }, 404);
    return c.json(bm);
  });

  app.post("/api/bookmarks", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    if (typeof body.url !== "string" || typeof body.title !== "string") {
      return c.json({ error: "url and title are required strings" }, 400);
    }
    const bm = store.create({
      url: body.url,
      title: body.title,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return c.json(bm, 201);
  });

  app.patch("/api/bookmarks/:id", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const bm = store.update(c.req.param("id"), {
      url: typeof body.url === "string" ? body.url : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      notes:
        body.notes === null
          ? null
          : typeof body.notes === "string"
            ? body.notes
            : undefined,
    });
    if (!bm) return c.json({ error: "not found" }, 404);
    return c.json(bm);
  });

  app.delete("/api/bookmarks/:id", (c) => {
    const ok = store.remove(c.req.param("id"));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ deleted: true });
  });

  app.post("/api/bookmarks/:id/archive", (c) => {
    const bm = store.archive(c.req.param("id"));
    if (!bm) return c.json({ error: "not found" }, 404);
    return c.json(bm);
  });

  app.get("/api/tags", (c) => c.json(store.tags()));

  return app;
}

export { store };

/* v8 ignore start -- only executed when run directly */
if (import.meta.main) {
  const port = Number(process.env.PORT ?? "3100");
  store.reset();
  const app = createApp();
  process.stdout.write(`demo-app listening on http://localhost:${port}\n`);
  Bun.serve({ port, fetch: app.fetch });
}
/* v8 ignore stop */
