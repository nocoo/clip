import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      headerName: "Authorization",
      headerValue: "Bearer token123",
    });

    const filePath = join(tempDir, "test-perms", "credentials.json");
    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("writes correct JSON content", async () => {
    await storage.saveCredentials("test-content", {
      headerName: "X-API-Key",
      headerValue: "sk-test-value",
    });

    const filePath = join(tempDir, "test-content", "credentials.json");
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      headerName: "X-API-Key",
      headerValue: "sk-test-value",
    });
  });

  it("overwrites existing credentials", async () => {
    await storage.saveCredentials("test-overwrite", {
      headerName: "X-API-Key",
      headerValue: "old-value",
    });
    await storage.saveCredentials("test-overwrite", {
      headerName: "X-API-Key",
      headerValue: "new-value",
    });

    const creds = await storage.loadCredentials("test-overwrite");
    expect(creds?.headerValue).toBe("new-value");
  });
});

describe("loadCredentials", () => {
  it("returns credentials for existing alias", async () => {
    await storage.saveCredentials("test-load", {
      headerName: "X-API-Key",
      headerValue: "sk-load-test",
    });

    const creds = await storage.loadCredentials("test-load");
    expect(creds).toEqual({
      headerName: "X-API-Key",
      headerValue: "sk-load-test",
    });
  });

  it("returns null for nonexistent alias", async () => {
    const creds = await storage.loadCredentials("nonexistent-alias");
    expect(creds).toBeNull();
  });
});

describe("removeCredentials", () => {
  it("deletes the alias directory", async () => {
    await storage.saveCredentials("test-remove", {
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
