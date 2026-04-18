import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;
let storage: typeof import("../../../src/auth/storage");

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-cmd-auth-test-"));
  process.env.CLIP_HOME = tempDir;
  storage = await import("../../../src/auth/storage");
});

afterAll(async () => {
  delete process.env.CLIP_HOME;
  await rm(tempDir, { recursive: true, force: true });
});

describe("authSet", () => {
  it("saves credentials when --key and --header are provided", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    await authSet("test-alias", {
      key: "sk-test-123",
      header: "X-API-Key",
    });

    const creds = await storage.loadCredentials("test-alias");
    expect(creds).toEqual({
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-test-123",
    });
  });

  it("exits with error when no header name and no clip.yaml", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authSet("no-header-alias", { key: "some-key" });
    } catch {
      // Expected — process.exit mock throws
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("--header");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("saves credentials with custom header name", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    await authSet("custom-header-alias", {
      key: "bearer-token-xyz",
      header: "Authorization",
    });

    const creds = await storage.loadCredentials("custom-header-alias");
    expect(creds).toEqual({
      type: "header",
      headerName: "Authorization",
      headerValue: "bearer-token-xyz",
    });
  });
});

describe("authShow", () => {
  it("displays masked credentials for existing alias", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    await storage.saveCredentials("show-test", {
      type: "header",
      headerName: "Authorization",
      headerValue: "Bearer sk-abcdef123456",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authShow("show-test");

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("show-test");
    expect(output).toContain("Authorization");
    // Value should be masked, not plain text
    expect(output).toContain("****");
    expect(output).not.toContain("sk-abcdef123456");
  });

  it("exits with error for nonexistent alias", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authShow("nonexistent-alias");
    } catch {
      // Expected
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("No credentials found");

    process.exit = originalExit;
    console.error = originalError;
  });
});

describe("authRemove", () => {
  it("removes credentials with --force flag", async () => {
    const { authRemove } = await import("../../../src/commands/auth");

    await storage.saveCredentials("remove-test", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-to-remove",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authRemove("remove-test", { force: true });

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("Credentials removed");

    // Verify actually removed
    const creds = await storage.loadCredentials("remove-test");
    expect(creds).toBeNull();
  });

  it("reports error when removing nonexistent alias", async () => {
    const { authRemove } = await import("../../../src/commands/auth");

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    await authRemove("totally-nonexistent", { force: true });

    console.error = originalError;

    expect(errorMock.mock.calls[0][0]).toContain("No credentials found");
  });
});

describe("authLogin", () => {
  const oauthSchema = {
    name: "Test",
    alias: "test-oauth",
    version: "1.0.0",
    baseUrl: "https://example.com",
    auth: {
      type: "oauth" as const,
      tokenParam: "api_key",
      loginPath: "/api/auth/cli",
      headerName: "Authorization",
      headerPrefix: "Bearer",
    },
    endpoints: [
      {
        name: "ping",
        method: "GET" as const,
        path: "/ping",
        description: "Ping",
      },
    ],
  };

  it("saves OAuth credentials when login succeeds", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const performLogin = mock(
      async (deps: { onSaveToken: (t: string) => void }) => {
        deps.onSaveToken("oauth-token-xyz");
        return { success: true, email: "user@example.com" };
      },
    );
    const openBrowser = mock(async () => {});

    await authLogin("login-success", {
      parseSchema: async () => oauthSchema,
      // biome-ignore lint/suspicious/noExplicitAny: test mock typing
      performLogin: performLogin as any,
      openBrowser,
    });

    expect(performLogin).toHaveBeenCalled();
    const creds = await storage.loadCredentials("login-success");
    expect(creds).toEqual({
      type: "oauth",
      token: "oauth-token-xyz",
      email: "user@example.com",
    });
  });

  it("exits with error when login fails", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    const performLogin = mock(async () => ({
      success: false,
      error: "user cancelled",
    }));

    try {
      await authLogin("login-fail", {
        parseSchema: async () => oauthSchema,
        // biome-ignore lint/suspicious/noExplicitAny: test mock typing
        performLogin: performLogin as any,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected — exit mock throws
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("Login failed");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("rejects header-auth schemas", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authLogin("wrong-type", {
        parseSchema: async () => ({
          ...oauthSchema,
          auth: { type: "header" as const, headerName: "X-API-Key" },
        }),
        performLogin: mock(async () => ({ success: true })) as never,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("header authentication");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("uses loginUrl origin and pathname when provided", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const captured: { apiUrl?: string; loginPath?: string } = {};
    const performLogin = mock(
      async (deps: {
        apiUrl: string;
        loginPath: string;
        onSaveToken: (t: string) => void;
      }) => {
        captured.apiUrl = deps.apiUrl;
        captured.loginPath = deps.loginPath;
        deps.onSaveToken("t");
        return { success: true };
      },
    );

    await authLogin("login-url", {
      parseSchema: async () => ({
        ...oauthSchema,
        auth: {
          ...oauthSchema.auth,
          loginUrl: "https://saas.example.org/custom/login",
        },
      }),
      // biome-ignore lint/suspicious/noExplicitAny: test mock typing
      performLogin: performLogin as any,
      openBrowser: mock(async () => {}),
    });

    expect(captured).toEqual({
      apiUrl: "https://saas.example.org",
      loginPath: "/custom/login",
    });
  });
});
