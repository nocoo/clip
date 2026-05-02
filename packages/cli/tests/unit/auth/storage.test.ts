import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// We'll dynamically import the storage module after setting CLIP_HOME
let storage: typeof import("../../../src/auth/storage");
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-auth-test-"));
  process.env.CLIP_HOME = tempDir;
  // Dynamic import so CLIP_HOME is read at module evaluation time
  storage = await import("../../../src/auth/storage");
});

afterAll(async () => {
  delete process.env.CLIP_HOME;
  await rm(tempDir, { recursive: true, force: true });
});

describe("getClipHome", () => {
  it("returns CLIP_HOME when set", () => {
    expect(storage.getClipHome()).toBe(tempDir);
  });

  it("falls back to ~/.clip when CLIP_HOME is not set", () => {
    const original = process.env.CLIP_HOME;
    delete process.env.CLIP_HOME;
    try {
      const result = storage.getClipHome();
      expect(result).toMatch(/\.clip$/);
    } finally {
      process.env.CLIP_HOME = original;
    }
  });
});

describe("saveCredentials", () => {
  it("creates directory with 0700 permissions", async () => {
    await storage.saveCredentials("test-save", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-abc123",
    });

    const dirStat = await stat(join(tempDir, "test-save"));
    expect(dirStat.isDirectory()).toBe(true);
    // 0700 = owner rwx only — check mode bits (mask with 0o777)
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it("writes file with 0600 permissions", async () => {
    await storage.saveCredentials("test-perms", {
      type: "header",
      headerName: "Authorization",
      headerValue: "Bearer token123",
    });

    const filePath = join(tempDir, "test-perms", "credentials.json");
    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("writes correct JSON content", async () => {
    await storage.saveCredentials("test-content", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-test-value",
    });

    const filePath = join(tempDir, "test-content", "credentials.json");
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-test-value",
    });
  });

  it("overwrites existing credentials", async () => {
    await storage.saveCredentials("test-overwrite", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "old-value",
    });
    await storage.saveCredentials("test-overwrite", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "new-value",
    });

    const creds = await storage.loadCredentials("test-overwrite");
    expect(creds?.type).toBe("header");
    if (creds?.type === "header") {
      expect(creds.headerValue).toBe("new-value");
    }
  });
});

describe("loadCredentials", () => {
  it("returns credentials for existing alias", async () => {
    await storage.saveCredentials("test-load", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-load-test",
    });

    const creds = await storage.loadCredentials("test-load");
    expect(creds).toEqual({
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-load-test",
    });
  });

  it("returns null for malformed credentials file", async () => {
    const credPath = await storage.getCredentialsPath("malformed-creds");
    await mkdtemp(join(tempDir, "ignored-")); // ensure tempDir exists
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(credPath), { recursive: true });
    // Write a valid JSON object with no recognizable type/header fields
    await writeFile(credPath, JSON.stringify({ unrelated: "value" }), "utf-8");

    const creds = await storage.loadCredentials("malformed-creds");
    expect(creds).toBeNull();
  });

  it("returns null for nonexistent alias", async () => {
    const creds = await storage.loadCredentials("nonexistent-alias");
    expect(creds).toBeNull();
  });
});

describe("removeCredentials", () => {
  it("deletes the alias directory", async () => {
    await storage.saveCredentials("test-remove", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-remove-me",
    });

    const result = await storage.removeCredentials("test-remove");
    expect(result).toBe(true);

    // Verify directory is gone
    const creds = await storage.loadCredentials("test-remove");
    expect(creds).toBeNull();
  });

  it("returns false for nonexistent alias", async () => {
    const result = await storage.removeCredentials("totally-nonexistent");
    expect(result).toBe(false);
  });
});

describe("maskValue", () => {
  it("masks middle of long strings", () => {
    expect(storage.maskValue("sk-abc12345")).toBe("sk****45");
  });

  it("returns **** for very short strings", () => {
    expect(storage.maskValue("ab")).toBe("****");
    expect(storage.maskValue("abcd")).toBe("****");
  });

  it("masks strings with exactly 5 chars", () => {
    expect(storage.maskValue("abcde")).toBe("ab****de");
  });
});

describe("CLIP_HOME override", () => {
  it("uses custom CLIP_HOME for credential storage", async () => {
    const customHome = await mkdtemp(join(tmpdir(), "clip-custom-home-"));
    const original = process.env.CLIP_HOME;

    try {
      process.env.CLIP_HOME = customHome;
      await storage.saveCredentials("custom-test", {
        type: "header",
        headerName: "X-Key",
        headerValue: "custom-value",
      });

      const filePath = join(customHome, "custom-test", "credentials.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.headerValue).toBe("custom-value");
    } finally {
      process.env.CLIP_HOME = original;
      await rm(customHome, { recursive: true, force: true });
    }
  });
});

describe("OAuth credentials", () => {
  it("saves and loads OAuth credentials with all fields", async () => {
    await storage.saveCredentials("oauth-test", {
      type: "oauth",
      token: "oauth-secret-token",
      email: "user@example.com",
      expiresAt: "2026-12-31T00:00:00Z",
    });

    const creds = await storage.loadCredentials("oauth-test");
    expect(creds).toEqual({
      type: "oauth",
      token: "oauth-secret-token",
      email: "user@example.com",
      expiresAt: "2026-12-31T00:00:00Z",
    });
  });

  it("saves and loads OAuth credentials with only token", async () => {
    await storage.saveCredentials("oauth-minimal", {
      type: "oauth",
      token: "minimal-token",
    });

    const creds = await storage.loadCredentials("oauth-minimal");
    expect(creds).toEqual({ type: "oauth", token: "minimal-token" });
  });

  it("backward-compat: legacy file without type is treated as header", async () => {
    // Write a legacy file directly to disk
    const dir = join(tempDir, "legacy-alias");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "credentials.json"),
      JSON.stringify({ headerName: "X-Legacy", headerValue: "legacy-value" }),
    );

    const creds = await storage.loadCredentials("legacy-alias");
    expect(creds).toEqual({
      type: "header",
      headerName: "X-Legacy",
      headerValue: "legacy-value",
    });
  });
});
