import { beforeEach, describe, expect, it } from "vitest";
import { createApp, store } from "../../src/index";

const TOKEN = "test-token-1";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function appReq(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return await app.fetch(new Request(`http://localhost${path}`, init));
}

describe("demo-app", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store.reset();
    app = createApp();
  });

  describe("public routes", () => {
    it("/health returns ok without auth", async () => {
      const res = await appReq(app, "/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });

    it("/api/auth/cli redirects with api_key", async () => {
      const callback = "http://localhost:9999/cb";
      const res = await appReq(
        app,
        `/api/auth/cli?callback=${encodeURIComponent(callback)}`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      expect(location).toContain("api_key=demo-token-xyz");
      expect(location.startsWith(callback)).toBe(true);
    });

    it("/api/auth/cli with custom token", async () => {
      const customApp = createApp({ loginToken: "custom-1" });
      const res = await appReq(
        customApp,
        "/api/auth/cli?callback=http%3A%2F%2Flocalhost%2F",
        { redirect: "manual" },
      );
      expect(res.headers.get("location")).toContain("api_key=custom-1");
    });

    it("/api/auth/cli without callback errors", async () => {
      const res = await appReq(app, "/api/auth/cli");
      expect(res.status).toBe(400);
    });
  });

  describe("auth middleware", () => {
    it("rejects missing Authorization", async () => {
      const res = await appReq(app, "/api/me");
      expect(res.status).toBe(401);
    });

    it("rejects non-Bearer scheme", async () => {
      const res = await appReq(app, "/api/me", {
        headers: { Authorization: "Basic abc" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects empty Bearer", async () => {
      const res = await appReq(app, "/api/me", {
        headers: { Authorization: "Bearer " },
      });
      expect(res.status).toBe(401);
    });

    it("/api/me echoes the bearer token", async () => {
      const res = await appReq(app, "/api/me", { headers: AUTH });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        token: TOKEN,
        email: "demo@example.com",
      });
    });
  });

  describe("bookmarks CRUD", () => {
    it("lists all bookmarks", async () => {
      const res = await appReq(app, "/api/bookmarks", { headers: AUTH });
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(3);
    });

    it("filters by tag", async () => {
      const res = await appReq(app, "/api/bookmarks?tag=js", { headers: AUTH });
      const body = (await res.json()) as Array<{ tags: string[] }>;
      expect(body.length).toBe(2);
      expect(body.every((b) => b.tags.includes("js"))).toBe(true);
    });

    it("filters by archived", async () => {
      const res = await appReq(app, "/api/bookmarks?archived=true", {
        headers: AUTH,
      });
      const body = (await res.json()) as Array<{ archived: boolean }>;
      expect(body.length).toBe(1);
      expect(body[0].archived).toBe(true);
    });

    it("limits results", async () => {
      const res = await appReq(app, "/api/bookmarks?limit=2", {
        headers: AUTH,
      });
      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(2);
    });

    it("rejects non-numeric limit", async () => {
      const res = await appReq(app, "/api/bookmarks?limit=abc", {
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });

    it("gets a bookmark by id", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1", { headers: AUTH });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; title: string };
      expect(body.id).toBe("bm_1");
      expect(body.title).toBe("Bun");
    });

    it("404 for missing bookmark", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_999", {
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });

    it("creates a bookmark", async () => {
      const res = await appReq(app, "/api/bookmarks", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com",
          title: "Example",
          tags: ["test"],
          notes: "hi",
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; url: string };
      expect(body.id).toMatch(/^bm_/);
      expect(body.url).toBe("https://example.com");
    });

    it("rejects POST with invalid JSON", async () => {
      const res = await appReq(app, "/api/bookmarks", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: "not-json",
      });
      expect(res.status).toBe(400);
    });

    it("rejects POST without required fields", async () => {
      const res = await appReq(app, "/api/bookmarks", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "x" }),
      });
      expect(res.status).toBe(400);
    });

    it("updates a bookmark partially", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bun v1" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { title: string; url: string };
      expect(body.title).toBe("Bun v1");
      expect(body.url).toBe("https://bun.sh");
    });

    it("PATCH supports clearing notes to null", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_2", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: null }),
      });
      const body = (await res.json()) as { notes: string | null };
      expect(body.notes).toBeNull();
    });

    it("PATCH rejects invalid JSON", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: "{",
      });
      expect(res.status).toBe(400);
    });

    it("PATCH 404 for missing id", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_999", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });
      expect(res.status).toBe(404);
    });

    it("PATCH accepts tags array", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ tags: ["a", "b"] }),
      });
      const body = (await res.json()) as { tags: string[] };
      expect(body.tags).toEqual(["a", "b"]);
    });

    it("deletes a bookmark", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1", {
        method: "DELETE",
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      const after = await appReq(app, "/api/bookmarks/bm_1", { headers: AUTH });
      expect(after.status).toBe(404);
    });

    it("DELETE 404 for missing id", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_999", {
        method: "DELETE",
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });

    it("archives a bookmark", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_1/archive", {
        method: "POST",
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { archived: boolean };
      expect(body.archived).toBe(true);
    });

    it("archive 404 for missing id", async () => {
      const res = await appReq(app, "/api/bookmarks/bm_999/archive", {
        method: "POST",
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });

    it("/api/tags returns sorted distinct tags", async () => {
      const res = await appReq(app, "/api/tags", { headers: AUTH });
      const body = (await res.json()) as string[];
      expect(body).toEqual(["framework", "js", "runtime", "ts", "validation"]);
    });

    it("POST treats non-array tags + non-string notes as undefined", async () => {
      const res = await appReq(app, "/api/bookmarks", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://x.com",
          title: "X",
          tags: "not-array",
          notes: 42,
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { tags: string[]; notes: null };
      expect(body.tags).toEqual([]);
      expect(body.notes).toBeNull();
    });

    it("PATCH ignores non-string url/title and non-array tags", async () => {
      const before = await appReq(app, "/api/bookmarks/bm_1", {
        headers: AUTH,
      });
      const beforeBody = (await before.json()) as {
        url: string;
        title: string;
        tags: string[];
        notes: string | null;
      };

      const res = await appReq(app, "/api/bookmarks/bm_1", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ url: 1, title: 2, tags: "x", notes: 7 }),
      });
      const body = (await res.json()) as {
        url: string;
        title: string;
        tags: string[];
        notes: string | null;
      };
      expect(body.url).toBe(beforeBody.url);
      expect(body.title).toBe(beforeBody.title);
      expect(body.tags).toEqual(beforeBody.tags);
      expect(body.notes).toBe(beforeBody.notes ?? null);
    });

    it("store.update returns null for missing id (direct)", () => {
      const result = store.update("bm_missing", { title: "x" });
      expect(result).toBeNull();
    });
  });
});
