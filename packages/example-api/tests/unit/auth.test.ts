import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { authMiddleware } from "../../src/middleware/auth";

function createTestApp() {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns 401 when X-API-Key header is missing", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when X-API-Key header has an invalid value", async () => {
    const res = await app.request("/test", {
      headers: { "X-API-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("allows request with valid API key (default: test-api-key)", async () => {
    const res = await app.request("/test", {
      headers: { "X-API-Key": "test-api-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
